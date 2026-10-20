// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { Role } from '../../types/app'
import { defaultVtmSheet, defaultVtmTokenIcon } from './vtmDefaults'
import type { VtmCharacterRecord } from './vtmTypes'

type StoredDoc = { id: string; data: () => Record<string, unknown> | undefined }
type Listener = { next: (snap: unknown) => void; fail: (error: unknown) => void }

const SERVER_TIMESTAMP = { sentinel: 'serverTimestamp' }

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, { next: (snap: unknown) => void; fail: (error: unknown) => void }>,
  subscribedTo: [] as string[],
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  deleteDoc: vi.fn(async (..._args: unknown[]) => undefined),
  resolveStoragePathUrl: vi.fn(async (path: string): Promise<string | null> => `https://cdn.test/${path}`),
}))

vi.mock('../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  deleteDoc: mocks.deleteDoc,
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
vi.mock('../common/mediaStorage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../common/mediaStorage')>()),
  resolveStoragePathUrl: mocks.resolveStoragePathUrl,
}))

const { useVtmCharacters } = await import('./useVtmCharacters')

const CAMPAIGN = 'groups/group-1/campaigns/campaign-1'
const CHARACTERS_PATH = `${CAMPAIGN}/characters`
const USER_STATE_PATH = `${CAMPAIGN}/userState/user-1`

type Props = {
  campaignId: string | null
  groupId: string | null
  userId: string
  role: Role | null
  gmUserId: string | null
  enabled: boolean
}

const baseProps: Props = {
  campaignId: 'campaign-1',
  groupId: 'group-1',
  userId: 'user-1',
  role: 'player',
  gmUserId: 'gm-1',
  enabled: true,
}

const setError = vi.fn()

