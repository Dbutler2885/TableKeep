import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterRecord } from '../../../types/app'
import { readStoredCharacter } from './storedCharacterRecord'

const SERVER_TIMESTAMP = { sentinel: 'serverTimestamp' }
const DELETE_FIELD = { sentinel: 'deleteField' }
// The detail fields OSE's step removes, which a merge save deletes.
const RETIRED_DETAIL_DELETES = Object.fromEntries(
  ['weapons', 'armour', 'packedItems', 'equippedItems', 'storeGoldSlotIndices', 'acManualOverride'].map((name) => [name, DELETE_FIELD]),
)

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
  deleteDoc: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  deleteDoc: mocks.deleteDoc,
  deleteField: () => DELETE_FIELD,
  serverTimestamp: () => SERVER_TIMESTAMP,
  setDoc: mocks.setDoc,
}))

const {
  campaignScope,
  cancelCharacterSave,
  characterSaveFields,
  deleteCharacterDoc,
  emptyCharacterSaves,
  isCharacterSaveOutstanding,
  saveCurrentCharacter,
  scheduleCharacterSave,
  sendCharacterSavesNow,
} = await import('./characterWrites')

const campaign = { campaignId: 'campaign-1', groupId: 'group-1' }
const CHARACTERS_PATH = 'groups/group-1/campaigns/campaign-1/characters'
const viewer = { userId: 'user-1', currentUsername: 'Player One' }
const character = (id: string, fields: Partial<CharacterRecord> = {}): CharacterRecord =>
  ({ ...readStoredCharacter(id, { ownerUserId: 'user-1' }, undefined, viewer), ...fields })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.setDoc.mockImplementation(async () => undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('campaignScope', () => {
  it('needs both the campaign and the group', () => {
    expect(campaignScope('campaign-1', 'group-1')).toEqual(campaign)
    expect(campaignScope(null, 'group-1')).toBeNull()
    expect(campaignScope('campaign-1', null)).toBeNull()
  })
})

describe('characterSaveFields', () => {
  it('saves a deep copy of the details, no token image URL, removes the fields OSE\'s step removes, and stamps the version', () => {
    const details = { notes: 'Brave' } as unknown as CharacterRecord['details']
    const fields = characterSaveFields(character('a', {
      details,
      tokenIcon: { icon: 'pawn', color: '#000', size: 30, customImagePath: 't.png', customImageUrl: 'https://cdn.test/t.png' },
    }))

    expect(fields.details).toEqual({ ...details, ...RETIRED_DETAIL_DELETES })
    expect(fields.details).not.toBe(details)
    expect(details).toEqual({ notes: 'Brave' })
    expect(fields.tokenIcon).toEqual({ icon: 'pawn', color: '#000', size: 30, customImagePath: 't.png' })
    expect(Object.keys(fields).filter((key) => key.startsWith('details.'))).toEqual([])
    expect(fields.schemaVersion).toBe(1)
    expect(fields.schemaWrittenAt).toBe(SERVER_TIMESTAMP)
    expect(fields.updatedAt).toBe(SERVER_TIMESTAMP)
  })

  it('saves no details, no owner name and an empty portrait path when the character has none', () => {
    expect(characterSaveFields(character('a', { details: undefined, ownerUsername: undefined, portraitPath: undefined })))
      .toMatchObject({ details: null, ownerUsername: null, portraitPath: '' })
  })
})

describe('scheduleCharacterSave', () => {
  it('sends the latest copy half a second after the last edit, and tracks it until it settles', async () => {
    let finishSave: () => void = () => undefined
    mocks.setDoc.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      finishSave = () => resolve(undefined)
    }))
    const saves = emptyCharacterSaves()
    let latest = character('a', { name: 'First' })
    const readCharacter = vi.fn(() => latest)

    scheduleCharacterSave(saves, campaign, 'a', readCharacter)
    vi.advanceTimersByTime(400)
    latest = character('a', { name: 'Second' })
    scheduleCharacterSave(saves, campaign, 'a', readCharacter)
    vi.advanceTimersByTime(499)
    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(isCharacterSaveOutstanding(saves, 'a')).toBe(true)

    vi.advanceTimersByTime(1)

    expect(readCharacter).toHaveBeenCalledTimes(1)
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { path: `${CHARACTERS_PATH}/a` },
      expect.objectContaining({ name: 'Second' }),
      { merge: true },
    )
    expect(saves).toEqual({ pending: {}, inFlight: { a: true } })

    finishSave()
    await vi.runAllTimersAsync()
    expect(isCharacterSaveOutstanding(saves, 'a')).toBe(false)
  })

  it('drops a save whose character is gone when it comes due', () => {
    const saves = emptyCharacterSaves()

    scheduleCharacterSave(saves, campaign, 'a', () => undefined)
    vi.advanceTimersByTime(500)

    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(saves).toEqual({ pending: {}, inFlight: {} })
  })
})

