// The safe move between two records (spec 4.7): one Firestore transaction that
// reads both records, plans the move with the pure rules against what it read
// (`lubecMovePlan`), and writes both, or nothing. Two players moving things
// into one carrier at once cannot both pass the same room check, because
// Firestore retries the loser against the new contents.
//
// A sheet's store keeps a local copy and holds a save for half a second, so a
// transaction behind it could be overwritten by that save. The move first
// sends the sheet's waiting save and waits for it to land, and afterwards
// waits for the sheet's snapshot that carries the move, so the store's copy
// has it before the page takes another edit.

import {
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase/firestore'
import {
  campaignDocRef,
  campaignGmItemRef,
  campaignSharedCarrierRef,
  characterHiddenCarrierRef,
  npcSheetRef,
  type CampaignScope,
} from '../../campaign/firestorePaths'
import { lubecCharacterVersioning } from '../../ruleSets/characterMigrations'
import { assertCharacterAtCurrentVersion, characterSchemaStamp } from '../../ruleSets/characterSchemaStamp'
import type { StoredCharacter } from '../../ruleSets/storedCharacter'
import {
  lubecMovePlan,
  type LubecMove,
  type LubecMoveRecord,
  type LubecRecordRef,
} from '../../ruleSets/lubec/gear/containers'
import { parseLubecCarrierRecord, parseLubecGear, type LubecCarrierRecord } from '../../ruleSets/lubec/gear/gearRecord'
import { parseLubecGmItem, type LubecGmItem } from '../../ruleSets/lubec/gear/gmItem'

/** The store that saves the sheets a move writes, as `useCharacterStore` gives it. */
export type LubecMoveStore = {
  /** Sends the sheet's waiting save now: the store's `updateCharacterNow`. */
  sendSaveNow: (sheetId: string) => void
  /** True while a save of the sheet waits out its delay or is in flight. */
  hasPendingWrite: (sheetId: string) => boolean
}

export type LubecMoveRequest = {
  scope: CampaignScope
  from: LubecRecordRef
  to: LubecRecordRef
  move: LubecMove
  store: LubecMoveStore
}

export type LubecMoveResult = { ok: true } | { ok: false; msg: string }

type Ref = DocumentReference<DocumentData>

/** A record as the transaction read it, and the save time it carried. */
type Read = { record: LubecMoveRecord; updatedAt: unknown }

type Moved = { ok: true; sheets: { ref: Ref; updatedAt: unknown }[] } | { ok: false; msg: string }

const sheetIdOf = (ref: LubecRecordRef): string | null => {
  if (ref.kind === 'character') return ref.characterId
  return ref.kind === 'npc' ? ref.npcId : null
}

// A GM item's document is the item's own id, whether it is dropped there or given from there.
function recordRef(db: Firestore, scope: CampaignScope, ref: LubecRecordRef, itemId: string): Ref {
  switch (ref.kind) {
    case 'character': return campaignDocRef(db, scope, 'characters', ref.characterId)
    case 'npc': return npcSheetRef(db, scope, ref.npcId)
    case 'shared': return campaignSharedCarrierRef(db, scope, ref.carrierId)
    case 'hidden': return characterHiddenCarrierRef(db, scope, ref.characterId, ref.carrierId)
    case 'gm-items': return campaignGmItemRef(db, scope, itemId)
  }
}

function recordFrom(ref: LubecRecordRef, data: DocumentData | null, id: string): LubecMoveRecord {
  if (ref.kind === 'gm-items') return { kind: 'gm-items', item: data && parseLubecGmItem(data, id) }
  if (ref.kind === 'shared' || ref.kind === 'hidden') return { kind: ref.kind, carrier: data && parseLubecCarrierRecord(data, id) }
  if (data) assertCharacterAtCurrentVersion(data as StoredCharacter, lubecCharacterVersioning)
  return { kind: ref.kind, gear: data && parseLubecGear(data.lubec?.gear) }
}

// A drop is never read first: a member may not read a dropped item, and the document it makes is new.
async function readRecord(tx: Transaction, doc: Ref, ref: LubecRecordRef, isSource: boolean): Promise<Read> {
  if (ref.kind === 'gm-items' && !isSource) return { record: { kind: 'gm-items', item: null }, updatedAt: null }
  const snap = await tx.get(doc)
  const data = snap.exists() ? snap.data() : null
  return { record: recordFrom(ref, data, snap.id), updatedAt: data?.updatedAt }
}

/** A value as Firestore stores it: no `undefined` anywhere in it. */
const stored = <T>(value: T): T => JSON.parse(JSON.stringify(value))

function writeGmItem(tx: Transaction, doc: Ref, before: LubecGmItem | null, after: LubecGmItem | null) {
  if (after && !before) tx.set(doc, { ...stored(after), createdAt: serverTimestamp() })
  if (before && !after) tx.delete(doc)
}

// A sheet's write carries the version stamp and merges, so the rest of `lubec` is left alone and the arrays go whole.
function writeRecord(tx: Transaction, doc: Ref, before: LubecMoveRecord, after: LubecMoveRecord) {
  const at = serverTimestamp()
  if ('gear' in after) {
    tx.set(doc, { lubec: { gear: stored(after.gear) }, ...characterSchemaStamp(lubecCharacterVersioning), updatedAt: at }, { merge: true })
  } else if ('carrier' in after) {
    tx.set(doc, { items: stored((after.carrier as LubecCarrierRecord).items), updatedAt: at }, { merge: true })
  } else {
    writeGmItem(tx, doc, (before as typeof after).item, after.item)
  }
}

async function moveInTransaction(tx: Transaction, docs: readonly [Ref, Ref], request: LubecMoveRequest): Promise<Moved> {
  const reads = await Promise.all([readRecord(tx, docs[0], request.from, true), readRecord(tx, docs[1], request.to, false)])
  const plan = lubecMovePlan(reads[0].record, reads[1].record, request.move)
  if (!plan.ok) return plan
  writeRecord(tx, docs[0], reads[0].record, plan.from)
  writeRecord(tx, docs[1], reads[1].record, plan.to)
  const sheets = [request.from, request.to].flatMap((ref, n) => (sheetIdOf(ref) ? [{ ref: docs[n], updatedAt: reads[n].updatedAt }] : []))
  return { ok: true, sheets }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 25))

