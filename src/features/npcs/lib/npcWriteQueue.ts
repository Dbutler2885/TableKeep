// Debounced, per-NPC writes. Each edit restarts that NPC's timer; when it
// fires the write runs, and the NPC counts as busy from the first edit until
// the write settles, so snapshots in between keep the local copy.

export const NPC_WRITE_DELAY_MS = 500

// A write returns nothing when there is nothing left to save.
export type NpcWrite = () => Promise<unknown> | undefined

export type NpcWriteQueue = {
  schedule: (npcId: string, write: NpcWrite) => void
  isBusy: (npcId: string) => boolean
  forget: (npcId: string) => void
  clear: () => void
}

type QueueState = {
  pending: Map<string, ReturnType<typeof setTimeout>>
  inFlight: Set<string>
}

function cancelPending(state: QueueState, npcId: string) {
  const timer = state.pending.get(npcId)
  if (timer) clearTimeout(timer)
  state.pending.delete(npcId)
}

function runWrite(state: QueueState, npcId: string, write: NpcWrite) {
  state.pending.delete(npcId)
  state.inFlight.add(npcId)
  const request = write()
  if (!request) {
    state.inFlight.delete(npcId)
    return
  }
  void request.finally(() => state.inFlight.delete(npcId))
}

export function createNpcWriteQueue(delayMs = NPC_WRITE_DELAY_MS): NpcWriteQueue {
  const state: QueueState = { pending: new Map(), inFlight: new Set() }
  return {
    schedule: (npcId, write) => {
      cancelPending(state, npcId)
      state.pending.set(npcId, setTimeout(() => runWrite(state, npcId, write), delayMs))
    },
    isBusy: (npcId) => state.pending.has(npcId) || state.inFlight.has(npcId),
    forget: (npcId) => {
      cancelPending(state, npcId)
      state.inFlight.delete(npcId)
    },
    clear: () => {
      state.pending.forEach((timer) => clearTimeout(timer))
      state.pending.clear()
      state.inFlight.clear()
    },
  }
}

// The tab's three write channels: the GM's full NPC write, the GM's private
// notes, and the fields a player may edit.
export type NpcWriteQueues = {
  npc: NpcWriteQueue
  private: NpcWriteQueue
  player: NpcWriteQueue
}

export const createNpcWriteQueues = (): NpcWriteQueues => ({
  npc: createNpcWriteQueue(),
  private: createNpcWriteQueue(),
  player: createNpcWriteQueue(),
})

// Either public channel holds the NPC document's local copy.
export const isNpcDocumentBusy = (queues: NpcWriteQueues, npcId: string) =>
  queues.npc.isBusy(npcId) || queues.player.isBusy(npcId)

export const forgetNpcWrites = (queues: NpcWriteQueues, npcId: string) => {
  queues.npc.forget(npcId)
  queues.private.forget(npcId)
  queues.player.forget(npcId)
}

export const clearNpcWrites = (queues: NpcWriteQueues) => {
  queues.npc.clear()
  queues.private.clear()
  queues.player.clear()
}
