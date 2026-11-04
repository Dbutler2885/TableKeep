import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { combatLogText, combatLogTime, subscribeCombatLog, type CombatLogEntry, type CombatLogUpdate } from './combatLog'

const mocks = vi.hoisted(() => ({ receive: null as null | ((snapshot: unknown) => void), error: null as null | ((error: Error) => void), stop: vi.fn(), query: vi.fn() }))
vi.mock('firebase/firestore', async (original) => ({
  ...await original<typeof import('firebase/firestore')>(),
  collection: (_db: unknown, ...segments: string[]) => segments.join('/'),
  query: (...parts: unknown[]) => { mocks.query(...parts); return parts },
  onSnapshot: (_ref: unknown, _options: unknown, receive: typeof mocks.receive, error: typeof mocks.error) => {
    mocks.receive = receive; mocks.error = error; return mocks.stop
  },
}))
const entry = (id: string, time = 1000, ordinal = 0): CombatLogEntry => ({ id, at: Timestamp.fromMillis(time), event: id, actor: null, ordinal })
const snapshot = (entries: CombatLogEntry[], fromCache = false, pendingIds: string[] = []) => mocks.receive!({ metadata: { fromCache }, docs: entries.map(({ id, ...data }) => ({ id, data: () => data, metadata: { hasPendingWrites: pendingIds.includes(id) } })) })
const attach = () => {
  const updates: CombatLogUpdate[] = []
  const error = vi.fn()
  const stop = subscribeCombatLog({} as Firestore, { groupId: 'g', campaignId: 'c' }, 'f', (update) => updates.push(update), error)
  return { updates, error, stop }
}
beforeEach(() => vi.clearAllMocks())

describe('the workspace log listener', () => {
  it('loads all history without cards and emits new committed entries once, including acknowledged local writes', () => {
    const { updates, error, stop } = attach()
    snapshot([entry('old')])
    expect(updates.at(-1)?.arriving).toEqual([])
    snapshot([entry('old'), entry('pending', 2000)], false, ['pending'])
    expect(updates.at(-1)?.entries.map(({ id }) => id)).toEqual(['old'])
    snapshot([entry('old'), entry('pending', 2000)])
    expect(updates.at(-1)?.arriving.map(({ id }) => id)).toEqual(['pending'])
    snapshot([entry('old'), entry('pending', 2000)])
    expect(updates.at(-1)?.arriving).toEqual([])
    const failure = new Error('denied')
    mocks.error!(failure)
    expect(error).toHaveBeenCalledWith(failure)
    stop()
    expect(mocks.stop).toHaveBeenCalledOnce()
    expect(mocks.query.mock.calls[0][0]).toBe('groups/g/campaigns/c/combats/f/log')
  })
  it('does not replay cached history, the first server snapshot, or history after reload', () => {
    const first = attach()
    snapshot([entry('cached')], true)
    snapshot([entry('cached'), entry('server-only')])
    expect(first.updates.flatMap(({ arriving }) => arriving)).toEqual([])
    snapshot([entry('cached'), entry('server-only'), entry('fresh')])
    expect(first.updates.at(-1)?.arriving.map(({ id }) => id)).toEqual(['fresh'])
    first.stop()
    const reload = attach()
    snapshot([entry('cached'), entry('server-only'), entry('fresh')])
    expect(reload.updates[0].arriving).toEqual([])
  })
  it('ignores unresolved timestamps and preserves transaction result order above 9 entries', () => {
    const { updates } = attach()
    snapshot([])
    const batch = Array.from({ length: 12 }, (_, ordinal) => entry(`cmd:log:${ordinal}`, 1000, ordinal)).reverse()
    snapshot([...batch, { ...entry('missing-time'), at: null }, entry('earlier', 100), entry('old-format', 1000)])
    expect(updates.at(-1)?.entries.map(({ id }) => id)).toEqual(['earlier', 'cmd:log:0', 'old-format', ...Array.from({ length: 11 }, (_, i) => `cmd:log:${i + 1}`)])
  })
  it('orders older entries without ordinals by stable id when timestamps tie', () => {
    const { updates } = attach()
    snapshot([{ ...entry('b'), ordinal: undefined }, { ...entry('a'), ordinal: undefined }])
    expect(updates[0].entries.map(({ id }) => id)).toEqual(['a', 'b'])
  })
  it('formats ordinary events and every part of a roll, with optional extra text', () => {
    const e = entry('fight began')
    expect(combatLogText(e)).toBe('fight began')
    expect(combatLogTime(e)).toMatch(/\d\d:\d\d/)
    expect(combatLogTime({ ...e, at: null })).toBe('')
    const roll = { who: 'Wayne', what: 'Attack roll', roll: '27', target: 'against 36', result: 'Hit', tone: 'ok' as const }
    expect(combatLogText({ ...e, roll })).toBe('Wayne - Attack roll: 27 against 36. Hit.')
    expect(combatLogText({ ...e, roll: { ...roll, extra: 'Dodgeball thrown.' } })).toContain('Hit. Dodgeball thrown.')
  })
})
