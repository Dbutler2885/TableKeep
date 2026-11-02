import { sheetRecordBase } from './sheetRecordBase'
import { capturedSheetEdits } from '../../../../functions/src/sheets/capturedSheetEdits'
import { db } from '../../../firebase'
import { campaignDocRef } from '../../campaign/firestorePaths'
import { sheetRecordEdits } from '../../../../functions/src/sheets/sheetIntentionDiff'
import { readSheetRevision } from './sheetIntention'
import { readCharacterStoreDoc, type CharacterStoreRecord } from './characterStoreRecord'
import type { CharacterStoreActionContext } from './characterStoreActions'
import type { CharacterStoreSaves, CharacterStoreScope } from './characterStoreWrites'
import { acceptConfirmedSheet, optimisticSheet } from './sheetOptimistic'
import { discardSheetEdits, enqueueSheetEdit, flushSheetQueue, makeRevisionedSheetQueue, queueSheetSave, receiveSheetSnapshot, type RevisionedSheetQueue } from './revisionedSheetQueue'

export function revisionedQueue(saves: CharacterStoreSaves, scope: CharacterStoreScope, id: string, raw: Record<string, unknown>): RevisionedSheetQueue {
  saves.revisioned ??= {}
  saves.revisioned[id] ??= makeRevisionedSheetQueue(db, campaignDocRef(db, scope, scope.collection ?? 'characters', id), saves.userId ?? '', raw, () => saves.notify?.())
  return saves.revisioned[id]
}

function renderQueue<Character extends CharacterStoreRecord>(context: CharacterStoreActionContext<Character>, id: string, queue: RevisionedSheetQueue) {
  if (context.savesRef.current.revisioned?.[id] !== queue) return
  const local = context.charactersRef.current.find((entry) => entry.id === id)
  const shown = readCharacterStoreDoc(context.ruleSet, id, optimisticSheet(queue.state), local)
  const next = context.charactersRef.current.map((entry) => entry.id === id ? shown as Character : entry)
  context.charactersRef.current = next
  context.setCharacters(next)
  context.notifySaves?.()
}

/** The caller supplies the rendered base when its closure predates another confirmed snapshot. */
export function revisionedCharacterUpdate<Character extends CharacterStoreRecord>(context: CharacterStoreActionContext<Character>, id: string, base: Character, updates: Partial<Character>, immediate: boolean): boolean {
  if (context.ruleSet.system !== 'lubec' || !context.campaign) return false
  const saves = context.savesRef.current
  const before = context.ruleSet.parser.serialize(base)
  const after = context.ruleSet.parser.serialize({ ...base, ...updates })
  const queue = revisionedQueue(saves, context.campaign, id, before)
  queue.notify = () => renderQueue(context, id, queue)
  appendCharacterEdit(queue, capturedSheetEdits(before, after, sheetRecordBase(base) ?? queue.state.confirmed))
  queueSheetSave(queue, immediate)
  return true
}

function appendCharacterEdit(queue: RevisionedSheetQueue, edits: ReturnType<typeof sheetRecordEdits>) {
  if (edits.length === 0) return
  enqueueSheetEdit(queue, { operationId: crypto.randomUUID(), baseRevision: readSheetRevision(queue.state.confirmed), edits })
}

export function receiveRevisionedStoreDocs(saves: CharacterStoreSaves, scope: CharacterStoreScope, docs: { id: string; data: () => unknown; metadata?: { hasPendingWrites: boolean } }[]): Promise<void> | undefined {
  const probes: Promise<unknown>[] = []
  docs.filter((entry) => !entry.metadata?.hasPendingWrites).forEach((entry) => {
    const raw = entry.data() as Record<string, unknown>
    const queue = revisionedQueue(saves, scope, entry.id, raw)
    if (queue.state.pending.length === 0) acceptConfirmedSheet(queue.state, raw)
    else probes.push(receiveSheetSnapshot(queue, raw))
  })
  if (probes.length > 0) return Promise.all(probes).then(() => {})
}

export function revisionedSaveControls(saves: CharacterStoreSaves, id: string) {
  const queue = saves.revisioned?.[id]
  if (!queue) return null
  return {
    entries: queue.state.pending,
    busy: Boolean(queue.running),
    retry: () => { void flushSheetQueue(queue) },
    discard: () => discardSheetEdits(queue),
  }
}
