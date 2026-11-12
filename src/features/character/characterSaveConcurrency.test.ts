import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterStoreSaves } from './characterStore/characterStoreWrites'
import { oseCharacterStore, parseOseCharacter } from './lib/storedCharacterRecord'
import { vtmCharacterStore } from './vtmCharacterRecord'
import { makeVtmCharacter } from './vtmDefaults'

const mocks = vi.hoisted(() => ({ setDoc: vi.fn() }))
vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }), setDoc: mocks.setDoc,
  serverTimestamp: () => 'server-time', deleteDoc: vi.fn(),
}))
const store = await import('./characterStore/characterStoreWrites')
const campaign = { groupId: 'g', campaignId: 'c' }
const ose = oseCharacterStore({ userId: 'player', currentUsername: 'player1' })
const adapters = [
  { name: 'OSE', empty: store.emptyCharacterStoreSaves, outstanding: store.isCharacterStoreSaveOutstanding,
    schedule: (saves: CharacterStoreSaves) => store.scheduleCharacterStoreSave(saves, campaign, ose, 'pc', () => parseOseCharacter('pc', { ownerUserId: 'player' })) },
  { name: 'VtM', empty: store.emptyCharacterStoreSaves, outstanding: store.isCharacterStoreSaveOutstanding,
    schedule: (saves: CharacterStoreSaves) => store.scheduleCharacterStoreSave(saves, campaign, vtmCharacterStore, 'pc', () => ({ ...makeVtmCharacter('player', 'player1'), id: 'pc' })) },
]

beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers() })

/** Lets settled writes run their callbacks, without moving the fake clock. */
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

for (const adapter of adapters) {
  describe(`${adapter.name} save concurrency`, () => {
    it('stays outstanding until both of two overlapping in-flight writes have settled', async () => {
      let firstDone: () => void = () => undefined
      let secondDone: () => void = () => undefined
      mocks.setDoc.mockReturnValueOnce(new Promise<void>((resolve) => { firstDone = resolve }))
        .mockReturnValueOnce(new Promise<void>((resolve) => { secondDone = resolve }))
      const saves = adapter.empty()
      adapter.schedule(saves)
      vi.advanceTimersByTime(500)
      adapter.schedule(saves)
      expect(adapter.outstanding(saves, 'pc')).toBe(true)
      vi.advanceTimersByTime(500)
      expect(mocks.setDoc).toHaveBeenCalledTimes(2)
      expect(saves.pending).toEqual({})
      expect(saves.inFlight.pc?.size).toBe(2)
      firstDone()
      await flush()
      expect(saves.inFlight.pc?.size).toBe(1)
      // The second write is still unresolved, so the character is still busy.
      expect(adapter.outstanding(saves, 'pc')).toBe(true)
      secondDone()
      await flush()
      expect(adapter.outstanding(saves, 'pc')).toBe(false)
      expect(saves).toEqual({ pending: {}, inFlight: {} })
    })

    it('keeps the next pending edit outstanding when an earlier in-flight write finishes', async () => {
      let firstDone: () => void = () => undefined
      mocks.setDoc.mockReturnValueOnce(new Promise<void>((resolve) => { firstDone = resolve })).mockResolvedValue(undefined)
      const saves = adapter.empty()
      adapter.schedule(saves)
      vi.advanceTimersByTime(500)
      adapter.schedule(saves)
      firstDone()
      await flush()
      expect(saves.inFlight).toEqual({})
      expect(adapter.outstanding(saves, 'pc')).toBe(true)
      vi.advanceTimersByTime(499)
      expect(mocks.setDoc).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(1)
      expect(mocks.setDoc).toHaveBeenCalledTimes(2)
      await flush()
      expect(adapter.outstanding(saves, 'pc')).toBe(false)
    })
  })
}
