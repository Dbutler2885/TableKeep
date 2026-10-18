// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { CharacterRecord, Role } from '../../../types/app'

type StoredDoc = { id: string; data: () => Record<string, unknown> | undefined }
type Listener = { next: (snap: unknown) => void; fail: (error: unknown) => void }

const SERVER_TIMESTAMP = { sentinel: 'serverTimestamp' }
const DELETE_FIELD = { sentinel: 'deleteField' }

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, { next: (snap: unknown) => void; fail: (error: unknown) => void }>,
  subscribedTo: [] as string[],
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  deleteDoc: vi.fn(async (..._args: unknown[]) => undefined),
  resolveStoragePathUrl: vi.fn(async (path: string): Promise<string | null> => `https://cdn.test/${path}`),
}))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  deleteDoc: mocks.deleteDoc,
  deleteField: () => DELETE_FIELD,
  onSnapshot: (ref: { path: string }, next: Listener['next'], fail: Listener['fail']) => {
    mocks.subscribedTo.push(ref.path)
    mocks.listeners[ref.path] = { next, fail }
    return () => {
      if (mocks.listeners[ref.path]?.next === next) delete mocks.listeners[ref.path]
    }
  },
  serverTimestamp: () => SERVER_TIMESTAMP,
  setDoc: mocks.setDoc,
}))
vi.mock('../../common/mediaStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../common/mediaStorage')>()),
  resolveStoragePathUrl: mocks.resolveStoragePathUrl,
}))

const { useCharacters } = await import('./useCharacters')

const CAMPAIGN = 'groups/group-1/campaigns/campaign-1'
const CHARACTERS_PATH = `${CAMPAIGN}/characters`
const USER_STATE_PATH = `${CAMPAIGN}/userState/user-1`
const CAMPAIGN_2_CHARACTERS_PATH = 'groups/group-1/campaigns/campaign-2/characters'
const DEFAULT_TOKEN_ICON = { icon: 'pawn', color: '#bf2f2a', size: 34 }

type Props = {
  campaignId: string | null
  groupId: string | null
  userId: string
  currentUsername: string
  role: Role | null
  gmUserId: string | null
  enabled: boolean
}

const baseProps: Props = {
  campaignId: 'campaign-1',
  groupId: 'group-1',
  userId: 'user-1',
  currentUsername: 'Player One',
  role: 'player',
  gmUserId: 'gm-1',
  enabled: true,
}

const gmProps: Partial<Props> = { role: 'gm', userId: 'gm-1' }

const setError = vi.fn()

function renderCharacters(overrides: Partial<Props> = {}) {
  return renderHook(
    (props: Props) => useCharacters(
      props.campaignId,
      props.groupId,
      props.userId,
      props.currentUsername,
      props.role,
      props.gmUserId,
      setError,
      props.enabled,
    ),
    { initialProps: { ...baseProps, ...overrides } },
  )
}

const flushMicrotasks = () => act(async () => { await Promise.resolve() })

const stored = (id: string, fields: Record<string, unknown>): StoredDoc => ({ id, data: () => fields })
const ownDoc = (id: string, fields: Record<string, unknown> = {}) => stored(id, { ownerUserId: 'user-1', ...fields })

function emitCharacters(docs: StoredDoc[], path = CHARACTERS_PATH) {
  act(() => mocks.listeners[path]?.next({ docs }))
}

function emitUserState(data: Record<string, unknown> | undefined, path = USER_STATE_PATH) {
  act(() => mocks.listeners[path]?.next({ data: () => data }))
}

const ids = (characters: CharacterRecord[]) => characters.map((character) => character.id)
const savePaths = () => mocks.setDoc.mock.calls
  .map(([ref]) => (ref as { path: string }).path)
  .filter((path) => path.includes('/characters/'))