function renderCharacters(overrides: Partial<Props> = {}) {
  return renderHook(
    (props: Props) => useVtmCharacters(
      props.campaignId,
      props.groupId,
      props.userId,
      'Player One',
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
const vtmDoc = (id: string, fields: Record<string, unknown> = {}) =>
  stored(id, { system: 'vtm', ownerUserId: 'user-1', ...fields })

function emitCharacters(docs: StoredDoc[], path = CHARACTERS_PATH) {
  act(() => mocks.listeners[path]?.next({ docs }))
}

function emitUserState(data: Record<string, unknown> | undefined, path = USER_STATE_PATH) {
  act(() => mocks.listeners[path]?.next({ data: () => data }))
}

const ids = (characters: VtmCharacterRecord[]) => characters.map((character) => character.id)
const savedPaths = () => mocks.setDoc.mock.calls.map(([ref]) => (ref as { path: string }).path)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.listeners = {}
  mocks.subscribedTo = []
  mocks.resolveStoragePathUrl.mockImplementation(async (path: string) => `https://cdn.test/${path}`)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useVtmCharacters subscriptions', () => {
  it('subscribes to nothing and reports no characters while disabled', async () => {
    const { result } = renderCharacters({ enabled: false })
    await flushMicrotasks()

    expect(mocks.subscribedTo).toEqual([])
    expect(result.current.characters).toEqual([])
    expect(result.current.charactersLoading).toBe(false)
    expect(result.current.currentCharacterId).toBeNull()
  })

  it.each([
    ['campaign', { campaignId: null }],
    ['group', { groupId: null }],
  ])('subscribes to nothing without a %s', async (_label, overrides) => {
    renderCharacters(overrides)
    await flushMicrotasks()

    expect(mocks.subscribedTo).toEqual([])
  })

  it('reads the current character but not the roster without a role', async () => {
    const { result } = renderCharacters({ role: null })
    await flushMicrotasks()

    expect(mocks.subscribedTo).toEqual([USER_STATE_PATH])
    expect(result.current.charactersLoading).toBe(false)
  })

  it('loads until the first roster snapshot arrives', async () => {
    const { result } = renderCharacters()
    await flushMicrotasks()

    expect(mocks.subscribedTo).toEqual([USER_STATE_PATH, CHARACTERS_PATH])
    expect(result.current.charactersLoading).toBe(true)

    emitCharacters([vtmDoc('a')])

    expect(result.current.charactersLoading).toBe(false)
    expect(ids(result.current.characters)).toEqual(['a'])
  })

  it('clears the roster and stops listening when it is disabled', async () => {
    const { result, rerender } = renderCharacters()
    emitCharacters([vtmDoc('a')])

    rerender({ ...baseProps, enabled: false })
    await flushMicrotasks()

    expect(mocks.listeners[CHARACTERS_PATH]).toBeUndefined()
    expect(mocks.listeners[USER_STATE_PATH]).toBeUndefined()
    expect(result.current.characters).toEqual([])
    expect(result.current.charactersLoading).toBe(false)
    expect(result.current.currentCharacterId).toBeNull()
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

  it('reports user state errors with their message, or a fallback', () => {
    renderCharacters()

    act(() => mocks.listeners[USER_STATE_PATH].fail(new Error('state denied')))
    act(() => mocks.listeners[USER_STATE_PATH].fail('nope'))

    expect(setError.mock.calls).toEqual([['state denied'], ['Unable to load current character']])
  })

  it('reports roster errors with their message, or a fallback, and stops loading', async () => {
    const { result } = renderCharacters()
    await flushMicrotasks()

    act(() => mocks.listeners[CHARACTERS_PATH].fail(new Error('roster denied')))
    expect(result.current.charactersLoading).toBe(false)
    act(() => mocks.listeners[CHARACTERS_PATH].fail({ code: 'x' }))

    expect(setError.mock.calls).toEqual([['roster denied'], ['Unable to load VtM characters']])
  })
})

describe('useVtmCharacters stored records', () => {
  it('skips documents of other systems', () => {
    const { result } = renderCharacters()

    emitCharacters([stored('ose', { system: 'ose', ownerUserId: 'user-1' }), vtmDoc('a')])

    expect(ids(result.current.characters)).toEqual(['a'])
  })

  it('fills every missing field with its default', () => {
    const { result } = renderCharacters({ role: 'gm' })

    emitCharacters([stored('bare', { system: 'vtm' })])

    expect(result.current.characters).toEqual([{
      id: 'bare',
      system: 'vtm',
      name: 'New Vampire',
      ownerUserId: '',
      ownerUsername: null,
      creationMode: 'new',
      creationModeExplicit: false,
      creationStatus: 'draft',
      xp: 0,
      portraitPath: '',
      portraitUrl: null,
      portraitFocusX: 50,
      portraitFocusY: 50,
      tokenIcon: defaultVtmTokenIcon,
      vtm: defaultVtmSheet(),
    }])
  })

  it('keeps every well-typed stored field', () => {
    const { result } = renderCharacters()
    const tokenIcon = { icon: 'bat', color: '#000000', size: 40 }

    emitCharacters([vtmDoc('a', {
      name: 'Lucita',
      ownerUsername: 'player1',
      creationMode: 'established',
      creationModeExplicit: true,
      creationStatus: 'active',
      xp: 12,
      portraitPath: 'portraits/a.png',
      portraitUrl: 'https://cdn.test/stored.png',
      portraitFocusX: 20,
      portraitFocusY: 80,
      tokenIcon,
    })])

    expect(result.current.characters[0]).toMatchObject({
      name: 'Lucita',
      ownerUserId: 'user-1',
      ownerUsername: 'player1',
      creationMode: 'established',
      creationModeExplicit: true,
      creationStatus: 'active',
      xp: 12,
      portraitPath: 'portraits/a.png',
      portraitUrl: 'https://cdn.test/stored.png',
      portraitFocusX: 20,
      portraitFocusY: 80,
      tokenIcon,
    })
  })

  it.each([
    [{ creationMode: 'established' }, 'established', 'established_draft'],
    [{ creationMode: 'established', creationStatus: 'draft' }, 'established', 'draft'],
    [{ creationMode: 'bogus', creationStatus: 'established_draft' }, 'new', 'established_draft'],
    [{ creationStatus: 'retired' }, 'new', 'draft'],
  ])('reads creation fields %o as %s / %s', (fields, mode, status) => {
    const { result } = renderCharacters()

    emitCharacters([vtmDoc('a', fields)])

    expect(result.current.characters[0]).toMatchObject({ creationMode: mode, creationStatus: status })
  })

  it('merges a stored sheet over the default sheet, group by group', () => {
    const { result } = renderCharacters()
    const disciplines = [{ id: 'd1', name: 'Auspex', rating: 2 }]

    emitCharacters([vtmDoc('a', {
      vtm: {
        clan: 'Toreador',
        attributes: { physical: { Strength: 3 }, social: 'broken' },
        abilities: { talents: { Alertness: 2 } },
        virtues: { Courage: 4 },
        health: { Hurt: true },
        disciplines,
        backgrounds: 'not a list',
      },
    })])

    const defaults = defaultVtmSheet()
    const sheet = result.current.characters[0].vtm
    expect(sheet.clan).toBe('Toreador')
    expect(sheet.generation).toBe(defaults.generation)
    expect(sheet.attributes.physical).toEqual({ ...defaults.attributes.physical, Strength: 3 })
    expect(sheet.attributes.social).toEqual(defaults.attributes.social)
    expect(sheet.attributes.mental).toEqual(defaults.attributes.mental)
    expect(sheet.abilities.talents).toEqual({ ...defaults.abilities.talents, Alertness: 2 })
    expect(sheet.abilities.skills).toEqual(defaults.abilities.skills)
    expect(sheet.virtues).toEqual({ ...defaults.virtues, Courage: 4 })
    expect(sheet.health).toEqual({ ...defaults.health, Hurt: true })
    expect(sheet.disciplines).toBe(disciplines)
    expect(sheet.backgrounds).toEqual([])
  })

  it('uses the default groups when the stored sheet has no attribute or ability groups', () => {
    const { result } = renderCharacters()

    emitCharacters([vtmDoc('a', { vtm: { attributes: 'flat', abilities: null, xpLedger: [] } })])

    const defaults = defaultVtmSheet()
    expect(result.current.characters[0].vtm.attributes).toEqual(defaults.attributes)
    expect(result.current.characters[0].vtm.abilities).toEqual(defaults.abilities)
  })

  it('keeps every stored list as it is', () => {
    const { result } = renderCharacters()
    const lists = Object.fromEntries([
      'disciplines', 'backgrounds', 'otherTraits', 'rituals', 'bloodBonds',
      'havens', 'combatWeapons', 'armor', 'xpLedger',
    ].map((key) => [key, [{ id: `${key}-1` }]]))

    emitCharacters([vtmDoc('a', { vtm: lists })])

    expect(result.current.characters[0].vtm).toMatchObject(lists)
  })

  it('uses the default sheet when the stored sheet is not an object', () => {
    const { result } = renderCharacters()

    emitCharacters([vtmDoc('a', { vtm: ['not', 'a', 'sheet'] })])

    expect(result.current.characters[0].vtm).toEqual(defaultVtmSheet())
  })
})

describe('useVtmCharacters visibility and selection', () => {
  const party = [
    vtmDoc('gm-npc', { ownerUserId: 'gm-1' }),
    vtmDoc('other', { ownerUserId: 'user-2' }),
    vtmDoc('mine', { ownerUserId: 'user-1' }),
  ]

  it('hides the GM\'s own characters from a player', () => {
    const { result } = renderCharacters()

    emitCharacters(party)

    expect(ids(result.current.characters)).toEqual(['other', 'mine'])
  })

  it('shows every character to the GM', () => {
    const { result } = renderCharacters({ role: 'gm', userId: 'gm-1' })

    emitCharacters(party)

    expect(ids(result.current.characters)).toEqual(['gm-npc', 'other', 'mine'])
  })

  it('selects the user\'s own character first, then the first one listed, then nothing', () => {
    const { result } = renderCharacters()

    emitCharacters(party)
    expect(result.current.selectedCharacterId).toBe('mine')
    expect(result.current.selectedCharacter?.id).toBe('mine')

    act(() => result.current.setSelectedCharacterId('gone'))
    emitCharacters([vtmDoc('other', { ownerUserId: 'user-2' })])
    expect(result.current.selectedCharacterId).toBe('other')

    emitCharacters([])
    expect(result.current.selectedCharacterId).toBe('')
    expect(result.current.selectedCharacter).toBeNull()
  })

  it('prefers the current character over the user\'s own one when the selection is gone', () => {
    const { result } = renderCharacters()

    emitUserState({ currentCharacterId: 'other' })
    emitCharacters(party)

    expect(result.current.selectedCharacterId).toBe('other')
  })

  it('keeps a selection that is still listed', () => {
    const { result } = renderCharacters()
    emitCharacters(party)

    act(() => result.current.setSelectedCharacterId('other'))
    emitCharacters(party)

    expect(result.current.selectedCharacterId).toBe('other')
  })
})

describe('useVtmCharacters media', () => {
  it('resolves missing portrait and token image URLs from their storage paths', async () => {
    const { result } = renderCharacters()

    emitCharacters([vtmDoc('a', {
      portraitPath: 'portraits/a.png',
      tokenIcon: { icon: 'bat', color: '#000', size: 30, customImagePath: 'tokens/a.png' },
    })])
    await flushMicrotasks()
    await flushMicrotasks()

    expect(mocks.resolveStoragePathUrl.mock.calls).toEqual([['portraits/a.png'], ['tokens/a.png']])
    expect(result.current.characters[0].portraitUrl).toBe('https://cdn.test/portraits/a.png')
    expect(result.current.characters[0].tokenIcon.customImageUrl).toBe('https://cdn.test/tokens/a.png')
  })

  it('heals only the character whose image is missing', async () => {
    const { result } = renderCharacters()

    emitCharacters([vtmDoc('a', { portraitPath: 'portraits/a.png' }), vtmDoc('b', { name: 'Untouched' })])
    await flushMicrotasks()
    await flushMicrotasks()

    expect(result.current.characters[0].portraitUrl).toBe('https://cdn.test/portraits/a.png')
    expect(result.current.characters[1]).toMatchObject({ name: 'Untouched', portraitUrl: null })
  })

  it('resolves only the image that is missing', async () => {
    const { result } = renderCharacters()

    emitCharacters([vtmDoc('a', {
      tokenIcon: { icon: 'bat', color: '#000', size: 30, customImagePath: 'tokens/a.png' },
    })])
    await flushMicrotasks()
    await flushMicrotasks()

    expect(mocks.resolveStoragePathUrl.mock.calls).toEqual([['tokens/a.png']])
    expect(result.current.characters[0].portraitUrl).toBeNull()
  })

  it('looks an image up again after a lookup finds nothing', async () => {
    mocks.resolveStoragePathUrl.mockResolvedValueOnce(null)
    const { result } = renderCharacters()

    emitCharacters([vtmDoc('a', { portraitPath: 'portraits/a.png' })])
    await flushMicrotasks()
    await flushMicrotasks()

    expect(mocks.resolveStoragePathUrl.mock.calls).toEqual([['portraits/a.png'], ['portraits/a.png']])
    expect(result.current.characters[0].tokenIcon).toEqual(defaultVtmTokenIcon)
    expect(result.current.characters[0].portraitUrl).toBe('https://cdn.test/portraits/a.png')
  })

  it('swallows a failed lookup', async () => {
    mocks.resolveStoragePathUrl.mockRejectedValue(new Error('denied'))
    const { result } = renderCharacters()

    emitCharacters([vtmDoc('a', { portraitPath: 'portraits/a.png' })])
    await flushMicrotasks()
    await flushMicrotasks()

    expect(result.current.characters[0].portraitUrl).toBeNull()
    expect(setError).not.toHaveBeenCalled()
  })

  it('does not look up images that already have renderable URLs', async () => {
    renderCharacters()

    emitCharacters([vtmDoc('a', {
      portraitPath: 'portraits/a.png',
      portraitUrl: 'data:image/png;base64,AAAA',
      tokenIcon: { icon: 'bat', color: '#000', size: 30, customImagePath: 'tokens/a.png', customImageUrl: 'https://cdn.test/t.png' },
    })])
    await flushMicrotasks()

    expect(mocks.resolveStoragePathUrl).not.toHaveBeenCalled()
  })

  it('keeps a resolved URL across snapshots while the storage path is unchanged', async () => {
    const { result } = renderCharacters()
    const tokenIcon = { icon: 'bat', color: '#000', size: 30, customImagePath: 'tokens/a.png' }
    emitCharacters([vtmDoc('a', { portraitPath: 'portraits/a.png', tokenIcon })])
    await flushMicrotasks()
    await flushMicrotasks()
    mocks.resolveStoragePathUrl.mockClear()

    emitCharacters([vtmDoc('a', { portraitPath: 'portraits/a.png', tokenIcon, name: 'Renamed' })])
    await flushMicrotasks()

    expect(result.current.characters[0]).toMatchObject({
      name: 'Renamed',
      portraitUrl: 'https://cdn.test/portraits/a.png',
      tokenIcon: { customImageUrl: 'https://cdn.test/tokens/a.png' },
    })
    expect(mocks.resolveStoragePathUrl).not.toHaveBeenCalled()
  })

  it('drops a resolved URL once the storage path changes', async () => {
    mocks.resolveStoragePathUrl.mockResolvedValue(null)
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a', { portraitPath: 'portraits/a.png', portraitUrl: 'https://cdn.test/old.png' })])

    emitCharacters([vtmDoc('a', { portraitPath: 'portraits/b.png' })])

    expect(result.current.characters[0].portraitUrl).toBeNull()
  })
})

describe('useVtmCharacters updateCharacter', () => {
  it('applies the edit at once and saves the latest copy half a second after the last edit', async () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a', { name: 'Old', portraitPath: 'p.png', portraitUrl: 'https://cdn.test/p.png' })])

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
      system: 'vtm',
      name: 'First',
      ownerUserId: 'user-1',
      ownerUsername: null,
      creationMode: 'new',
      creationModeExplicit: false,
      creationStatus: 'draft',
      xp: 3,
      portraitPath: 'p.png',
      portraitFocusX: 50,
      portraitFocusY: 50,
      tokenIcon: defaultVtmTokenIcon,
      vtm: defaultVtmSheet(),
      schemaVersion: 1,
      schemaWrittenAt: SERVER_TIMESTAMP,
      updatedAt: SERVER_TIMESTAMP,
    })
  })

  it('saves a deep copy of the sheet and never the token image URL', () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a', {
      tokenIcon: { icon: 'bat', color: '#000', size: 30, customImagePath: 't.png', customImageUrl: 'https://cdn.test/t.png' },
    })])
    const sheet = { ...defaultVtmSheet(), clan: 'Brujah' }

    act(() => result.current.updateCharacter('a', { vtm: sheet }))
    act(() => vi.advanceTimersByTime(500))

    const data = mocks.setDoc.mock.calls[0][1] as Record<string, unknown>
    expect(data.vtm).toEqual(sheet)
    expect(data.vtm).not.toBe(sheet)
    expect(data.tokenIcon).toEqual({ icon: 'bat', color: '#000', size: 30, customImagePath: 't.png' })
  })

  it('saves an empty portrait path when the character has none', () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a')])

    act(() => result.current.updateCharacter('a', { portraitPath: undefined, ownerUsername: 'p1' }))
    act(() => vi.advanceTimersByTime(500))

    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({ portraitPath: '', ownerUsername: 'p1' })
  })

  it('saves each edited character separately', () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a'), vtmDoc('b')])

    act(() => {
      result.current.updateCharacter('a', { name: 'A' })
      result.current.updateCharacter('b', { name: 'B' })
    })
    act(() => vi.advanceTimersByTime(500))

    expect(savedPaths()).toEqual([`${CHARACTERS_PATH}/a`, `${CHARACTERS_PATH}/b`])
  })

  it('ignores an unknown character', () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a')])

    act(() => result.current.updateCharacter('missing', { name: 'X' }))
    act(() => vi.advanceTimersByTime(500))

    expect(ids(result.current.characters)).toEqual(['a'])
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('stops a player editing someone else\'s character', () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('theirs', { ownerUserId: 'user-2', name: 'Theirs' })])

    act(() => result.current.updateCharacter('theirs', { name: 'Mine now' }))
    act(() => vi.advanceTimersByTime(500))

    expect(result.current.characters[0].name).toBe('Theirs')
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('lets the GM edit anyone\'s character', () => {
    const { result } = renderCharacters({ role: 'gm', userId: 'gm-1' })
    emitCharacters([vtmDoc('theirs', { ownerUserId: 'user-2' })])

    act(() => result.current.updateCharacter('theirs', { name: 'Edited' }))
    act(() => vi.advanceTimersByTime(500))

    expect(result.current.characters[0].name).toBe('Edited')
    expect(savedPaths()).toEqual([`${CHARACTERS_PATH}/theirs`])
  })

  it('keeps the local copy over snapshots while a save is waiting or in flight, then takes the stored copy', async () => {
    let finishSave: () => void = () => undefined
    mocks.setDoc.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      finishSave = () => resolve(undefined)
    }))
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a', { name: 'Stored' })])

    act(() => result.current.updateCharacter('a', { name: 'Local' }))
    emitCharacters([vtmDoc('a', { name: 'Stored' })])
    expect(result.current.characters[0].name).toBe('Local')

    act(() => vi.advanceTimersByTime(500))
    emitCharacters([vtmDoc('a', { name: 'Stored' })])
    expect(result.current.characters[0].name).toBe('Local')

    await act(async () => {
      finishSave()
      await Promise.resolve()
    })
    emitCharacters([vtmDoc('a', { name: 'Stored' })])
    expect(result.current.characters[0].name).toBe('Stored')
  })

  it('keeps the local copy of a waiting save even when the stored document is no longer VtM', () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a', { name: 'Stored' })])

    act(() => result.current.updateCharacter('a', { name: 'Local' }))
    emitCharacters([stored('a', { system: 'ose' })])

    expect(result.current.characters[0].name).toBe('Local')
  })

  it('reads a stored document whose save is waiting when there is no local copy of it', () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a', { name: 'Stored' })])

    act(() => result.current.updateCharacter('a', { name: 'Local' }))
    emitCharacters([])
    emitCharacters([vtmDoc('a', { name: 'Stored again' })])

    expect(result.current.characters[0].name).toBe('Stored again')
  })

  it('drops a waiting save whose character is gone when it comes due', () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a')])

    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    act(() => result.current.deleteCharacter('a'))
    act(() => vi.advanceTimersByTime(500))

    expect(mocks.setDoc).not.toHaveBeenCalled()
    emitCharacters([vtmDoc('a', { name: 'Stored' })])
    expect(result.current.characters[0].name).toBe('Stored')
  })

  it('sends a waiting save at once when the sheet closes, and only once', () => {
    const { result, unmount } = renderCharacters()
    emitCharacters([vtmDoc('a')])

    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    unmount()

    expect(savedPaths()).toEqual([`${CHARACTERS_PATH}/a`])
    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({ name: 'Edited' })
    vi.advanceTimersByTime(500)
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
  })

  it('sends nothing when the sheet closes with no save waiting', () => {
    const { result, unmount } = renderCharacters()
    emitCharacters([vtmDoc('a')])

    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    act(() => vi.advanceTimersByTime(500))
    unmount()

    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
  })

  it('does not schedule a save once the campaign is gone', () => {
    const { result, rerender } = renderCharacters()
    emitCharacters([vtmDoc('a')])

    rerender({ ...baseProps, campaignId: null })
    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    act(() => vi.advanceTimersByTime(500))

    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it('sends a waiting save at once to the campaign the edit was made in when the campaign changes', () => {
    const { result, rerender } = renderCharacters()
    emitCharacters([vtmDoc('a')])

    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    rerender({ ...baseProps, campaignId: 'campaign-2' })

    expect(savedPaths()).toEqual([`${CHARACTERS_PATH}/a`])
    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({ name: 'Edited' })
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
  })

  it('shows the new campaign\'s own character when it has the same id as one still saving in the old campaign', () => {
    mocks.setDoc.mockImplementationOnce(() => new Promise<undefined>(() => undefined))
    const { result, rerender } = renderCharacters()
    emitCharacters([vtmDoc('a', { name: 'Campaign one' })])

    act(() => result.current.updateCharacter('a', { name: 'Edited in one' }))
    rerender({ ...baseProps, campaignId: 'campaign-2' })
    emitCharacters([vtmDoc('a', { name: 'Campaign two' })], 'groups/group-1/campaigns/campaign-2/characters')

    expect(result.current.characters[0].name).toBe('Campaign two')
  })

  it('sends a waiting save at once when the group changes', () => {
    const { result, rerender } = renderCharacters()
    emitCharacters([vtmDoc('a')])

    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    rerender({ ...baseProps, groupId: 'group-2' })

    expect(savedPaths()).toEqual([`${CHARACTERS_PATH}/a`])
  })
})

