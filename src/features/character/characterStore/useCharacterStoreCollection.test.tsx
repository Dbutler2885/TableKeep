// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { TokenIconConfig } from '../../../types/app'
import type { StoredCharacter } from '../../ruleSets/storedCharacter'
import type { CharacterStoreRuleSet } from './characterStoreRecord'
import type { CharacterStoreOptions } from './useCharacterStore'

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

type ToyCharacter = { id: string; ownerUserId: string; portraitUrl: string | null; tokenIcon: TokenIconConfig; luck: number }

const tokenIcon: TokenIconConfig = { icon: 'pawn', color: '#000', size: 30 }

const toyRuleSet: CharacterStoreRuleSet<ToyCharacter> = {
  system: 'toy',
  label: 'Toy',
  versioning: { schemaVersion: 1, migrations: [] },
  parser: {
    parse: (id, { ownerUserId, luck }) => ({ id, ownerUserId: String(ownerUserId), portraitUrl: null, tokenIcon, luck: Number(luck) }),
    serialize: ({ ownerUserId, luck }) => ({ system: 'toy', ownerUserId, luck }),
  },
}

const CAMPAIGN_PATH = 'groups/group-1/campaigns/campaign-1'
const SHEETS_PATH = `${CAMPAIGN_PATH}/npcSheets`

const stored = (luck: number): StoredCharacter => ({ system: 'toy', ownerUserId: 'gm-1', luck, schemaVersion: 1 })

function renderStore(options: Partial<CharacterStoreOptions<ToyCharacter>>) {
  return renderHook(() => useCharacterStore({
    ruleSet: toyRuleSet, campaignId: 'campaign-1', groupId: 'group-1', userId: 'gm-1',
    role: 'gm', gmUserId: 'gm-1', setError: vi.fn(), enabled: true, ...options,
  }))
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

describe('useCharacterStore in another collection', () => {
  it('reads, saves, creates and deletes there', async () => {
    const { result } = renderStore({ collection: 'npcSheets' })
    expect(Object.keys(mocks.listeners)).not.toContain(`${CAMPAIGN_PATH}/characters`)
    act(() => mocks.listeners[SHEETS_PATH].next({ docs: [{ id: 'npc-1', data: () => stored(3) }] }))
    expect(result.current.characters.map(({ id, luck }) => [id, luck])).toEqual([['npc-1', 3]])

    act(() => result.current.updateCharacter('npc-1', { luck: 4 }))
    act(() => vi.advanceTimersByTime(500))
    await act(() => result.current.addCharacter({ id: 'npc-2', ownerUserId: 'gm-1', portraitUrl: null, tokenIcon, luck: 1 }))
    act(() => {
      result.current.deleteCharacter('npc-1')
    })

    expect(mocks.setDoc.mock.calls.map(([ref]) => ref)).toEqual([{ path: `${SHEETS_PATH}/npc-1` }, { path: `${SHEETS_PATH}/npc-2` }])
    expect(mocks.deleteDoc).toHaveBeenCalledExactlyOnceWith({ path: `${SHEETS_PATH}/npc-1` })
  })
})

describe('useCharacterStore narrowed to one document', () => {
  const emitSheet = (snap: unknown) => act(() => mocks.listeners[`${SHEETS_PATH}/npc-1`].next(snap))

  it('listens to that document alone and selects it', () => {
    const { result } = renderStore({ collection: 'npcSheets', onlyId: 'npc-1' })
    expect(mocks.listeners[SHEETS_PATH]).toBeUndefined()

    emitSheet({ id: 'npc-1', exists: () => true, data: () => stored(5) })

    expect(result.current.characters.map(({ id, luck }) => [id, luck])).toEqual([['npc-1', 5]])
    expect(result.current.selectedCharacter?.id).toBe('npc-1')
  })

  it('has nothing while the document does not exist', () => {
    const { result } = renderStore({ collection: 'npcSheets', onlyId: 'npc-1' })

    emitSheet({ id: 'npc-1', exists: () => false, data: () => undefined })

    expect(result.current.characters).toEqual([])
    expect(result.current.charactersLoading).toBe(false)
    expect(result.current.selectedCharacter).toBeNull()
  })
})