const characterSaves = () => mocks.setDoc.mock.calls.filter(([ref]) => (ref as { path: string }).path.includes('/characters/'))
const userStateSaves = () => mocks.setDoc.mock.calls.filter(([ref]) => (ref as { path: string }).path.includes('/userState/'))

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.listeners = {}
  mocks.subscribedTo = []
  mocks.setDoc.mockImplementation(async () => undefined)
  mocks.resolveStoragePathUrl.mockImplementation(async (path: string) => `https://cdn.test/${path}`)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useCharacters subscriptions', () => {
  it('subscribes to nothing and reports no characters while disabled', () => {
    const { result } = renderCharacters({ enabled: false })

    expect(mocks.subscribedTo).toEqual([])
    expect(result.current.characters).toEqual([])
    expect(result.current.charactersLoading).toBe(false)
    expect(result.current.currentCharacterId).toBeNull()
    expect(result.current.selectedCharacterId).toBe('')
    expect(result.current.selectedCharacter).toBeNull()
  })

  it.each([
    ['campaign', { campaignId: null }],
    ['group', { groupId: null }],
  ])('subscribes to nothing without a %s', (_label, overrides) => {
    renderCharacters(overrides)

    expect(mocks.subscribedTo).toEqual([])
  })

  it('reads the current character but not the roster without a role', () => {
    const { result } = renderCharacters({ role: null })

    expect(mocks.subscribedTo).toEqual([USER_STATE_PATH])
    expect(result.current.charactersLoading).toBe(false)
  })

  it('loads from the render that subscribes until the first roster snapshot arrives', () => {
    const { result } = renderCharacters(gmProps)

    expect(mocks.subscribedTo).toEqual([`${CAMPAIGN}/userState/gm-1`, CHARACTERS_PATH])
    expect(result.current.charactersLoading).toBe(true)

    emitCharacters([ownDoc('a')])

    expect(result.current.charactersLoading).toBe(false)
    expect(ids(result.current.characters)).toEqual(['a'])
  })

  it('loads again when the current character changes, until the next roster snapshot', () => {
    const { result } = renderCharacters()

    emitCharacters([ownDoc('a')])

    expect(result.current.currentCharacterId).toBe('a')
    expect(result.current.charactersLoading).toBe(true)
    expect(ids(result.current.characters)).toEqual(['a'])

    emitCharacters([ownDoc('a')])

    expect(result.current.charactersLoading).toBe(false)
  })

  it('clears the roster and the current character in the render that disables it, and stops listening', () => {
    const { result, rerender } = renderCharacters()
    emitUserState({ currentCharacterId: 'a' })
    emitCharacters([ownDoc('a')])

    rerender({ ...baseProps, enabled: false })

    expect(mocks.listeners[CHARACTERS_PATH]).toBeUndefined()
    expect(mocks.listeners[USER_STATE_PATH]).toBeUndefined()
    expect(result.current.characters).toEqual([])
    expect(result.current.charactersLoading).toBe(false)
    expect(result.current.currentCharacterId).toBeNull()
  })

  it('keeps the selection when the roster is cleared', () => {
    const { result, rerender } = renderCharacters()
    emitCharacters([ownDoc('a')])

    rerender({ ...baseProps, enabled: false })

    expect(result.current.selectedCharacterId).toBe('a')
    expect(result.current.selectedCharacter).toBeNull()
  })

  it('clears the roster when the role goes, but keeps reading the current character', () => {
    const { result, rerender } = renderCharacters()
    emitUserState({ currentCharacterId: 'a' })
    emitCharacters([ownDoc('a')])

    rerender({ ...baseProps, role: null })

    expect(result.current.characters).toEqual([])
    expect(result.current.currentCharacterId).toBe('a')
    expect(mocks.listeners[USER_STATE_PATH]).toBeDefined()
  })

  it('reads the current character id from the user state, and null when it is not a string', () => {
    const { result } = renderCharacters()

    emitUserState({ currentCharacterId: 'b' })
    expect(result.current.currentCharacterId).toBe('b')

    emitUserState({ currentCharacterId: 7 })
    expect(result.current.currentCharacterId).toBeNull()

    emitUserState(undefined)
    expect(result.current.currentCharacterId).toBeNull()
  })

  it('subscribes to the roster again whenever the current character changes', () => {
    renderCharacters()
    expect(mocks.subscribedTo.filter((path) => path === CHARACTERS_PATH)).toHaveLength(1)

    emitUserState({ currentCharacterId: 'b' })

    expect(mocks.subscribedTo.filter((path) => path === CHARACTERS_PATH)).toHaveLength(2)
  })

  it('subscribes to the roster again when the username changes, but not the user state', () => {
    const { rerender } = renderCharacters()

    rerender({ ...baseProps, currentUsername: 'Renamed' })

    expect(mocks.subscribedTo).toEqual([USER_STATE_PATH, CHARACTERS_PATH, CHARACTERS_PATH])
  })

  it('subscribes to the roster again when the GM changes', () => {
    const { rerender } = renderCharacters()

    rerender({ ...baseProps, gmUserId: 'gm-2' })

    expect(mocks.subscribedTo).toEqual([USER_STATE_PATH, CHARACTERS_PATH, CHARACTERS_PATH])
  })

  it('reports user state errors with their message, or a fallback', () => {
    renderCharacters()

    act(() => mocks.listeners[USER_STATE_PATH].fail(new Error('state denied')))
    act(() => mocks.listeners[USER_STATE_PATH].fail('nope'))

    expect(setError.mock.calls).toEqual([['state denied'], ['Unable to load current character']])
  })

  it('reports roster errors with their message, or a fallback, and stops loading', () => {
    const { result } = renderCharacters()

    act(() => mocks.listeners[CHARACTERS_PATH].fail(new Error('roster denied')))
    expect(result.current.charactersLoading).toBe(false)
    act(() => mocks.listeners[CHARACTERS_PATH].fail({ code: 'x' }))

    expect(setError.mock.calls).toEqual([['roster denied'], ['Unable to load characters']])
  })
})