describe('useVtmCharacters addCharacter', () => {
  it('adds, selects and creates a new character owned by the user', async () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a')])

    await act(async () => { await result.current.addCharacter('established') })

    const added = result.current.characters[1]
    expect(ids(result.current.characters)).toEqual(['a', added.id])
    expect(result.current.selectedCharacterId).toBe(added.id)
    expect(added).toMatchObject({
      ownerUserId: 'user-1',
      ownerUsername: 'Player One',
      creationMode: 'established',
      creationStatus: 'established_draft',
    })
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    const [ref, data] = mocks.setDoc.mock.calls[0]
    expect(mocks.setDoc.mock.calls[0]).toHaveLength(2)
    expect(ref).toEqual({ path: `${CHARACTERS_PATH}/${added.id}` })
    expect(data).toEqual({
      system: 'vtm',
      name: 'New Vampire',
      ownerUserId: 'user-1',
      ownerUsername: 'Player One',
      creationMode: 'established',
      creationModeExplicit: true,
      creationStatus: 'established_draft',
      xp: 0,
      portraitPath: '',
      portraitFocusX: 50,
      portraitFocusY: 50,
      tokenIcon: defaultVtmTokenIcon,
      vtm: added.vtm,
      schemaVersion: 1,
      schemaWrittenAt: SERVER_TIMESTAMP,
      createdAt: SERVER_TIMESTAMP,
      updatedAt: SERVER_TIMESTAMP,
    })
  })

  it('passes a failed create back to the caller', async () => {
    mocks.setDoc.mockRejectedValueOnce(new Error('denied'))
    const { result } = renderCharacters()

    await expect(act(async () => { await result.current.addCharacter('new') })).rejects.toThrow('denied')
  })

  it.each([
    ['campaign', { campaignId: null }],
    ['group', { groupId: null }],
    ['role', { role: null }],
  ])('does nothing without a %s', async (_label, overrides) => {
    const { result } = renderCharacters(overrides)
    await flushMicrotasks()

    await act(async () => { await result.current.addCharacter('new') })

    expect(result.current.characters).toEqual([])
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})

describe('useVtmCharacters deleteCharacter', () => {
  it('removes the user\'s own character and deletes its document', () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a'), vtmDoc('b')])

    act(() => result.current.deleteCharacter('a'))

    expect(ids(result.current.characters)).toEqual(['b'])
    expect(mocks.deleteDoc).toHaveBeenCalledWith({ path: `${CHARACTERS_PATH}/a` })
  })

  it('lets the GM delete anyone\'s character', () => {
    const { result } = renderCharacters({ role: 'gm', userId: 'gm-1' })
    emitCharacters([vtmDoc('a', { ownerUserId: 'user-2' })])

    act(() => result.current.deleteCharacter('a'))

    expect(result.current.characters).toEqual([])
    expect(mocks.deleteDoc).toHaveBeenCalledTimes(1)
  })

  it('stops a player deleting someone else\'s character, or an unknown one', () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('theirs', { ownerUserId: 'user-2' })])

    act(() => {
      result.current.deleteCharacter('theirs')
      result.current.deleteCharacter('missing')
    })

    expect(ids(result.current.characters)).toEqual(['theirs'])
    expect(mocks.deleteDoc).not.toHaveBeenCalled()
  })

  it('does nothing once the campaign is gone', () => {
    const { result, rerender } = renderCharacters()
    emitCharacters([vtmDoc('a')])

    rerender({ ...baseProps, groupId: null })
    act(() => result.current.deleteCharacter('a'))

    expect(mocks.deleteDoc).not.toHaveBeenCalled()
  })
})

