import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeVtmCharacter } from './vtmDefaults'

const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  deleteDoc: vi.fn(),
  serverTimestamp: () => 'now',
  setDoc: mocks.setDoc,
}))

const {
  emptyVtmCharacterSaves,
  isVtmCharacterSaveOutstanding,
  newVtmCharacterFields,
  scheduleVtmCharacterSave,
  sendVtmCharacterSavesNow,
  vtmCampaignScope,
} = await import('./vtmCharacterWrites')

const campaign = { campaignId: 'campaign-1', groupId: 'group-1' }
const stored = { ...makeVtmCharacter('user-1', 'player1'), id: 'a' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('vtmCampaignScope', () => {
  it('needs both a campaign and a group', () => {
    expect(vtmCampaignScope('campaign-1', 'group-1')).toEqual(campaign)
    expect(vtmCampaignScope(null, 'group-1')).toBeNull()
    expect(vtmCampaignScope('campaign-1', '')).toBeNull()
  })
})

describe('newVtmCharacterFields', () => {
  it('stores a missing owner username as null', () => {
    expect(newVtmCharacterFields({ ...stored, ownerUsername: undefined }).ownerUsername).toBeNull()
  })
})

describe('scheduleVtmCharacterSave', () => {
  it('is outstanding from scheduling until the save settles', async () => {
    let settle: () => void = () => undefined
    mocks.setDoc.mockImplementationOnce(() => new Promise<undefined>((resolve) => { settle = () => resolve(undefined) }))
    const saves = emptyVtmCharacterSaves()

    scheduleVtmCharacterSave(saves, campaign, 'a', () => stored)
    expect(isVtmCharacterSaveOutstanding(saves, 'a')).toBe(true)
    vi.advanceTimersByTime(500)
    expect(saves).toEqual({ pending: {}, inFlight: { a: true } })

    settle()
    await vi.waitFor(() => expect(isVtmCharacterSaveOutstanding(saves, 'a')).toBe(false))
    expect(mocks.setDoc).toHaveBeenCalledWith(
      { path: 'groups/group-1/campaigns/campaign-1/characters/a' },
      expect.objectContaining({ system: 'vtm', updatedAt: 'now' }),
      { merge: true },
    )
  })

  it('restarts the delay on each edit and reads the character when the save comes due', () => {
    const saves = emptyVtmCharacterSaves()
    let latest = stored

    scheduleVtmCharacterSave(saves, campaign, 'a', () => latest)
    vi.advanceTimersByTime(300)
    scheduleVtmCharacterSave(saves, campaign, 'a', () => latest)
    latest = { ...stored, name: 'Latest' }
    vi.advanceTimersByTime(499)
    expect(mocks.setDoc).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(mocks.setDoc).toHaveBeenCalledTimes(1)
    expect(mocks.setDoc.mock.calls[0][1]).toMatchObject({ name: 'Latest' })
  })

  it('sends nothing for a character that is gone when the save comes due', () => {
    const saves = emptyVtmCharacterSaves()

    scheduleVtmCharacterSave(saves, campaign, 'a', () => undefined)
    vi.advanceTimersByTime(500)

    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(saves).toEqual({ pending: {}, inFlight: {} })
  })
})

describe('sendVtmCharacterSavesNow', () => {
  it('sends every waiting save at once, to the campaign it was made in, and only once', () => {
    const saves = emptyVtmCharacterSaves()
    const otherCampaign = { campaignId: 'campaign-2', groupId: 'group-1' }
    scheduleVtmCharacterSave(saves, campaign, 'a', () => ({ ...stored, name: 'Edited A' }))
    scheduleVtmCharacterSave(saves, otherCampaign, 'b', () => ({ ...stored, id: 'b', name: 'Edited B' }))

    sendVtmCharacterSavesNow(saves)
    vi.advanceTimersByTime(500)

    expect(mocks.setDoc.mock.calls.map(([ref, fields]) => [(ref as { path: string }).path, (fields as { name: string }).name])).toEqual([
      ['groups/group-1/campaigns/campaign-1/characters/a', 'Edited A'],
      ['groups/group-1/campaigns/campaign-2/characters/b', 'Edited B'],
    ])
    expect(saves).toEqual({ pending: {}, inFlight: { a: true, b: true } })
  })

  it('sends nothing when no save is waiting, and leaves saves in flight alone', () => {
    const saves = emptyVtmCharacterSaves()
    saves.inFlight.a = true

    sendVtmCharacterSavesNow(saves)

    expect(mocks.setDoc).not.toHaveBeenCalled()
    expect(saves).toEqual({ pending: {}, inFlight: { a: true } })
  })
})

describe('VtM write fields before version stamping', () => {
  it('creates the document without merging, omitting URLs, unknown fields, id and version fields', async () => {
    const { createVtmCharacterDoc } = await import('./vtmCharacterWrites')
    const character = { ...stored, portraitPath: 'portraits/old', portraitUrl: 'https://cdn.test/p', unknownFields: { future: true },
      tokenIcon: { ...stored.tokenIcon, customImagePath: 'tokens/t', customImageUrl: 'https://cdn.test/t' } }
    await createVtmCharacterDoc(campaign, character)
    expect(mocks.setDoc).toHaveBeenCalledExactlyOnceWith({ path: 'groups/group-1/campaigns/campaign-1/characters/a' }, {
      system: 'vtm', name: character.name, ownerUserId: character.ownerUserId, ownerUsername: character.ownerUsername,
      creationMode: character.creationMode, creationModeExplicit: character.creationModeExplicit, creationStatus: character.creationStatus,
      xp: character.xp, portraitPath: '', portraitFocusX: 50, portraitFocusY: 50,
      tokenIcon: { ...stored.tokenIcon, customImagePath: 'tokens/t' }, vtm: character.vtm, createdAt: 'now', updatedAt: 'now',
    })
  })

  it('propagates creation write failure to the caller', async () => {
    const { createVtmCharacterDoc } = await import('./vtmCharacterWrites')
    mocks.setDoc.mockRejectedValueOnce(new Error('permission denied'))
    await expect(createVtmCharacterDoc(campaign, stored)).rejects.toThrow('permission denied')
  })

  it('round-trips an edited sheet, unknown nested fields and media paths but drops stored stamps and URLs', async () => {
    const { readVtmCharacterDoc } = await import('./vtmCharacterRecord')
    const { vtmCharacterSaveFields } = await import('./vtmCharacterWrites')
    const raw = { ...newVtmCharacterFields(stored), schemaVersion: 2, schemaWrittenAt: 'old-stamp',
      future: { nested: ['keep'] }, portraitPath: 'portraits/p', portraitUrl: 'https://cdn.test/p',
      tokenIcon: { ...stored.tokenIcon, customImagePath: 'tokens/t', customImageUrl: 'https://cdn.test/t' },
      vtm: { ...stored.vtm, futureSheet: { kept: true } } }
    const parsed = readVtmCharacterDoc('a', raw, undefined)
    if (!parsed) throw new Error('Expected the VtM reader to accept a VtM document')
    const fields: Record<string, unknown> = vtmCharacterSaveFields({ ...parsed, name: 'Edited' })
    expect(fields).toEqual({
      system: 'vtm', name: 'Edited', ownerUserId: stored.ownerUserId, ownerUsername: stored.ownerUsername,
      creationMode: stored.creationMode, creationModeExplicit: stored.creationModeExplicit, creationStatus: stored.creationStatus,
      xp: stored.xp, portraitPath: 'portraits/p', portraitFocusX: 50, portraitFocusY: 50,
      tokenIcon: { ...stored.tokenIcon, customImagePath: 'tokens/t' }, vtm: parsed.vtm, future: { nested: ['keep'] }, updatedAt: 'now',
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
    const saves = emptyVtmCharacterSaves()
    scheduleVtmCharacterSave(saves, campaign, 'a', () => stored)
    sendVtmCharacterSavesNow(saves)
    expect(isVtmCharacterSaveOutstanding(saves, 'a')).toBe(true)
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