describe('useCharacters stored records', () => {
  it('reads documents of every system', () => {
    const { result } = renderCharacters()

    emitCharacters([ownDoc('vtm', { system: 'vtm' }), ownDoc('a')])

    expect(ids(result.current.characters)).toEqual(['vtm', 'a'])
  })

  it('fills every missing field with its default', () => {
    const { result } = renderCharacters(gmProps)

    emitCharacters([stored('bare', {})])

    expect(result.current.characters).toEqual([{
      id: 'bare',
      name: 'bare',
      ownerUserId: '',
      ownerUsername: null,
      creationMode: 'new',
      creationModeExplicit: false,
      creationStatus: 'active',
      className: '-',
      level: 1,
      hpCurrent: 0,
      hpMax: 0,
      ac: 10,
      xp: 0,
      portraitPath: '',
      portraitUrl: null,
      portraitFocusX: 50,
      portraitFocusY: 50,
      tokenIcon: DEFAULT_TOKEN_ICON,
      details: null,
    }])
  })

  it('keeps every well-typed stored field', () => {
    const { result } = renderCharacters()
    const tokenIcon = { icon: 'sword', color: '#000000', size: 40 }

    emitCharacters([ownDoc('a', {
      name: 'Mirelda',
      ownerUsername: 'player1',
      creationMode: 'established',
      creationModeExplicit: true,
      creationStatus: 'established_draft',
      class: 'Thief',
      level: 3,
      hpCurrent: 7,
      hpMax: 9,
      ac: 6,
      xp: 2400,
      portraitPath: 'portraits/a.png',
      portraitUrl: 'https://cdn.test/stored.png',
      portraitFocusX: 20,
      portraitFocusY: 80,
      tokenIcon,
    })])

    expect(result.current.characters[0]).toEqual({
      id: 'a',
      name: 'Mirelda',
      ownerUserId: 'user-1',
      ownerUsername: 'player1',
      creationMode: 'established',
      creationModeExplicit: true,
      creationStatus: 'established_draft',
      className: 'Thief',
      level: 3,
      hpCurrent: 7,
      hpMax: 9,
      ac: 6,
      xp: 2400,
      portraitPath: 'portraits/a.png',
      portraitUrl: 'https://cdn.test/stored.png',
      portraitFocusX: 20,
      portraitFocusY: 80,
      tokenIcon,
      details: null,
    })
  })

  it('keeps a stored name or class that is not missing, whatever its type', () => {
    const { result } = renderCharacters()

    emitCharacters([ownDoc('a', { name: '', class: 0 }), ownDoc('b', { name: null, class: null })])

    expect(result.current.characters[0]).toMatchObject({ name: '', className: 0 })
    expect(result.current.characters[1]).toMatchObject({ name: 'b', className: '-' })
  })

  it.each([
    ['ac', { ac: '6' }, { ac: 10 }],
    ['xp', { xp: null }, { xp: 0 }],
    ['level', { level: '2' }, { level: 1 }],
    ['portrait focus', { portraitFocusX: '1', portraitFocusY: null }, { portraitFocusX: 50, portraitFocusY: 50 }],
    ['portrait path', { portraitPath: 7 }, { portraitPath: '' }],
    ['portrait URL', { portraitUrl: 7 }, { portraitUrl: null }],
    ['token icon', { tokenIcon: null }, { tokenIcon: DEFAULT_TOKEN_ICON }],
  ])('uses the default %s when the stored one is mistyped', (_label, fields, expected) => {
    const { result } = renderCharacters()

    emitCharacters([ownDoc('a', fields)])

    expect(result.current.characters[0]).toMatchObject(expected)
  })

  it.each([
    [{ ownerUsername: 'stored' }, 'user-1', 'stored'],
    [{ ownerUsername: 4 }, 'user-1', 'Player One'],
    [{}, 'user-2', null],
  ])('reads the owner name of %o owned by %s as %s', (fields, ownerUserId, expected) => {
    const { result } = renderCharacters()

    emitCharacters([stored('a', { ownerUserId, ...fields })])

    expect(result.current.characters[0].ownerUsername).toBe(expected)
  })

  it('names an unowned character after the current user when the user id is empty', () => {
    const { result } = renderCharacters({ ...gmProps, userId: '' })

    emitCharacters([stored('a', {})])

    expect(result.current.characters[0].ownerUsername).toBe('Player One')
  })

  it.each([
    [{}, 'new', false, 'active'],
    [{ creationMode: 'established' }, 'new', false, 'active'],
    [{ creationModeExplicit: true }, 'new', true, 'draft'],
    [{ creationModeExplicit: true, creationMode: 'new' }, 'new', true, 'draft'],
    [{ creationModeExplicit: true, creationMode: 'established' }, 'established', true, 'active'],
    [{ creationModeExplicit: 'yes', creationMode: 'established' }, 'new', false, 'active'],
    [{ creationStatus: 'draft' }, 'new', false, 'draft'],
    [{ creationStatus: 'established_draft' }, 'new', false, 'established_draft'],
    [{ creationModeExplicit: true, creationStatus: 'active' }, 'new', true, 'active'],
    [{ creationModeExplicit: true, creationStatus: 'retired' }, 'new', true, 'draft'],
    [{ creationStatus: 'retired' }, 'new', false, 'active'],
  ])('reads creation fields %o as %s / explicit %s / %s', (fields, mode, explicit, status) => {
    const { result } = renderCharacters()

    emitCharacters([ownDoc('a', fields)])

    expect(result.current.characters[0]).toMatchObject({
      creationMode: mode,
      creationModeExplicit: explicit,
      creationStatus: status,
    })
  })

  it.each([
    ['max below zero', { hpCurrent: 3, hpMax: -4 }, { hpCurrent: 0, hpMax: 0 }],
    ['current above max', { hpCurrent: 12, hpMax: 8 }, { hpCurrent: 8, hpMax: 8 }],
    ['current below zero', { hpCurrent: -2, hpMax: 8 }, { hpCurrent: 0, hpMax: 8 }],
    ['mistyped', { hpCurrent: '3', hpMax: '8' }, { hpCurrent: 0, hpMax: 0 }],
  ])('clamps hit points when %s', (_label, fields, expected) => {
    const { result } = renderCharacters()

    emitCharacters([ownDoc('a', fields)])

    expect(result.current.characters[0]).toMatchObject(expected)
  })

  it('copies stored sheet details without the retired AC override', () => {
    const { result } = renderCharacters()
    const details = { notes: 'Brave', acManualOverride: 4, abilities: { str: 12 } }

    emitCharacters([ownDoc('a', { details })])

    expect(result.current.characters[0].details).toEqual({ notes: 'Brave', abilities: { str: 12 } })
    expect(details.acManualOverride).toBe(4)
  })

  it.each([
    ['null', null, null],
    ['a string', 'notes', null],
    ['a list', ['x'], { 0: 'x' }],
  ])('reads stored details that are %s', (_label, details, expected) => {
    const { result } = renderCharacters()

    emitCharacters([ownDoc('a', { details })])

    expect(result.current.characters[0].details).toEqual(expected)
  })

  it('keeps a stored token image URL', () => {
    const { result } = renderCharacters()
    const tokenIcon = { ...DEFAULT_TOKEN_ICON, customImagePath: 't.png', customImageUrl: 'https://cdn.test/stored-t.png' }

    emitCharacters([ownDoc('a', { tokenIcon })])

    expect(result.current.characters[0].tokenIcon).toEqual(tokenIcon)
  })
})

