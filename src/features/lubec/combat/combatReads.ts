import { doc, type Firestore, type Transaction } from 'firebase/firestore'
import { campaignDocRef } from '../../campaign/firestorePaths'
import { parseLubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import { readSheetRevision } from '../../character/characterStore/sheetIntention'
import { combatSheetCollection, combatSheetRecord } from './combatSheetRecord'
import { combatantKey } from './engine/inputs'
import type { CombatAuthority, CombatCommand, Combatant, CombatantSelection, CombatFight, CombatRecords, CombatSheet, FloorSelection, StartPayload } from './engine/types'

export const combatRef = (db: Firestore, command: CombatCommand, ...segments: string[]) => campaignDocRef(db, command.envelope, ...segments)

/** Mirrors `isCampaignGm` in firestore.rules; rules already refuse non-members these reads. */
export async function readCombatAuthority(db: Firestore, tx: Transaction, command: CombatCommand, userId: string): Promise<CombatAuthority> {
  const campaign = await tx.get(combatRef(db, command))
  const member = await tx.get(doc(db, 'groups', command.envelope.groupId, 'members', userId))
  const gm = member.get('role') === 'admin' || campaign.get('gmUserId') === userId
  return { userId, isGm: member.get('status') === 'active' && gm }
}

type ReadSheet = { record: CombatSheet; raw: Record<string, unknown> }

async function readSheet(db: Firestore, tx: Transaction, command: CombatCommand, selection: CombatantSelection): Promise<ReadSheet | null> {
  const snap = await tx.get(combatRef(db, command, combatSheetCollection(selection), selection.sheetId))
  if (!snap.exists()) return null
  const npc = selection.kind === 'npc' ? (await tx.get(combatRef(db, command, 'npcs', selection.sheetId))).data() : undefined
  return { record: { ...combatSheetRecord(selection, snap.id, snap.data(), npc), revision: readSheetRevision(snap.data()) }, raw: snap.data() }
}

/** A sheet that is missing, unparseable or at another schema version is a repair the engine names. */
async function readableSheet(db: Firestore, tx: Transaction, command: CombatCommand, selection: CombatantSelection): Promise<ReadSheet | null> {
  try {
    return await readSheet(db, tx, command, selection)
  } catch (error) {
    if (isTransportError(error)) throw error
    return null
  }
}

/** Firestore's own failures (denied, unavailable, aborted) are not an unreadable sheet. */
const isTransportError = (error: unknown) => (error as Error | null)?.name === 'FirebaseError'

function detachedIds(fight: CombatFight | null): string[] {
  if (!fight) return []
  return [...fight.state.floor, ...(fight.state.attack?.detached ?? [])].map((record) => record.item.id)
}

/** GM Items and private sheets are GM-only reads; other callers are refused by the engine instead. */
function itemDependencies(command: CombatCommand, fight: CombatFight | null): string[] {
  if (command.payload.type === 'end') return detachedIds(fight)
  const floor = (command.payload.floor ?? []) as FloorSelection[]
  return floor.map((selection) => selection.itemId)
}

type SheetDependency = (command: CombatCommand, fight: CombatFight | null, authority: CombatAuthority) => CombatantSelection[]

const gmOnly = (authority: CombatAuthority, selections: CombatantSelection[]) => (authority.isGm ? selections : [])

const readsSheet = (attacker: Combatant, authority: CombatAuthority) =>
  authority.isGm || (attacker.kind === 'character' && attacker.ownerUserId === authority.userId)

const actorOf = (command: CombatCommand, fight: CombatFight | null): Combatant | undefined =>
  fight?.state.combatants.find((combatant) => combatant.key === command.envelope.actorKey)

/** The acting combatant's own sheet: the owner reads their character, the GM any sheet; nobody else reads one. */
const actorSheet: SheetDependency = (command, fight, authority) => {
  const actor = actorOf(command, fight)
  return actor && readsSheet(actor, authority) ? [{ kind: actor.kind, sheetId: actor.sheetId }] : []
}

const SHEET_DEPENDENCIES: Readonly<Record<string, SheetDependency>> = {
  start: (command, _fight, authority) => gmOnly(authority, (command.payload as StartPayload).combatants),
  refresh: (_command, fight, authority) => gmOnly(authority, (fight?.state.combatants ?? []).map(({ kind, sheetId }) => ({ kind, sheetId }))),
  aim: actorSheet,
  roll: actorSheet,
  defend: actorSheet,
  catch: actorSheet,
  strength: actorSheet,
}

function sheetDependencies(command: CombatCommand, fight: CombatFight | null, authority: CombatAuthority): CombatantSelection[] {
  return SHEET_DEPENDENCIES[command.payload.type]?.(command, fight, authority) ?? []
}

async function readItem(db: Firestore, tx: Transaction, command: CombatCommand, id: string) {
  const snap = await tx.get(combatRef(db, command, 'gmItems', id))
  return snap.exists() ? [id, parseLubecGmItem(snap.data(), id)] as const : null
}

const activeId = (raw: Record<string, unknown> = {}) => (raw.activeFightId ?? null) as string | null

export type CombatReadRecords = CombatRecords & { raws: Map<string, Record<string, unknown>> }

const readSheets = (sheets: (ReadSheet | null)[]) => sheets.filter((sheet): sheet is ReadSheet => sheet !== null)

export async function readCombatRecords(db: Firestore, tx: Transaction, command: CombatCommand, authority: CombatAuthority): Promise<CombatReadRecords> {
  const control = await tx.get(combatRef(db, command, 'combatControl', 'current'))
  const fight = (await tx.get(combatRef(db, command, 'combats', command.envelope.fightId))).data() as CombatFight | undefined
  const selections = sheetDependencies(command, fight ?? null, authority)
  const sheets = readSheets(await Promise.all(selections.map((selection) => readableSheet(db, tx, command, selection))))
  const itemIds = authority.isGm ? itemDependencies(command, fight ?? null) : []
  const items = await Promise.all([...new Set(itemIds)].map((id) => readItem(db, tx, command, id)))
  return {
    activeFightId: activeId(control.data()), fight: fight ?? null,
    sheets: sheets.map((sheet) => sheet.record),
    raws: new Map(sheets.map((sheet) => [combatantKey(sheet.record), sheet.raw])),
    items: new Map(items.filter((item) => item !== null)),
  }
}