/** Sends each sheet's waiting save, and waits until none of them has a save outstanding. */
async function quietSheets(store: LubecMoveStore, sheetIds: readonly string[]) {
  sheetIds.forEach((id) => store.sendSaveNow(id))
  while (sheetIds.some((id) => store.hasPendingWrite(id))) await settle()
}

type Stamp = { seconds: number; nanoseconds: number }

const isStamp = (value: unknown): value is Stamp =>
  typeof (value as Stamp | null)?.seconds === 'number' && typeof (value as Stamp).nanoseconds === 'number'

// Every write to a sheet stamps the server time, so a save time later than the one the move read is the move's or newer.
const isLater = (at: unknown, before: unknown): boolean =>
  isStamp(at) && (!isStamp(before) || at.seconds > before.seconds || (at.seconds === before.seconds && at.nanoseconds > before.nanoseconds))

/** Resolves on the first snapshot of `doc` that carries a save later than `before`. */
function snapshotAfter(doc: Ref, before: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const stop = onSnapshot(doc, (snap) => {
      if (snap.metadata.hasPendingWrites || !isLater(snap.get('updatedAt'), before)) return
      stop()
      resolve()
    }, reject)
  })
}

/**
 * Moves `request.move.itemId` from one record to another in one transaction.
 * Resolves with the reason when the move is refused, in which case nothing was
 * written. Rejects when Firestore refuses a write, which also writes nothing.
 */
export async function lubecMoveBetween(db: Firestore, request: LubecMoveRequest): Promise<LubecMoveResult> {
  const { scope, from, to, move } = request
  const docs = [recordRef(db, scope, from, move.itemId), recordRef(db, scope, to, move.itemId)] as const
  if (docs[0].path === docs[1].path) throw new Error('A move between records needs two records.')
  await quietSheets(request.store, [from, to].flatMap((ref) => sheetIdOf(ref) ?? []))
  const moved = await runTransaction(db, (tx) => moveInTransaction(tx, docs, request))
  if (!moved.ok) return moved
  await Promise.all(moved.sheets.map(({ ref, updatedAt }) => snapshotAfter(ref, updatedAt)))
  return { ok: true }
}
