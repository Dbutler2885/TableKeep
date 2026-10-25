import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearNpcWrites,
  createNpcWriteQueue,
  createNpcWriteQueues,
  forgetNpcWrites,
  isNpcDocumentBusy,
  NPC_WRITE_DELAY_MS,
} from './npcWriteQueue'

function deferred() {
  let settle = () => {}
  const promise = new Promise<void>((resolve) => { settle = resolve })
  return { promise, settle }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createNpcWriteQueue', () => {
  it('runs only the last write, half a second after the last schedule', () => {
    const queue = createNpcWriteQueue()
    const first = vi.fn(() => Promise.resolve())
    const second = vi.fn(() => Promise.resolve())
    queue.schedule('a', first)
    vi.advanceTimersByTime(NPC_WRITE_DELAY_MS - 1)
    queue.schedule('a', second)
    vi.advanceTimersByTime(NPC_WRITE_DELAY_MS - 1)
    expect(second).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('keeps an NPC busy from the first schedule until its write settles', async () => {
    const queue = createNpcWriteQueue()
    const write = deferred()
    expect(queue.isBusy('a')).toBe(false)
    queue.schedule('a', () => write.promise)
    expect(queue.isBusy('a')).toBe(true)
    vi.advanceTimersByTime(NPC_WRITE_DELAY_MS)
    expect(queue.isBusy('a')).toBe(true)
    write.settle()
    await vi.waitFor(() => expect(queue.isBusy('a')).toBe(false))
  })

  it('stops being busy at once when the write has nothing to save', () => {
    const queue = createNpcWriteQueue()
    queue.schedule('a', () => undefined)
    vi.advanceTimersByTime(NPC_WRITE_DELAY_MS)
    expect(queue.isBusy('a')).toBe(false)
  })

  it('forgets one NPC\'s pending and in-flight writes without touching others', () => {
    const queue = createNpcWriteQueue()
    const forgotten = vi.fn(() => Promise.resolve())
    const kept = vi.fn(() => Promise.resolve())
    queue.schedule('a', () => deferred().promise)
    vi.advanceTimersByTime(NPC_WRITE_DELAY_MS)
    queue.schedule('a', forgotten)
    queue.schedule('b', kept)
    queue.forget('a')
    queue.forget('never-seen')
    expect(queue.isBusy('a')).toBe(false)
    vi.advanceTimersByTime(NPC_WRITE_DELAY_MS)
    expect(forgotten).not.toHaveBeenCalled()
    expect(kept).toHaveBeenCalledOnce()
  })

  it('drops everything on clear', () => {
    const queue = createNpcWriteQueue(10)
    const write = vi.fn(() => Promise.resolve())
    queue.schedule('a', write)
    queue.schedule('b', () => deferred().promise)
    vi.advanceTimersByTime(5)
    queue.clear()
    vi.advanceTimersByTime(100)
    expect(write).not.toHaveBeenCalled()
    expect(queue.isBusy('a') || queue.isBusy('b')).toBe(false)
  })
})

describe('the tab\'s three queues', () => {
  it('treats the NPC document as busy through either public queue, not the private one', () => {
    const queues = createNpcWriteQueues()
    queues.private.schedule('a', () => Promise.resolve())
    expect(isNpcDocumentBusy(queues, 'a')).toBe(false)
    queues.player.schedule('a', () => Promise.resolve())
    expect(isNpcDocumentBusy(queues, 'a')).toBe(true)
    queues.player.forget('a')
    queues.npc.schedule('a', () => Promise.resolve())
    expect(isNpcDocumentBusy(queues, 'a')).toBe(true)
  })

  it('forgets an NPC in every queue, and clears them all', () => {
    const queues = createNpcWriteQueues()
    const writes = [vi.fn(), vi.fn(), vi.fn()]
    queues.npc.schedule('a', writes[0])
    queues.private.schedule('a', writes[1])
    queues.player.schedule('a', writes[2])
    forgetNpcWrites(queues, 'a')
    queues.npc.schedule('b', writes[0])
    clearNpcWrites(queues)
    vi.advanceTimersByTime(NPC_WRITE_DELAY_MS)
    writes.forEach((write) => expect(write).not.toHaveBeenCalled())
  })
})