describe('useCharacters visibility and selection', () => {
  const party = [
    stored('gm-npc', { ownerUserId: 'gm-1' }),
    stored('other', { ownerUserId: 'user-2' }),
    ownDoc('mine'),
  ]

  it('hides the GM\'s own characters from a player', () => {
    const { result } = renderCharacters()

    emitCharacters(party)

    expect(ids(result.current.characters)).toEqual(['other', 'mine'])
  })

  it('shows every character to the GM', () => {
    const { result } = renderCharacters(gmProps)

    emitCharacters(party)

    expect(ids(result.current.characters)).toEqual(['gm-npc', 'other', 'mine'])
  })

  it('selects the user\'s own character first, then the first one listed, then nothing', () => {
    const { result } = renderCharacters(gmProps)

    emitCharacters([stored('other', { ownerUserId: 'user-2' }), stored('gm-own', { ownerUserId: 'gm-1' })])
    expect(result.current.selectedCharacterId).toBe('gm-own')
    expect(result.current.selectedCharacter?.id).toBe('gm-own')

    act(() => result.current.setSelectedCharacterId('gone'))
    emitCharacters([stored('other', { ownerUserId: 'user-2' }), stored('third', { ownerUserId: 'user-3' })])
    expect(result.current.selectedCharacterId).toBe('other')

    emitCharacters([])
    expect(result.current.selectedCharacterId).toBe('')
    expect(result.current.selectedCharacter).toBeNull()
  })

  it('prefers the current character over the user\'s own one when the selection is gone', () => {
    const { result } = renderCharacters(gmProps)

    emitUserState({ currentCharacterId: 'other' }, `${CAMPAIGN}/userState/gm-1`)
    emitCharacters([ownDoc('mine', { ownerUserId: 'gm-1' }), stored('other', { ownerUserId: 'user-2' })])

    expect(result.current.selectedCharacterId).toBe('other')
  })

  it('falls back to the user\'s own character when the current one is not listed', () => {
    const { result } = renderCharacters(gmProps)

    emitUserState({ currentCharacterId: 'gone' }, `${CAMPAIGN}/userState/gm-1`)
    emitCharacters([stored('other', { ownerUserId: 'user-2' }), stored('mine', { ownerUserId: 'gm-1' })])

    expect(result.current.selectedCharacterId).toBe('mine')
  })

  it('keeps a selection that is still listed', () => {
    const { result } = renderCharacters()
    emitCharacters(party)

    act(() => result.current.setSelectedCharacterId('other'))
    emitCharacters(party)

    expect(result.current.selectedCharacterId).toBe('other')
  })
})

