import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterRecord } from '../../../types/app'
import { readStoredCharacter } from './storedCharacterRecord'

const SERVER_TIMESTAMP = { sentinel: 'serverTimestamp' }
const DELETE_FIELD = { sentinel: 'deleteField' }

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
  cancelCharacterSaves,
  characterSaveFields,
  deleteCharacterDoc,
  emptyCharacterSaves,
  isCharacterSaveOutstanding,
  saveCurrentCharacter,
  scheduleCharacterSave,
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
  it('saves a deep copy of the details, no token image URL, and removes the retired AC override', () => {
    const details = { notes: 'Brave' } as unknown as CharacterRecord['details']
    const fields = characterSaveFields(character('a', {
      details,
      tokenIcon: { icon: 'pawn', color: '#000', size: 30, customImagePath: 't.png', customImageUrl: 'https://cdn.test/t.png' },
    }))

    expect(fields.details).toEqual(details)
    expect(fields.details).not.toBe(details)
    expect(fields.tokenIcon).toEqual({ icon: 'pawn', color: '#000', size: 30, customImagePath: 't.png' })
    expect(fields['details.acManualOverride']).toBe(DELETE_FIELD)
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

describe('cancelling saves', () => {
  it('drops every waiting save and forgets every save in flight', () => {
    const saves = emptyCharacterSaves()
    scheduleCharacterSave(saves, campaign, 'a', () => character('a'))
    saves.inFlight.b = true

    cancelCharacterSaves(saves)
    vi.advanceTimersByTime(500)

    expect(saves).toEqual({ pending: {}, inFlight: {} })
    expect(mocks.setDoc).not.toHaveBeenCalled()
  })

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