describe('useVtmCharacters setCurrentCharacter', () => {
  it('marks the user\'s own character as current and remembers it', async () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a')])

    await act(async () => { await result.current.setCurrentCharacter('a') })

    expect(result.current.currentCharacterId).toBe('a')
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { path: USER_STATE_PATH },
      { currentCharacterId: 'a', updatedAt: SERVER_TIMESTAMP },
      { merge: true },
    )
  })

  it('lets the GM make anyone\'s character current', async () => {
    const { result } = renderCharacters({ role: 'gm' })
    emitCharacters([vtmDoc('theirs', { ownerUserId: 'user-2' })])

    await act(async () => { await result.current.setCurrentCharacter('theirs') })

    expect(result.current.currentCharacterId).toBe('theirs')
  })

  it('stops a player choosing someone else\'s character, or an unknown one', async () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('theirs', { ownerUserId: 'user-2' })])

    await act(async () => {
      await result.current.setCurrentCharacter('theirs')
      await result.current.setCurrentCharacter('missing')
    })

    expect(result.current.currentCharacterId).toBeNull()
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

  it.each([
    ['group', { groupId: null }],
    ['role', { role: null }],
  ])('does nothing once the %s is gone', async (_label, overrides) => {
    const { result, rerender } = renderCharacters()
    emitCharacters([vtmDoc('a')])

    rerender({ ...baseProps, ...overrides })
    await act(async () => { await result.current.setCurrentCharacter('a') })

    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})