describe('useCharacters current character fallback', () => {
  it('makes a player\'s first own character current when none is', async () => {
    const { result } = renderCharacters()

    emitCharacters([stored('other', { ownerUserId: 'user-2' }), ownDoc('first'), ownDoc('second')])
    await flushMicrotasks()

    expect(result.current.currentCharacterId).toBe('first')
    expect(userStateSaves()).toEqual([[
      { path: USER_STATE_PATH },
      { currentCharacterId: 'first', updatedAt: SERVER_TIMESTAMP },
      { merge: true },
    ]])
  })

  it('replaces a current character the player does not own', async () => {
    const { result } = renderCharacters()

    emitUserState({ currentCharacterId: 'other' })
    emitCharacters([stored('other', { ownerUserId: 'user-2' }), ownDoc('mine')])
    await flushMicrotasks()

    expect(result.current.currentCharacterId).toBe('mine')
    expect(userStateSaves()).toHaveLength(1)
  })

  it('leaves a player\'s own current character alone', async () => {
    const { result } = renderCharacters()

    emitUserState({ currentCharacterId: 'second' })
    emitCharacters([ownDoc('first'), ownDoc('second')])
    await flushMicrotasks()

    expect(result.current.currentCharacterId).toBe('second')
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('does nothing for a player who owns no character', async () => {
    const { result } = renderCharacters()

    emitCharacters([stored('other', { ownerUserId: 'user-2' })])
    await flushMicrotasks()

    expect(result.current.currentCharacterId).toBeNull()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('does nothing for the GM', async () => {
    const { result } = renderCharacters(gmProps)

    emitCharacters([stored('mine', { ownerUserId: 'gm-1' })])
    await flushMicrotasks()

    expect(result.current.currentCharacterId).toBeNull()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('runs again when the role changes, so a GM who becomes a player gets a current character', async () => {
    const { result, rerender } = renderCharacters(gmProps)
    emitCharacters([stored('mine', { ownerUserId: 'gm-1' })])
    expect(mocks.setDoc).not.toHaveBeenCalled()

    rerender({ ...baseProps, ...gmProps, role: 'player' })
    await flushMicrotasks()

    expect(result.current.currentCharacterId).toBe('mine')
    expect(userStateSaves()).toEqual([[
      { path: `${CAMPAIGN}/userState/gm-1` },
      { currentCharacterId: 'mine', updatedAt: SERVER_TIMESTAMP },
      { merge: true },
    ]])
  })

  it('does not write when the group goes in the same render as the role becomes player', async () => {
    const { result, rerender } = renderCharacters(gmProps)
    emitCharacters([stored('mine', { ownerUserId: 'gm-1' })])

    rerender({ ...baseProps, ...gmProps, role: 'player', groupId: null })
    await flushMicrotasks()

    expect(result.current.currentCharacterId).toBeNull()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})

describe('useCharacters media', () => {
  it('resolves missing portrait and token image URLs from their storage paths', async () => {
    const { result } = renderCharacters()

    emitCharacters([ownDoc('a', {
      portraitPath: 'portraits/a.png',
      tokenIcon: { icon: 'pawn', color: '#000', size: 30, customImagePath: 'tokens/a.png' },
    })])
    await flushMicrotasks()
    await flushMicrotasks()

    expect(mocks.resolveStoragePathUrl.mock.calls).toEqual([['portraits/a.png'], ['tokens/a.png']])
    expect(result.current.characters[0].portraitUrl).toBe('https://cdn.test/portraits/a.png')
    expect(result.current.characters[0].tokenIcon.customImageUrl).toBe('https://cdn.test/tokens/a.png')
  })

  it('heals only the character whose image is missing', async () => {
    const { result } = renderCharacters()

    emitCharacters([ownDoc('a', { portraitPath: 'portraits/a.png' }), ownDoc('b', { name: 'Untouched' })])
    await flushMicrotasks()
    await flushMicrotasks()

    expect(result.current.characters[0].portraitUrl).toBe('https://cdn.test/portraits/a.png')
    expect(result.current.characters[1]).toMatchObject({ name: 'Untouched', portraitUrl: null })
  })

  it('resolves only the image that is missing', async () => {
    const { result } = renderCharacters()

    emitCharacters([ownDoc('a', {
      tokenIcon: { icon: 'pawn', color: '#000', size: 30, customImagePath: 'tokens/a.png' },
    })])
    await flushMicrotasks()
    await flushMicrotasks()

    expect(mocks.resolveStoragePathUrl.mock.calls).toEqual([['tokens/a.png']])
    expect(result.current.characters[0].portraitUrl).toBeNull()
  })

  it('looks an image up again after a lookup finds nothing', async () => {
    mocks.resolveStoragePathUrl.mockResolvedValueOnce(null)
    const { result } = renderCharacters()

    emitCharacters([ownDoc('a', { portraitPath: 'portraits/a.png' })])
    await flushMicrotasks()
    await flushMicrotasks()

    expect(mocks.resolveStoragePathUrl.mock.calls).toEqual([['portraits/a.png'], ['portraits/a.png']])
    expect(result.current.characters[0].tokenIcon).toEqual(DEFAULT_TOKEN_ICON)
    expect(result.current.characters[0].portraitUrl).toBe('https://cdn.test/portraits/a.png')
  })

  it('swallows a failed lookup', async () => {
    mocks.resolveStoragePathUrl.mockRejectedValue(new Error('denied'))
    const { result } = renderCharacters()

    emitCharacters([ownDoc('a', { portraitPath: 'portraits/a.png' })])
    await flushMicrotasks()
    await flushMicrotasks()

    expect(result.current.characters[0].portraitUrl).toBeNull()
    expect(setError).not.toHaveBeenCalled()
  })

  it('does not look up images that already have renderable URLs', async () => {
    renderCharacters()

    emitCharacters([ownDoc('a', {
      portraitPath: 'portraits/a.png',
      portraitUrl: 'data:image/png;base64,AAAA',
      tokenIcon: { icon: 'pawn', color: '#000', size: 30, customImagePath: 'tokens/a.png', customImageUrl: 'https://cdn.test/t.png' },
    })])
    await flushMicrotasks()

    expect(mocks.resolveStoragePathUrl).not.toHaveBeenCalled()
  })

  it('keeps a resolved URL across snapshots while the storage path is unchanged', async () => {
    const { result } = renderCharacters()
    const tokenIcon = { icon: 'pawn', color: '#000', size: 30, customImagePath: 'tokens/a.png' }
    emitCharacters([ownDoc('a', { portraitPath: 'portraits/a.png', tokenIcon })])
    await flushMicrotasks()
    await flushMicrotasks()
    mocks.resolveStoragePathUrl.mockClear()

    emitCharacters([ownDoc('a', { portraitPath: 'portraits/a.png', tokenIcon, name: 'Renamed' })])
    await flushMicrotasks()

    expect(result.current.characters[0]).toMatchObject({
      name: 'Renamed',
      portraitUrl: 'https://cdn.test/portraits/a.png',
      tokenIcon: { customImageUrl: 'https://cdn.test/tokens/a.png' },
    })
    expect(mocks.resolveStoragePathUrl).not.toHaveBeenCalled()
  })

  it('drops a resolved URL once the storage path changes', () => {
    mocks.resolveStoragePathUrl.mockResolvedValue(null)
    const { result } = renderCharacters()
    const tokenIcon = { icon: 'pawn', color: '#000', size: 30, customImagePath: 'tokens/a.png', customImageUrl: 'https://cdn.test/old-t.png' }
    emitCharacters([ownDoc('a', { portraitPath: 'portraits/a.png', portraitUrl: 'https://cdn.test/old.png', tokenIcon })])

    emitCharacters([ownDoc('a', {
      portraitPath: 'portraits/b.png',
      tokenIcon: { icon: 'pawn', color: '#000', size: 30, customImagePath: 'tokens/b.png' },
    })])

    expect(result.current.characters[0].portraitUrl).toBeNull()
    expect(result.current.characters[0].tokenIcon.customImageUrl).toBeUndefined()
  })

  it('does not carry over a local URL that is not renderable', () => {
    mocks.resolveStoragePathUrl.mockResolvedValue(null)
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a', { portraitPath: 'p.png' })])
    act(() => result.current.syncCharacterLocal('a', {
      portraitUrl: 'blob:local',
      tokenIcon: { icon: 'pawn', color: '#000', size: 30, customImagePath: 't.png', customImageUrl: 'blob:t' },
    }))

    emitCharacters([ownDoc('a', {
      portraitPath: 'p.png',
      tokenIcon: { icon: 'pawn', color: '#000', size: 30, customImagePath: 't.png' },
    })])

    expect(result.current.characters[0].portraitUrl).toBeNull()
    expect(result.current.characters[0].tokenIcon.customImageUrl).toBeUndefined()
  })
})

describe('useCharacters updateCharacter', () => {
  it('applies the edit at once and saves the latest copy half a second after the last edit', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a', {
      name: 'Old',
      class: 'Fighter',
      level: 2,
      hpCurrent: 5,
      hpMax: 8,
      portraitPath: 'p.png',
      portraitUrl: 'https://cdn.test/p.png',
    })])
    mocks.setDoc.mockClear()

    act(() => result.current.updateCharacter('a', { name: 'First' }))
    expect(result.current.characters[0].name).toBe('First')
    act(() => vi.advanceTimersByTime(400))
    act(() => result.current.updateCharacter('a', { xp: 3 }))
    act(() => vi.advanceTimersByTime(499))
    expect(mocks.setDoc).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))

    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    const [ref, data, options] = mocks.setDoc.mock.calls[0]
    expect(ref).toEqual({ path: `${CHARACTERS_PATH}/a` })
    expect(options).toEqual({ merge: true })
    expect(data).toEqual({
      name: 'First',
      ownerUserId: 'user-1',
      ownerUsername: 'Player One',
      creationMode: 'new',
      creationModeExplicit: false,
      creationStatus: 'active',
      class: 'Fighter',
      level: 2,
      hpCurrent: 5,
      hpMax: 8,
      ac: 10,
      xp: 3,
      portraitPath: 'p.png',
      portraitFocusX: 50,
      portraitFocusY: 50,
      tokenIcon: DEFAULT_TOKEN_ICON,
      details: null,
      'details.acManualOverride': DELETE_FIELD,
      updatedAt: SERVER_TIMESTAMP,
    })
  })

  it('applies two edits made in one go on top of each other', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a')])

    act(() => {
      result.current.updateCharacter('a', { name: 'Named' })
      result.current.updateCharacter('a', { xp: 9 })
    })

    expect(result.current.characters[0]).toMatchObject({ name: 'Named', xp: 9 })
  })

  it('saves a deep copy of the details and never the token image URL', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a', {
      tokenIcon: { icon: 'pawn', color: '#000', size: 30, customImagePath: 't.png', customImageUrl: 'https://cdn.test/t.png' },
    })])
    const details = { notes: 'Brave', inventory: [{ id: 'i1', name: 'Rope' }] } as unknown as CharacterRecord['details']

    act(() => result.current.updateCharacter('a', { details }))
    act(() => vi.advanceTimersByTime(500))

    const data = characterSaves()[0][1] as Record<string, unknown>
    expect(data.details).toEqual(details)
    expect(data.details).not.toBe(details)
    expect(data.tokenIcon).toEqual({ icon: 'pawn', color: '#000', size: 30, customImagePath: 't.png' })
  })

  it('saves an empty portrait path and no owner name when the character has neither', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a')])

    act(() => result.current.updateCharacter('a', { portraitPath: undefined, ownerUsername: undefined }))
    act(() => vi.advanceTimersByTime(500))

    expect(characterSaves()[0][1]).toMatchObject({ portraitPath: '', ownerUsername: null })
  })

  it.each([
    ['a negative max', { hpCurrent: 6, hpMax: 10 }, { hpMax: -3 }, { hpCurrent: 6, hpMax: 0 }],
    ['current above the new max', { hpCurrent: 6, hpMax: 10 }, { hpCurrent: 9, hpMax: 4 }, { hpCurrent: 4, hpMax: 4 }],
    ['current above the stored max', { hpCurrent: 6, hpMax: 10 }, { hpCurrent: 15 }, { hpCurrent: 10, hpMax: 10 }],
    ['current below zero', { hpCurrent: 6, hpMax: 10 }, { hpCurrent: -1 }, { hpCurrent: 0, hpMax: 10 }],
  ])('clamps hit points for %s', (_label, storedHp, updates, expected) => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a', storedHp)])

    act(() => result.current.updateCharacter('a', updates))

    expect(result.current.characters[0]).toMatchObject(expected)
  })

  it('does not lower the current hit points when only the max is lowered', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a', { hpCurrent: 8, hpMax: 10 })])

    act(() => result.current.updateCharacter('a', { hpMax: 5 }))

    expect(result.current.characters[0]).toMatchObject({ hpCurrent: 8, hpMax: 5 })
  })

  it('does not change the updates the caller passed', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a', { hpMax: 10 })])
    const updates = { hpCurrent: 20, hpMax: -1 }

    act(() => result.current.updateCharacter('a', updates))

    expect(updates).toEqual({ hpCurrent: 20, hpMax: -1 })
  })

  it('saves each edited character separately', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a'), ownDoc('b')])

    act(() => {
      result.current.updateCharacter('a', { name: 'A' })
      result.current.updateCharacter('b', { name: 'B' })
    })
    act(() => vi.advanceTimersByTime(500))

    expect(savePaths()).toEqual([`${CHARACTERS_PATH}/a`, `${CHARACTERS_PATH}/b`])
  })

  it('ignores an unknown character', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a')])

    act(() => result.current.updateCharacter('missing', { name: 'X' }))
    act(() => vi.advanceTimersByTime(500))

    expect(ids(result.current.characters)).toEqual(['a'])
    expect(characterSaves()).toEqual([])
  })

  it('stops a player editing someone else\'s character', () => {
    const { result } = renderCharacters()
    emitCharacters([stored('theirs', { ownerUserId: 'user-2', name: 'Theirs' })])

    act(() => result.current.updateCharacter('theirs', { name: 'Mine now' }))
    act(() => vi.advanceTimersByTime(500))

    expect(result.current.characters[0].name).toBe('Theirs')
    expect(characterSaves()).toEqual([])
  })

  it('lets the GM edit anyone\'s character', () => {
    const { result } = renderCharacters(gmProps)
    emitCharacters([stored('theirs', { ownerUserId: 'user-2' })])

    act(() => result.current.updateCharacter('theirs', { name: 'Edited' }))
    act(() => vi.advanceTimersByTime(500))

    expect(result.current.characters[0].name).toBe('Edited')
    expect(savePaths()).toEqual([`${CHARACTERS_PATH}/theirs`])
  })

  it('keeps the local copy over snapshots while a save is waiting or in flight, then takes the stored copy', async () => {
    let finishSave: () => void = () => undefined
    const { result } = renderCharacters(gmProps)
    emitCharacters([ownDoc('a', { name: 'Stored' })])
    mocks.setDoc.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      finishSave = () => resolve(undefined)
    }))

    act(() => result.current.updateCharacter('a', { name: 'Local' }))
    emitCharacters([ownDoc('a', { name: 'Stored' })])
    expect(result.current.characters[0].name).toBe('Local')
    expect(result.current.hasPendingWrite('a')).toBe(true)

    act(() => vi.advanceTimersByTime(500))
    emitCharacters([ownDoc('a', { name: 'Stored' })])
    expect(result.current.characters[0].name).toBe('Local')
    expect(result.current.hasPendingWrite('a')).toBe(true)

    await act(async () => {
      finishSave()
      await Promise.resolve()
    })
    expect(result.current.hasPendingWrite('a')).toBe(false)
    emitCharacters([ownDoc('a', { name: 'Stored' })])
    expect(result.current.characters[0].name).toBe('Stored')
  })

  it('reports no outstanding save for a character that was never edited', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a')])

    expect(result.current.hasPendingWrite('a')).toBe(false)
    expect(result.current.hasPendingWrite('missing')).toBe(false)
  })

  it('reads a stored document whose save is waiting when there is no local copy of it', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a', { name: 'Stored' })])

    act(() => result.current.updateCharacter('a', { name: 'Local' }))
    emitCharacters([])
    emitCharacters([ownDoc('a', { name: 'Stored again' })])

    expect(result.current.characters[0].name).toBe('Stored again')
  })

  it('drops a waiting save whose character is gone when it comes due', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a')])

    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    emitCharacters([])
    act(() => vi.advanceTimersByTime(500))

    expect(characterSaves()).toEqual([])
    expect(result.current.hasPendingWrite('a')).toBe(false)
  })

  it('cancels a waiting save when the sheet closes', () => {
    const { result, unmount } = renderCharacters()
    emitCharacters([ownDoc('a')])

    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    unmount()
    vi.advanceTimersByTime(500)

    expect(characterSaves()).toEqual([])
  })

  it('forgets a save in flight when the sheet closes', async () => {
    const { result, unmount } = renderCharacters()
    emitCharacters([ownDoc('a')])
    mocks.setDoc.mockImplementationOnce(() => new Promise<undefined>(() => undefined))

    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    act(() => vi.advanceTimersByTime(500))
    expect(result.current.hasPendingWrite('a')).toBe(true)
    const { hasPendingWrite } = result.current
    unmount()

    expect(hasPendingWrite('a')).toBe(false)
  })

  it('does not save once the campaign is gone, because the list is cleared with it', () => {
    const { result, rerender } = renderCharacters()
    emitCharacters([ownDoc('a')])

    rerender({ ...baseProps, campaignId: null })
    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    act(() => vi.advanceTimersByTime(500))

    expect(result.current.characters).toEqual([])
    expect(characterSaves()).toEqual([])
  })

  it('saves to the campaign the edit was made in, even after the campaign changes', () => {
    const { result, rerender } = renderCharacters()
    emitCharacters([ownDoc('a')])

    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    rerender({ ...baseProps, campaignId: 'campaign-2' })
    act(() => vi.advanceTimersByTime(500))

    expect(savePaths()).toEqual([`${CHARACTERS_PATH}/a`])
  })

  it('keeps the local copy of a waiting save in another campaign\'s snapshot of the same id', () => {
    const { result, rerender } = renderCharacters()
    emitCharacters([ownDoc('a', { name: 'Campaign one' })])

    act(() => result.current.updateCharacter('a', { name: 'Edited in one' }))
    rerender({ ...baseProps, campaignId: 'campaign-2' })
    emitCharacters([ownDoc('a', { name: 'Campaign two' })], CAMPAIGN_2_CHARACTERS_PATH)

    expect(result.current.characters[0].name).toBe('Edited in one')
  })

  it('writes another campaign\'s character of the same id over the original when the list was cleared in between', () => {
    const { result, rerender } = renderCharacters()
    emitCharacters([ownDoc('a', { name: 'Campaign one' })])

    act(() => result.current.updateCharacter('a', { name: 'Edited in one' }))
    rerender({ ...baseProps, enabled: false })
    rerender({ ...baseProps, campaignId: 'campaign-2' })
    emitCharacters([ownDoc('a', { name: 'Campaign two' })], CAMPAIGN_2_CHARACTERS_PATH)
    act(() => vi.advanceTimersByTime(500))

    expect(result.current.characters[0].name).toBe('Campaign two')
    expect(characterSaves().map(([ref, data]) => [(ref as { path: string }).path, (data as { name: string }).name]))
      .toEqual([[`${CHARACTERS_PATH}/a`, 'Campaign two']])
  })
})

