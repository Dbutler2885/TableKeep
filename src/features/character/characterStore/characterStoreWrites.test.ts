import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterRecord } from '../../../types/app'
import { oseCharacterStore, readStoredCharacter } from '../lib/storedCharacterRecord'
import { vtmCharacterStore } from '../vtmCharacterRecord'
import { makeVtmCharacter } from '../vtmDefaults'

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  deleteDoc: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  deleteDoc: mocks.deleteDoc,
  serverTimestamp: () => 'now',
  setDoc: mocks.setDoc,
}))

const {
  cancelCharacterStoreSave,
  characterStoreSaveFields,
  deleteCharacterStoreDoc,
  saveCharacterStoreCurrentCharacter,
  emptyCharacterStoreSaves,
  isCharacterStoreSaveOutstanding,
  newCharacterStoreFields,
  scheduleCharacterStoreSave,
  sendCharacterStoreSavesNow,
  characterStoreCampaign,
} = await import('./characterStoreWrites')

const campaign = { campaignId: 'campaign-1', groupId: 'group-1' }
const stored = { ...makeVtmCharacter('user-1', 'player1'), id: 'a' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.setDoc.mockImplementation(async () => undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('characterStoreCampaign', () => {
  it('needs both a campaign and a group', () => {
    expect(characterStoreCampaign('campaign-1', 'group-1')).toEqual(campaign)
    expect(characterStoreCampaign(null, 'group-1')).toBeNull()
    expect(characterStoreCampaign('campaign-1', '')).toBeNull()
  })
})

describe('newCharacterStoreFields', () => {
  it('stores a missing owner username as null', () => {
    expect(newCharacterStoreFields(vtmCharacterStore, { ...stored, ownerUsername: undefined }).ownerUsername).toBeNull()
  })
})

describe('scheduleCharacterStoreSave', () => {
  it('is outstanding from scheduling until the save settles', async () => {
    let settle: () => void = () => undefined
    mocks.setDoc.mockImplementationOnce(() => new Promise<undefined>((resolve) => { settle = () => resolve(undefined) }))
    const saves = emptyCharacterStoreSaves()

    scheduleCharacterStoreSave(saves, campaign, vtmCharacterStore, 'a', () => stored)
    expect(isCharacterStoreSaveOutstanding(saves, 'a')).toBe(true)
    vi.advanceTimersByTime(500)
    expect(saves).toEqual({ pending: {}, inFlight: { a: true } })

    settle()
    await vi.waitFor(() => expect(isCharacterStoreSaveOutstanding(saves, 'a')).toBe(false))
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { path: 'groups/group-1/campaigns/campaign-1/characters/a' },
      expect.objectContaining({ system: 'vtm', updatedAt: 'now' }),
      { merge: true },
    )
  })

  it('restarts the delay on each edit and reads the character when the save comes due', () => {
    const saves = emptyCharacterStoreSaves()
    let latest = stored

    scheduleCharacterStoreSave(saves, campaign, vtmCharacterStore, 'a', () => latest)
    vi.advanceTimersByTime(300)
    scheduleCharacterStoreSave(saves, campaign, vtmCharacterStore, 'a', () => latest)
    latest = { ...stored, name: 'Latest' }
    vi.advanceTimersByTime(499)
    expect(mocks.setDoc).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({ name: 'Latest' })
  })

  it('sends nothing for a character that is gone when the save comes due', () => {
    const saves = emptyCharacterStoreSaves()

    scheduleCharacterStoreSave(saves, campaign, vtmCharacterStore, 'a', () => undefined)
    vi.advanceTimersByTime(500)

    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(saves).toEqual({ pending: {}, inFlight: {} })
  })
})

describe('sendCharacterStoreSavesNow', () => {
  it('sends every waiting save at once, to the campaign it was made in, and only once', () => {
    const saves = emptyCharacterStoreSaves()
    const otherCampaign = { campaignId: 'campaign-2', groupId: 'group-1' }
    scheduleCharacterStoreSave(saves, campaign, vtmCharacterStore, 'a', () => ({ ...stored, name: 'Edited A' }))
    scheduleCharacterStoreSave(saves, otherCampaign, vtmCharacterStore, 'b', () => ({ ...stored, id: 'b', name: 'Edited B' }))

    sendCharacterStoreSavesNow(saves)
    vi.advanceTimersByTime(500)

    expect(mocks.setDoc.mock.calls.map(([ref, fields]) => [(ref as { path: string }).path, (fields as { name: string }).name])).toEqual([
      ['groups/group-1/campaigns/campaign-1/characters/a', 'Edited A'],
      ['groups/group-1/campaigns/campaign-2/characters/b', 'Edited B'],
    ])
    expect(saves).toEqual({ pending: {}, inFlight: { a: true, b: true } })
  })

  it('sends nothing when no save is waiting, and leaves saves in flight alone', () => {
    const saves = emptyCharacterStoreSaves()
    saves.inFlight.a = true

    sendCharacterStoreSavesNow(saves)

    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(saves).toEqual({ pending: {}, inFlight: { a: true } })
  })
})

describe('VtM write fields', () => {
  it('creates the document under the record\'s own id without merging, from the serializer, stamped with the current version, omitting URLs and id', async () => {
    const { createCharacterStoreDoc } = await import('./characterStoreWrites')
    const character = { ...stored, portraitPath: 'portraits/old', portraitUrl: 'https://cdn.test/p', unknownFields: { future: true },
      tokenIcon: { ...stored.tokenIcon, customImagePath: 'tokens/t', customImageUrl: 'https://cdn.test/t' } }
    await createCharacterStoreDoc(campaign, vtmCharacterStore, character)
    expect(mocks.setDoc).toHaveBeenCalledExactlyOnceWith({ path: 'groups/group-1/campaigns/campaign-1/characters/a' }, {
      system: 'vtm', name: character.name, ownerUserId: character.ownerUserId, ownerUsername: character.ownerUsername,
      creationMode: character.creationMode, creationModeExplicit: character.creationModeExplicit, creationStatus: character.creationStatus,
      xp: character.xp, portraitPath: 'portraits/old', portraitFocusX: 50, portraitFocusY: 50, future: true,
      tokenIcon: { ...stored.tokenIcon, customImagePath: 'tokens/t' }, vtm: character.vtm, schemaVersion: 1, schemaWrittenAt: 'now',
      createdAt: 'now', updatedAt: 'now',
    })
  })

  it('propagates creation write failure to the caller', async () => {
    const { createCharacterStoreDoc } = await import('./characterStoreWrites')
    mocks.setDoc.mockRejectedValueOnce(new Error('permission denied'))
    await expect(createCharacterStoreDoc(campaign, vtmCharacterStore, stored)).rejects.toThrow('permission denied')
  })

  it('round-trips an edited sheet, unknown nested fields and media paths, replaces stored stamps with fresh ones and drops URLs', async () => {
    const { readCharacterStoreDoc } = await import('./characterStoreRecord')
    const { characterStoreSaveFields } = await import('./characterStoreWrites')
    const raw = { ...newCharacterStoreFields(vtmCharacterStore, stored), schemaVersion: 2, schemaWrittenAt: 'old-stamp',
      future: { nested: ['keep'] }, portraitPath: 'portraits/p', portraitUrl: 'https://cdn.test/p',
      tokenIcon: { ...stored.tokenIcon, customImagePath: 'tokens/t', customImageUrl: 'https://cdn.test/t' },
      vtm: { ...stored.vtm, futureSheet: { kept: true } } }
    const parsed = readCharacterStoreDoc(vtmCharacterStore, 'a', raw, undefined)
    if (!parsed) throw new Error('Expected the VtM reader to accept a VtM document')
    const fields: Record<string, unknown> = characterStoreSaveFields(vtmCharacterStore, { ...parsed, name: 'Edited' })
    expect(fields).toEqual({
      system: 'vtm', name: 'Edited', ownerUserId: stored.ownerUserId, ownerUsername: stored.ownerUsername,
      creationMode: stored.creationMode, creationModeExplicit: stored.creationModeExplicit, creationStatus: stored.creationStatus,
      xp: stored.xp, portraitPath: 'portraits/p', portraitFocusX: 50, portraitFocusY: 50,
      tokenIcon: { ...stored.tokenIcon, customImagePath: 'tokens/t' }, vtm: parsed.vtm, future: { nested: ['keep'] },
      schemaVersion: 1, schemaWrittenAt: 'now', updatedAt: 'now',
    })
    expect(fields.vtm).not.toBe(parsed.vtm)
    expect(fields.vtm).toHaveProperty('futureSheet', { kept: true })
  })
})

describe('VtM save failure', () => {
  it('clears the in-flight flag on rejection and never retries or reports the error', async () => {
    let fail: (error: Error) => void = () => undefined
    const write = new Promise<undefined>((_resolve, reject) => { fail = reject })
    const finalization = vi.spyOn(write, 'finally')
    mocks.setDoc.mockReturnValueOnce(write)
    const saves = emptyCharacterStoreSaves()
    scheduleCharacterStoreSave(saves, campaign, vtmCharacterStore, 'a', () => stored)
    sendCharacterStoreSavesNow(saves)
    expect(isCharacterStoreSaveOutstanding(saves, 'a')).toBe(true)
    // Observe the otherwise unhandled final promise without changing the writer.
    const observed = (finalization.mock.results[0].value as Promise<unknown>).catch((error: Error) => error)
    const failure = new Error('permission denied')
    fail(failure)
    expect(await observed).toBe(failure)
    expect(saves).toEqual({ pending: {}, inFlight: {} })
    vi.advanceTimersByTime(5000)
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
  })
})


describe('overlapping character saves', () => {
  it('sends a second edit while the first is in flight, and the first completion clears the shared flag early', async () => {
    const finishes: Array<() => void> = []
    mocks.setDoc.mockImplementation(() => new Promise<undefined>((resolve) => { finishes.push(() => resolve(undefined)) }))
    const saves = emptyCharacterStoreSaves()
    scheduleCharacterStoreSave(saves, campaign, vtmCharacterStore, 'a', () => ({ ...stored, name: 'First' }))
    sendCharacterStoreSavesNow(saves)
    scheduleCharacterStoreSave(saves, campaign, vtmCharacterStore, 'a', () => ({ ...stored, name: 'Second' }))
    sendCharacterStoreSavesNow(saves)
    expect(mocks.setDoc.mock.calls.map(([, fields]) => (fields as { name: string }).name)).toEqual(['First', 'Second'])
    expect(isCharacterStoreSaveOutstanding(saves, 'a')).toBe(true)
    finishes[0]()
    await Promise.resolve()
    // Characterization: inFlight is a boolean, so it forgets the second write.
    expect(isCharacterStoreSaveOutstanding(saves, 'a')).toBe(false)
    finishes[1]()
    await Promise.resolve()
    expect(saves).toEqual({ pending: {}, inFlight: {} })
  })
})

const viewer = { userId: 'user-1', currentUsername: 'Player One' }
const ose = oseCharacterStore(viewer)
const oseCharacter = (id: string, fields: Partial<CharacterRecord> = {}): CharacterRecord =>
  ({ ...readStoredCharacter(id, { ownerUserId: 'user-1' }, viewer), ...fields })
const CHARACTERS_PATH = 'groups/group-1/campaigns/campaign-1/characters'

describe('OSE write fields', () => {
  it('saves a deep copy of the details, no token image URL, and stamps the version', () => {
    const details = { notes: 'Brave' } as unknown as CharacterRecord['details']
    const fields = characterStoreSaveFields(ose, oseCharacter('a', {
      details,
      tokenIcon: { icon: 'pawn', color: '#000', size: 30, customImagePath: 't.png', customImageUrl: 'https://cdn.test/t.png' },
    }))

    expect(fields.details).toEqual(details)
    expect(fields.details).not.toBe(details)
    expect(details).toEqual({ notes: 'Brave' })
    expect(fields.tokenIcon).toEqual({ icon: 'pawn', color: '#000', size: 30, customImagePath: 't.png' })
    expect(Object.keys(fields).filter((key) => key.startsWith('details.'))).toEqual([])
    expect(fields).toMatchObject({ schemaVersion: 1, schemaWrittenAt: 'now', updatedAt: 'now' })
  })

  it('saves no details, no owner name and an empty portrait path when the character has none', () => {
    expect(characterStoreSaveFields(ose, oseCharacter('a', { details: undefined, ownerUsername: undefined, portraitPath: undefined })))
      .toMatchObject({ details: null, ownerUsername: null, portraitPath: '' })
  })

  it('round-trips unknown fields, replaces stored stamps with fresh ones and schedules an exact merged payload', () => {
    const record = readStoredCharacter('a', {
      name: 'Legacy', class: 'Fighter', ownerUserId: 'user-1', schemaVersion: 1, schemaWrittenAt: 'old-stamp',
      createdAt: 'creation-time', updatedAt: 'previous-save', future: { kept: true },
      portraitUrl: 'https://cdn.test/p', details: { inventory: [], notes: 'Keep', futureNested: [1] },
    }, viewer)
    const saves = emptyCharacterStoreSaves()
    scheduleCharacterStoreSave(saves, campaign, ose, 'a', () => ({ ...record, name: 'Edited' }))
    sendCharacterStoreSavesNow(saves)
    expect(mocks.setDoc).toHaveBeenCalledExactlyOnceWith({ path: `${CHARACTERS_PATH}/a` }, {
      name: 'Edited', ownerUserId: 'user-1', ownerUsername: 'Player One', creationMode: 'new', creationModeExplicit: false,
      creationStatus: 'active', class: 'Fighter', level: 1, hpCurrent: 0, hpMax: 0, ac: 10, xp: 0,
      portraitPath: '', portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn', color: '#bf2f2a', size: 34 },
      details: { inventory: [], notes: 'Keep', futureNested: [1] }, future: { kept: true },
      schemaVersion: 1, schemaWrittenAt: 'now', updatedAt: 'now',
    }, { merge: true })
  })
})

describe('cancelCharacterStoreSave', () => {
  it('drops one character\'s waiting save and forgets its save in flight, leaving the others', () => {
    const saves = emptyCharacterStoreSaves()
    scheduleCharacterStoreSave(saves, campaign, ose, 'a', (id) => oseCharacter(id))
    scheduleCharacterStoreSave(saves, campaign, ose, 'b', (id) => oseCharacter(id))
    saves.inFlight.a = true

    cancelCharacterStoreSave(saves, 'a')
    cancelCharacterStoreSave(saves, 'missing')
    vi.advanceTimersByTime(500)

    expect(isCharacterStoreSaveOutstanding(saves, 'a')).toBe(false)
    expect(mocks.setDoc.mock.calls.map(([ref]) => ref)).toEqual([{ path: `${CHARACTERS_PATH}/b` }])
  })
})

describe('direct writes', () => {
  it('deletes a character document', async () => {
    await deleteCharacterStoreDoc(campaign, 'a')

    expect(mocks.deleteDoc).toHaveBeenCalledWith({ path: `${CHARACTERS_PATH}/a` })
  })

  it('remembers the user\'s current character', async () => {
    await saveCharacterStoreCurrentCharacter(campaign, 'user-1', 'a')

    expect(mocks.setDoc).toHaveBeenCalledWith(
      { path: 'groups/group-1/campaigns/campaign-1/userState/user-1' },
      { currentCharacterId: 'a', updatedAt: 'now' },
      { merge: true },
    )
  })
})
