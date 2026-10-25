// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { Role } from '../../types/app'

type Listener = { next: (snap: unknown) => void; fail: (error: unknown) => void }

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, { next: (snap: unknown) => void; fail: (error: unknown) => void }>,
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  deleteDoc: vi.fn(),
  onSnapshot: (ref: { path: string }, next: Listener['next'], fail: Listener['fail']) => {
    mocks.listeners[ref.path] = { next, fail }
    return () => undefined
  },
  serverTimestamp: () => 'now',
  setDoc: mocks.setDoc,
}))

const { useLubecSheetSession } = await import('./useLubecSheetSession')

const CHARACTERS_PATH = 'groups/group-1/campaigns/campaign-1/characters'

const tommyEves = {
  system: 'lubec',
  schemaVersion: 1,
  name: 'Tommy Eves',
  ownerUserId: 'player-1',
  ownerUsername: 'tommyev',
  creationMode: 'established',
  creationStatus: 'active',
  lubec: { class: { key: 'working', choices: {} }, counters: { stress: 2, minimumStress: 2, trauma: 0 } },
}

function renderSession(role: Role, userId: string) {
  const rendered = renderHook(() => useLubecSheetSession({
    source: { kind: 'characters' }, campaignId: 'campaign-1', groupId: 'group-1', role, currentUserId: userId, gmUserId: 'gm-1', setError: vi.fn(),
  }))
  act(() => mocks.listeners[CHARACTERS_PATH].next({ docs: [{ id: 'tommy', data: () => tommyEves }] }))
  return rendered
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.listeners = {}
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useLubecSheetSession over the campaign\'s characters', () => {
  it('has no sheet open until the characters load', () => {
    const { result } = renderHook(() => useLubecSheetSession({
      source: { kind: 'characters' }, campaignId: 'campaign-1', groupId: 'group-1', role: 'gm', currentUserId: 'gm-1', gmUserId: 'gm-1', setError: vi.fn(),
    }))

    expect(result.current.character).toBeNull()
    expect(result.current.sheetProps).toBeNull()
  })

  it('opens the loaded character with the owner\'s edits, saved through the store', () => {
    const { result } = renderSession('player', 'player-1')
    const { character, sheetProps, viewer } = result.current

    expect(character?.id).toBe('tommy')
    expect(viewer).toEqual({ role: 'player', userId: 'player-1' })
    expect(sheetProps?.character).toBe(character)
    expect(sheetProps?.editing).not.toBeNull()
    expect(sheetProps?.corrections).toBeNull()

    act(() => sheetProps?.onCountersChange?.({ stress: 5, minimumStress: 2, trauma: 0 }))
    act(() => vi.advanceTimersByTime(500))

    const [ref, payload] = mocks.setDoc.mock.calls[0] as [{ path: string }, { lubec: { counters: unknown } }]
    expect(ref).toEqual({ path: `${CHARACTERS_PATH}/tommy` })
    expect(payload.lubec.counters).toEqual({ stress: 5, minimumStress: 2, trauma: 0 })
  })

  it('saves the name band\'s edits through the store', () => {
    const { result } = renderSession('player', 'player-1')

    act(() => result.current.sheetProps?.editing?.update({ name: 'Tom Eves' }))

    expect(result.current.character?.name).toBe('Tom Eves')
  })

  it('gives the GM the corrections and another player nothing to change', () => {
    expect(renderSession('gm', 'gm-1').result.current.sheetProps?.corrections).not.toBeNull()
    cleanup()

    const { sheetProps } = renderSession('player', 'player-2').result.current
    expect(sheetProps?.editing).toBeNull()
    expect(sheetProps?.onCountersChange).toBeNull()
  })
})