describe('useCharacters syncCharacterLocal', () => {
  it('changes the local copy only, for anyone\'s character, without saving', () => {
    const { result } = renderCharacters()
    emitCharacters([stored('theirs', { ownerUserId: 'user-2' }), ownDoc('mine')])

    act(() => result.current.syncCharacterLocal('theirs', { name: 'Synced' }))
    act(() => vi.advanceTimersByTime(500))

    expect(result.current.characters.map((character) => character.name)).toEqual(['Synced', 'mine'])
    expect(characterSaves()).toEqual([])
    expect(result.current.hasPendingWrite('theirs')).toBe(false)
  })

  it('is the copy a later edit starts from', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a')])

    act(() => result.current.syncCharacterLocal('a', { portraitPath: 'synced.png' }))
    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    act(() => vi.advanceTimersByTime(500))

    expect(characterSaves()[0][1]).toMatchObject({ name: 'Edited', portraitPath: 'synced.png' })
  })
})

describe('useCharacters deleteCharacter', () => {
  it('removes the user\'s own character and deletes its document', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a'), ownDoc('b')])

    act(() => result.current.deleteCharacter('b'))

    expect(ids(result.current.characters)).toEqual(['a'])
    expect(result.current.selectedCharacterId).toBe('a')
    expect(mocks.deleteDoc).toHaveBeenCalledWith({ path: `${CHARACTERS_PATH}/b` })
  })

  it('selects the first remaining character when the selected one is deleted', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a'), ownDoc('b'), ownDoc('c')])
    act(() => result.current.setSelectedCharacterId('b'))

    act(() => result.current.deleteCharacter('b'))

    expect(result.current.selectedCharacterId).toBe('a')
  })

  it('clears the selection when the last character is deleted', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a')])

    act(() => result.current.deleteCharacter('a'))

    expect(result.current.characters).toEqual([])
    expect(result.current.selectedCharacterId).toBe('')
  })

  it('cancels a waiting save of the deleted character', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a'), ownDoc('b')])

    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    act(() => result.current.deleteCharacter('a'))
    act(() => vi.advanceTimersByTime(500))

    expect(characterSaves()).toEqual([])
    expect(result.current.hasPendingWrite('a')).toBe(false)
  })

  it('forgets a save of the deleted character that is in flight', () => {
    const { result } = renderCharacters()
    emitCharacters([ownDoc('a'), ownDoc('b')])
    mocks.setDoc.mockImplementation(() => new Promise<undefined>(() => undefined))

    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    act(() => vi.advanceTimersByTime(500))
    expect(result.current.hasPendingWrite('a')).toBe(true)
    act(() => result.current.deleteCharacter('a'))

    expect(result.current.hasPendingWrite('a')).toBe(false)
    emitCharacters([ownDoc('a', { name: 'Stored' }), ownDoc('b')])
    expect(result.current.characters[0].name).toBe('Stored')
  })

  it('lets the GM delete anyone\'s character', () => {
    const { result } = renderCharacters(gmProps)
    emitCharacters([stored('a', { ownerUserId: 'user-2' })])

    act(() => result.current.deleteCharacter('a'))

    expect(result.current.characters).toEqual([])
    expect(mocks.deleteDoc).toHaveBeenCalledTimes(1)
  })

  it('stops a player deleting someone else\'s character, or an unknown one', () => {
    const { result } = renderCharacters()
    emitCharacters([stored('theirs', { ownerUserId: 'user-2' })])

    act(() => {
      result.current.deleteCharacter('theirs')
      result.current.deleteCharacter('missing')
    })

    expect(ids(result.current.characters)).toEqual(['theirs'])
    expect(mocks.deleteDoc).not.toHaveBeenCalled()
  })

  it.each([
    ['campaign', { campaignId: null }],
    ['group', { groupId: null }],
  ])('does nothing once the %s is gone', (_label, overrides) => {
    const { result, rerender } = renderCharacters({ enabled: false })

    rerender({ ...baseProps, ...overrides })
    act(() => result.current.deleteCharacter('a'))

    expect(mocks.deleteDoc).not.toHaveBeenCalled()
  })
})

