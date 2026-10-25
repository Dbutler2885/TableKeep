import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { vtmCharacterStore } from '../vtmCharacterRecord'
import { makeVtmCharacter } from '../vtmDefaults'

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  deleteDoc: vi.fn(),
  serverTimestamp: () => 'now',
  setDoc: mocks.setDoc,
}))

const { updateCharacterStoreCharacter, updateCharacterStoreCharacterNow } = await import('./characterStoreActions')
const { emptyCharacterStoreSaves, isCharacterStoreSaveOutstanding } = await import('./characterStoreWrites')

const owned = { ...makeVtmCharacter('user-1', 'player1'), id: 'a', name: 'Stored' }

const contextFor = (role: 'gm' | 'player', userId: string) => ({
  ruleSet: vtmCharacterStore,
  campaign: { campaignId: 'campaign-1', groupId: 'group-1' },
  role,
  userId,
  charactersRef: { current: [owned] },
  savesRef: { current: emptyCharacterStoreSaves() },
  setCharacters: vi.fn(),
  setSelectedCharacterId: vi.fn(),
  setCurrentCharacterId: vi.fn(),
})

/** The names each save wrote, in the order they were sent. */
const writtenNames = () => mocks.setDoc.mock.calls.map(([, fields]) => (fields as { name: string }).name)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('updateCharacterStoreCharacterNow', () => {
  it('applies the edit and sends its save at once, without waiting out the delay', () => {
    const context = contextFor('player', 'user-1')

    updateCharacterStoreCharacterNow(context, 'a', { name: 'Rolled' })

    expect(context.charactersRef.current[0].name).toBe('Rolled')
    expect(context.setCharacters).toHaveBeenCalledWith(context.charactersRef.current)
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { path: 'groups/group-1/campaigns/campaign-1/characters/a' },
      expect.objectContaining({ system: 'vtm', name: 'Rolled', updatedAt: 'now' }),
      { merge: true },
    )
    expect(context.savesRef.current.pending).toEqual({})
    expect(isCharacterStoreSaveOutstanding(context.savesRef.current, 'a')).toBe(true)
  })

  it('cancels the waiting save and carries the edit made just before it, so nothing is sent twice', () => {
    const context = contextFor('player', 'user-1')

    updateCharacterStoreCharacter(context, 'a', { portraitFocusX: 20 })
    vi.advanceTimersByTime(300)
    updateCharacterStoreCharacterNow(context, 'a', { name: 'Rolled' })

    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({ name: 'Rolled', portraitFocusX: 20 })

    vi.advanceTimersByTime(1000)

    expect(writtenNames()).toEqual(['Rolled'])
  })

  it('leaves a later ordinary edit to the delay', () => {
    const context = contextFor('gm', 'gm-1')

    updateCharacterStoreCharacterNow(context, 'a', { name: 'Rolled' })
    updateCharacterStoreCharacter(context, 'a', { name: 'Typed after' })
    vi.advanceTimersByTime(499)
    expect(writtenNames()).toEqual(['Rolled'])

    vi.advanceTimersByTime(1)

    expect(writtenNames()).toEqual(['Rolled', 'Typed after'])
  })

  it('refuses an edit the permission check refuses: nothing changes and nothing is sent', () => {
    const context = contextFor('player', 'user-2')

    updateCharacterStoreCharacterNow(context, 'a', { name: 'Not theirs' })
    vi.advanceTimersByTime(1000)

    expect(context.charactersRef.current[0].name).toBe('Stored')
    expect(context.setCharacters).not.toHaveBeenCalled()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('applies the edit but saves nothing without a campaign', () => {
    const context = { ...contextFor('player', 'user-1'), campaign: null }

    updateCharacterStoreCharacterNow(context, 'a', { name: 'Rolled' })
    vi.advanceTimersByTime(1000)

    expect(context.charactersRef.current[0].name).toBe('Rolled')
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})