describe('sendCharacterSavesNow', () => {
  it('sends every waiting save at once, each to its own campaign, and not again when its delay runs out', () => {
    const otherCampaign = { campaignId: 'campaign-2', groupId: 'group-1' }
    const saves = emptyCharacterSaves()
    scheduleCharacterSave(saves, campaign, 'a', (id) => character(id, { name: 'Edited a' }))
    scheduleCharacterSave(saves, otherCampaign, 'b', (id) => character(id, { name: 'Edited b' }))

    sendCharacterSavesNow(saves)
    vi.advanceTimersByTime(500)

    expect(mocks.setDoc.mock.calls.map(([ref, data]) => [ref, (data as { name: string }).name])).toEqual([
      [{ path: `${CHARACTERS_PATH}/a` }, 'Edited a'],
      [{ path: 'groups/group-1/campaigns/campaign-2/characters/b' }, 'Edited b'],
    ])
    expect(saves).toEqual({ pending: {}, inFlight: { a: true, b: true } })
  })

  it('sends nothing when no save is waiting', () => {
    sendCharacterSavesNow(emptyCharacterSaves())

    expect(mocks.setDoc).not.toHaveBeenCalled()
  })
})

describe('cancelling saves', () => {
  it('drops one character\'s waiting save and forgets its save in flight, leaving the others', () => {
    const saves = emptyCharacterSaves()
    scheduleCharacterSave(saves, campaign, 'a', (id) => character(id))
    scheduleCharacterSave(saves, campaign, 'b', (id) => character(id))
    saves.inFlight.a = true

    cancelCharacterSave(saves, 'a')
    cancelCharacterSave(saves, 'missing')
    vi.advanceTimersByTime(500)

    expect(isCharacterSaveOutstanding(saves, 'a')).toBe(false)
    expect(mocks.setDoc.mock.calls.map(([ref]) => ref)).toEqual([{ path: `${CHARACTERS_PATH}/b` }])
  })
})

describe('direct writes', () => {
  it('deletes a character document', async () => {
    await deleteCharacterDoc(campaign, 'a')

    expect(mocks.deleteDoc).toHaveBeenCalledWith({ path: `${CHARACTERS_PATH}/a` })
  })

  it('remembers the user\'s current character', async () => {
    await saveCurrentCharacter(campaign, 'user-1', 'a')

    expect(mocks.setDoc).toHaveBeenCalledWith(
      { path: 'groups/group-1/campaigns/campaign-1/userState/user-1' },
      { currentCharacterId: 'a', updatedAt: SERVER_TIMESTAMP },
      { merge: true },
    )
  })
})

describe('OSE write fields', () => {
  it('round-trips unknown fields, replaces stored stamps with fresh ones and schedules an exact merged payload', () => {
    const record = readStoredCharacter('a', {
      name: 'Legacy', class: 'Fighter', ownerUserId: 'user-1', schemaVersion: 1, schemaWrittenAt: 'old-stamp',
      createdAt: 'creation-time', updatedAt: 'previous-save', future: { kept: true },
      portraitUrl: 'https://cdn.test/p', details: { inventory: [], notes: 'Keep', futureNested: [1], acManualOverride: true },
    }, undefined, viewer)
    const saves = emptyCharacterSaves()
    scheduleCharacterSave(saves, campaign, 'a', () => ({ ...record, name: 'Edited' }))
    sendCharacterSavesNow(saves)
    expect(mocks.setDoc).toHaveBeenCalledExactlyOnceWith({ path: `${CHARACTERS_PATH}/a` }, {
      name: 'Edited', ownerUserId: 'user-1', ownerUsername: 'Player One', creationMode: 'new', creationModeExplicit: false,
      creationStatus: 'active', class: 'Fighter', level: 1, hpCurrent: 0, hpMax: 0, ac: 10, xp: 0,
      portraitPath: '', portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn', color: '#bf2f2a', size: 34 },
      details: { inventory: [], notes: 'Keep', futureNested: [1], ...RETIRED_DETAIL_DELETES }, future: { kept: true },
      schemaVersion: 1, schemaWrittenAt: SERVER_TIMESTAMP, updatedAt: SERVER_TIMESTAMP,
    }, { merge: true })
  })

  it('saves the migrated inventory at version 1, deleting the legacy lists a Firestore merge would otherwise keep', () => {
    const raw = { class: 'Fighter', details: { weapons: [{ id: 'sword', name: 'Sword' }], armour: [], packedItems: ['Rope'], equippedItems: [], storeGoldSlotIndices: [] } }
    const fields = characterSaveFields(readStoredCharacter('a', raw, undefined, viewer))
    expect(fields.details).toMatchObject({ inventory: expect.any(Array), ...RETIRED_DETAIL_DELETES })
    expect((fields.details as { inventory: unknown[] }).inventory).toHaveLength(2)
    expect(fields).toMatchObject({ schemaVersion: 1, schemaWrittenAt: SERVER_TIMESTAMP })
  })
})

describe('OSE save failure', () => {
  it('clears the in-flight flag on rejection and never retries or reports the error', async () => {
    let fail: (error: Error) => void = () => undefined
    const write = new Promise<undefined>((_resolve, reject) => { fail = reject })
    const finalization = vi.spyOn(write, 'finally')
    mocks.setDoc.mockReturnValueOnce(write)
    const saves = emptyCharacterSaves()
    scheduleCharacterSave(saves, campaign, 'a', () => character('a'))
    sendCharacterSavesNow(saves)
    expect(isCharacterSaveOutstanding(saves, 'a')).toBe(true)
    // The writer returns void and does not catch its final promise. Observe it
    // in the test so its current unhandled-rejection behavior does not leak.
    const observed = (finalization.mock.results[0].value as Promise<unknown>).catch((error: Error) => error)
    const failure = new Error('permission denied')
    fail(failure)
    expect(await observed).toBe(failure)
    expect(saves).toEqual({ pending: {}, inFlight: {} })
    vi.advanceTimersByTime(5000)
    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
  })
})
