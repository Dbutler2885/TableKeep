import { doc, getDocFromServer, type DocumentReference, type Firestore } from 'firebase/firestore'
import { FirebaseError } from 'firebase/app'
import { planSheetIntention } from './sheetIntention'
import { saveSheetIntention } from './sheetIntentionTransaction'
import type { SheetIntention, SheetWriteReceipt } from './sheetIntentionTypes'
import { acceptConfirmedSheet, acknowledgeSheetEdit, optimisticSheet, type OptimisticSheet, type PendingSheetEdit } from './sheetOptimistic'
import { readSheetEditJournal, writeSheetEditJournal } from './sheetEditJournal'

export type RevisionedSheetQueue = {
  state: OptimisticSheet
  db: Firestore
  ref: DocumentReference
  userId: string
  notify: () => void
  timer?: ReturnType<typeof setTimeout>
  running?: Promise<void>
}

export function makeRevisionedSheetQueue(db: Firestore, ref: DocumentReference, userId: string, confirmed: Record<string, unknown>, notify: () => void): RevisionedSheetQueue {
  const queue = { db, ref, userId, notify, state: { confirmed, pending: readSheetEditJournal(userId, ref.path) } }
  if (queue.state.pending.length > 0) queueSheetSave(queue)
  return queue
}

const persist = (queue: RevisionedSheetQueue) => writeSheetEditJournal(queue.userId, queue.ref.path, queue.state.pending)

export function enqueueSheetEdit(queue: RevisionedSheetQueue, intention: SheetIntention) {
  queue.state.pending.push({ intention })
  persist(queue)
  queue.notify()
}

export function queueSheetSave(queue: RevisionedSheetQueue, immediate = false) {
  clearTimeout(queue.timer)
  if (immediate) void flushSheetQueue(queue)
  else queue.timer = setTimeout(() => { void flushSheetQueue(queue) }, 500)
}

/** A failed edit stays in the queue and in the retry journal until explicitly discarded. */
export function flushSheetQueue(queue: RevisionedSheetQueue): Promise<void> {
  clearTimeout(queue.timer)
  queue.timer = undefined
  if (queue.running) return queue.running
  queue.running = drainSheetQueue(queue).finally(() => {
    queue.running = undefined
    persist(queue)
    queue.notify()
    const next = nextPendingEntry(queue)
    if (next && !next.error) void flushSheetQueue(queue)
  })
  queue.notify()
  return queue.running
}

const nextPendingEntry = (queue: RevisionedSheetQueue) => queue.state.pending.find((entry) => entry.committedRevision === undefined)

async function drainSheetQueue(queue: RevisionedSheetQueue) {
  let entry = nextPendingEntry(queue)
  while (entry) {
    await saveQueueEntry(queue, entry)
    if (entry.error) break
    entry = nextPendingEntry(queue)
  }
}

async function saveQueueEntry(queue: RevisionedSheetQueue, entry: PendingSheetEdit) {
  delete entry.error
  try {
    acknowledgeSheetEdit(entry, await saveSheetIntention(queue.db, queue.ref, entry.intention))
  } catch (error) {
    entry.error = sheetSaveFailure(error)
  }
}

function sheetSaveFailure(error: unknown) {
  if (error instanceof FirebaseError && error.code === 'permission-denied') return 'Your version of Table Keep is out of date. Refresh to keep editing. Your unsaved edits are retained.'
  return 'Your edit could not be saved. Your unsaved edits are retained. Retry when connected.'
}

async function confirmQueueEntry(queue: RevisionedSheetQueue, entry: PendingSheetEdit) {
  const receipt = await getDocFromServer(doc(queue.ref, 'writeReceipts', entry.intention.operationId))
  if (!receipt.exists()) return
  acknowledgeSheetEdit(entry, planSheetIntention(undefined, entry.intention, receipt.data() as SheetWriteReceipt).outcome)
}

/** Receipt probes run before rendering a server snapshot, including while its commit acknowledgement is delayed. */
export async function receiveSheetSnapshot(queue: RevisionedSheetQueue, incoming: Record<string, unknown>) {
  try {
    await Promise.all(queue.state.pending.map((entry) => confirmQueueEntry(queue, entry)))
    acceptConfirmedSheet(queue.state, incoming)
    persist(queue)
  } catch (error) {
    acceptConfirmedSheet(queue.state, incoming)
    const first = queue.state.pending[0]
    if (first) first.error = sheetSaveFailure(error)
  }
  return optimisticSheet(queue.state)
}

export function discardSheetEdits(queue: RevisionedSheetQueue) {
  if (queue.running) return
  queue.state.pending = []
  persist(queue)
  queue.notify()
}

export const sheetQueueError = (queue: RevisionedSheetQueue) => queue.state.pending.find((entry) => entry.error)?.error
export const sheetQueueOutstanding = (queue: RevisionedSheetQueue) => Boolean(queue.timer || queue.running)