describe('useCharacters setCurrentCharacter', () => {
  it('marks the user\'s own character as current and remembers it', async () => {
    const { result } = renderCharacters()
    emitUserState({ currentCharacterId: 'a' })
    emitCharacters([ownDoc('a'), ownDoc('b')])

    await act(async () => { await result.current.setCurrentCharacter('b') })

    expect(result.current.currentCharacterId).toBe('b')
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { path: USER_STATE_PATH },
      { currentCharacterId: 'b', updatedAt: SERVER_TIMESTAMP },
      { merge: true },
    )
  })

  it('lets the GM make anyone\'s character current', async () => {
    const { result } = renderCharacters({ role: 'gm' })
    emitCharacters([stored('theirs', { ownerUserId: 'user-2' })])

    await act(async () => { await result.current.setCurrentCharacter('theirs') })

    expect(result.current.currentCharacterId).toBe('theirs')
  })

  it('stops a player choosing someone else\'s character, or an unknown one', async () => {
    const { result } = renderCharacters()
    emitCharacters([stored('theirs', { ownerUserId: 'user-2' })])

    await act(async () => {
      await result.current.setCurrentCharacter('theirs')
      await result.current.setCurrentCharacter('missing')
    })

    expect(result.current.currentCharacterId).toBeNull()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('passes a failed save back to the caller', async () => {
    const { result } = renderCharacters({ role: 'gm' })
    emitCharacters([stored('a', { ownerUserId: 'user-2' })])
    mocks.setDoc.mockRejectedValueOnce(new Error('denied'))

    await expect(act(async () => { await result.current.setCurrentCharacter('a') })).rejects.toThrow('denied')
  })

  it.each([
    ['campaign', { campaignId: null }],
    ['group', { groupId: null }],
    ['role', { role: null }],
  ])('does nothing once the %s is gone', async (_label, overrides) => {
    const { result, rerender } = renderCharacters({ role: 'gm' })
    emitCharacters([ownDoc('a')])

    rerender({ ...baseProps, role: 'gm', ...overrides })
    await act(async () => { await result.current.setCurrentCharacter('a') })

    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(result.current.currentCharacterId).toBeNull()
  })
})