// Characterization of existing edge behavior, including limitations. These
// assertions describe today's implementation, not the shared store's design.
describe('VtM persistence edge behavior before extraction', () => {
  it('loses a waiting edit when disabled, because the roster clears before the save timer reads it', async () => {
    const { result, rerender } = renderCharacters()
    emitCharacters([vtmDoc('a', { name: 'Stored' })])
    act(() => result.current.updateCharacter('a', { name: 'Local edit' }))
    rerender({ ...baseProps, enabled: false })
    await flushMicrotasks()
    expect(result.current.characters).toEqual([])
    expect(mocks.setDoc).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(500))
    expect(mocks.setDoc).not.toHaveBeenCalled()
    rerender(baseProps)
    emitCharacters([vtmDoc('a', { name: 'Stored' })])
    expect(result.current.selectedCharacter?.name).toBe('Stored')
  })

  it('keeps current-character state optimistic after its write fails and does not select that character', async () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a'), vtmDoc('b')])
    mocks.setDoc.mockRejectedValueOnce(new Error('state denied'))
    let failure: unknown
    await act(async () => {
      try { await result.current.setCurrentCharacter('b') } catch (error) { failure = error }
    })
    expect(failure).toEqual(new Error('state denied'))
    expect(result.current.currentCharacterId).toBe('b')
    expect(result.current.selectedCharacterId).toBe('a')
    expect(savedPaths()).toEqual([USER_STATE_PATH])
    expect(setError).not.toHaveBeenCalled()
  })

  it('retains the optimistic character and selection after create fails, without marking it current', async () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a')])
    mocks.setDoc.mockRejectedValueOnce(new Error('create denied'))
    let failure: unknown
    await act(async () => {
      try { await result.current.addCharacter('new') } catch (error) { failure = error }
    })
    expect(failure).toEqual(new Error('create denied'))
    const added = result.current.characters[1]
    expect(added).toMatchObject({ name: 'New Vampire', creationStatus: 'draft' })
    expect(result.current.selectedCharacterId).toBe(added.id)
    expect(result.current.currentCharacterId).toBeNull()
    expect(savedPaths()).toEqual([`${CHARACTERS_PATH}/${added.id}`])
    expect(setError).not.toHaveBeenCalled()
  })

  it('keeps stale current and selected ids on delete and does not roll back a failed delete', async () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a')])
    emitUserState({ currentCharacterId: 'a' })
    const rejected = Promise.reject(new Error('delete denied'))
    // The action returns void and does not handle this rejection.
    const observed = rejected.catch((error: Error) => error.message)
    mocks.deleteDoc.mockReturnValueOnce(rejected)
    act(() => result.current.deleteCharacter('a'))
    expect(await observed).toBe('delete denied')
    expect(result.current.characters).toEqual([])
    expect(result.current.currentCharacterId).toBe('a')
    expect(result.current.selectedCharacterId).toBe('a')
    expect(mocks.deleteDoc).toHaveBeenCalledExactlyOnceWith({ path: `${CHARACTERS_PATH}/a` })
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(setError).not.toHaveBeenCalled()
  })

  it('does not flush when current-character changes restart the roster subscription; the timer still saves the edit', () => {
    const { result } = renderCharacters()
    emitCharacters([vtmDoc('a'), vtmDoc('b')])
    act(() => result.current.updateCharacter('a', { name: 'Edited' }))
    emitUserState({ currentCharacterId: 'b' })
    expect(mocks.subscribedTo.filter((path) => path === CHARACTERS_PATH)).toHaveLength(2)
    expect(mocks.setDoc).not.toHaveBeenCalled()
    emitCharacters([vtmDoc('a'), vtmDoc('b')])
    expect(result.current.characters[0].name).toBe('Edited')
    act(() => vi.advanceTimersByTime(500))
    expect(savedPaths()).toEqual([`${CHARACTERS_PATH}/a`])
    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({ name: 'Edited' })
  })
})
