// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { TokenIconConfig } from '../../../types/app'
import type { StoredCharacter } from '../../ruleSets/storedCharacter'
import type { CharacterStoreRuleSet } from './characterStoreRecord'

type Listener = { next: (snap: unknown) => void; fail: (error: unknown) => void }

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, { next: (snap: unknown) => void; fail: (error: unknown) => void }>,
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  deleteDoc: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  deleteDoc: mocks.deleteDoc,
  onSnapshot: (ref: { path: string }, next: Listener['next'], fail: Listener['fail']) => {
    mocks.listeners[ref.path] = { next, fail }
    return () => undefined
  },
  serverTimestamp: () => 'now',
  setDoc: mocks.setDoc,
}))

const { useCharacterStore } = await import('./useCharacterStore')

// A rule set the store has never heard of, at version 2, whose one stored
// shape the store knows nothing about.
type ToyCharacter = {
  id: string
  ownerUserId: string
  portraitPath?: string
  portraitUrl: string | null
  tokenIcon: TokenIconConfig
  luck: number
  extra: StoredCharacter
}

const tokenIcon: TokenIconConfig = { icon: 'pawn', color: '#000', size: 30 }

const toyRuleSet: CharacterStoreRuleSet<ToyCharacter> = {
  system: 'toy',
  label: 'Toy',
  versioning: {
    schemaVersion: 2,
    migrations: [
      (document) => ({ ...document, schemaVersion: 1 }),
      // Version 2 renamed `fortune` to `luck`.
      ({ fortune, ...document }) => ({ ...document, luck: fortune, schemaVersion: 2 }),
    ],
  },
  parser: {
    parse: (id, { ownerUserId, luck, schemaVersion: _version, ...extra }) =>
      ({ id, ownerUserId: String(ownerUserId), portraitUrl: null, tokenIcon, luck: Number(luck), extra }),
    serialize: ({ ownerUserId, luck, extra }) => ({ ...extra, ownerUserId, luck }),
  },
}

const CHARACTERS_PATH = 'groups/group-1/campaigns/campaign-1/characters'

function renderStore() {
  return renderHook(() => useCharacterStore({
    ruleSet: toyRuleSet, campaignId: 'campaign-1', groupId: 'group-1', userId: 'user-1',
    role: 'player', gmUserId: 'gm-1', setError: vi.fn(), enabled: true,
  }))
}

const emitCharacters = (docs: Array<{ id: string; data: () => StoredCharacter }>) =>
  act(() => mocks.listeners[CHARACTERS_PATH]?.next({ docs }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.listeners = {}
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useCharacterStore with any rule set', () => {
  it('reads only its own system, through its steps and parser', () => {
    const { result } = renderStore()
    emitCharacters([
      { id: 'old', data: () => ({ system: 'toy', ownerUserId: 'user-1', fortune: 3, mood: 'grim' }) },
      { id: 'other', data: () => ({ system: 'vtm', ownerUserId: 'user-1' }) },
    ])

    expect(result.current.characters).toEqual([
      { id: 'old', ownerUserId: 'user-1', portraitUrl: null, tokenIcon, luck: 3, extra: { system: 'toy', mood: 'grim' } },
    ])
  })

  it('saves through its serializer, stamped with its version', () => {
    const { result } = renderStore()
    emitCharacters([{ id: 'old', data: () => ({ system: 'toy', ownerUserId: 'user-1', fortune: 3 }) }])

    act(() => result.current.updateCharacter('old', { luck: 4 }))
    act(() => vi.advanceTimersByTime(500))

    expect(mocks.setDoc).toHaveBeenCalledExactlyOnceWith(
      { path: `${CHARACTERS_PATH}/old` },
      { system: 'toy', ownerUserId: 'user-1', luck: 4, schemaVersion: 2, schemaWrittenAt: 'now', updatedAt: 'now' },
      { merge: true },
    )
  })

  it('creates a caller-made character under the id it carries', async () => {
    const { result } = renderStore()
    emitCharacters([])
    const made: ToyCharacter = {
      id: 'chosen-id', ownerUserId: 'user-1', portraitUrl: null, tokenIcon, luck: 1, extra: { system: 'toy' },
    }

    await act(() => result.current.addCharacter(made))

    expect(mocks.setDoc).toHaveBeenCalledExactlyOnceWith({ path: `${CHARACTERS_PATH}/chosen-id` }, {
      system: 'toy', ownerUserId: 'user-1', luck: 1, schemaVersion: 2, schemaWrittenAt: 'now', createdAt: 'now', updatedAt: 'now',
    })
    expect(result.current.selectedCharacter).toBe(made)
  })

  it('names the rule set when its characters cannot be loaded', () => {
    const setError = vi.fn()
    renderHook(() => useCharacterStore({
      ruleSet: toyRuleSet, campaignId: 'campaign-1', groupId: 'group-1', userId: 'user-1',
      role: 'player', gmUserId: 'gm-1', setError, enabled: true,
    }))

    act(() => mocks.listeners[CHARACTERS_PATH].fail('denied'))

    expect(setError).toHaveBeenCalledExactlyOnceWith('Unable to load Toy characters')
  })
})
