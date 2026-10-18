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
