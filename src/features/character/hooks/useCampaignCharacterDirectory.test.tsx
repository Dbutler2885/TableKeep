// @vitest-environment jsdom
/**
 * The OSE list of transfer targets, on the checked-in OSE fixtures as the
 * migration leaves them, which is the only shape the app reads. The demo
 * characters are listed as recorded; a fixture migrated from the old format
 * is listed with the sheet the sheet itself shows.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import type { Role } from '../../../types/app'
import { markTimestamps, migratedFixture, reviveTimestamps, type CharacterFixture } from '../../ruleSets/characterFixtures'
import { oseCharacterVersioning } from '../../ruleSets/characterMigrations'
import demoCleric from '../../ruleSets/ose/fixtures/demo-cleric.json'
import demoFighter from '../../ruleSets/ose/fixtures/demo-fighter.json'
import demoMagicUser from '../../ruleSets/ose/fixtures/demo-magic-user.json'
import demoThief from '../../ruleSets/ose/fixtures/demo-thief.json'
import legacy from '../../ruleSets/ose/fixtures/legacy.json'
import { readStoredCharacter } from '../lib/storedCharacterRecord'

type Listener = { next: (snap: unknown) => void; fail: (error: unknown) => void }

const mocks = vi.hoisted(() => ({ listeners: {} as Record<string, Listener> }))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: (_db: unknown, path: string) => ({ path }),
  onSnapshot: (ref: { path: string }, next: Listener['next'], fail: Listener['fail']) => {
    mocks.listeners[ref.path] = { next, fail }
    return () => delete mocks.listeners[ref.path]
  },
}))

const { useCampaignCharacterDirectory } = await import('./useCampaignCharacterDirectory')

const CHARACTERS_PATH = 'groups/group-1/campaigns/campaign-1/characters'

const revive = (fixture: unknown) =>
  migratedFixture(oseCharacterVersioning, reviveTimestamps(fixture, (iso) => Timestamp.fromDate(new Date(iso))) as CharacterFixture)

const asFixtureJson = (value: unknown) =>
  `${JSON.stringify(markTimestamps(value, (entry) => entry instanceof Timestamp ? entry.toDate().toISOString() : null), null, 2)}\n`

const asCases = (fixtures: Record<string, unknown>) =>
  Object.entries(fixtures).map(([name, fixture]) => [name, revive(fixture)] as const)

const demoCases = asCases({
  'demo-magic-user': demoMagicUser,
  'demo-fighter': demoFighter,
  'demo-thief': demoThief,
  'demo-cleric': demoCleric,
})
const legacyCases = asCases(legacy)

function renderDirectory(role: Role, gmUserId: string | null) {
  return renderHook(() => useCampaignCharacterDirectory('campaign-1', 'group-1', gmUserId, role))
}

function emit(fixtures: CharacterFixture[]) {
  act(() => {
    mocks.listeners[CHARACTERS_PATH].next({ docs: fixtures.map(({ id, data }) => ({ id, data: () => data })) })
  })
}

afterEach(() => cleanup())

describe('OSE transfer targets', () => {
  it.each(demoCases)('%s is listed as its recorded transfer target', async (name, fixture) => {
    const { result } = renderDirectory('gm', 'gm-uid')
    emit([fixture])
    await expect(asFixtureJson(result.current.allCampaignCharacters[0])).toMatchFileSnapshot(
      `../../ruleSets/ose/fixtures/recorded/transfer/${name}.target.json`,
    )
  })

  it.each(legacyCases)('%s is listed with the sheet and items the sheet shows', (_name, fixture) => {
    const { result } = renderDirectory('gm', 'gm-uid')
    emit([fixture])
    const sheet = readStoredCharacter(fixture.id, fixture.data, undefined, { userId: 'gm-uid', currentUsername: 'gm1' })
    expect(result.current.allCampaignCharacters[0].details).toEqual(sheet.details)
    expect(result.current.allCampaignCharacters[0].details?.inventory).toBeInstanceOf(Array)
  })

  it('lists a character without a name, owner or details by its id, with no owner', () => {
    const { result } = renderDirectory('gm', 'gm-uid')
    emit([{ id: 'bare', data: { ownerUsername: 7 } }])
    expect(result.current.allCampaignCharacters).toEqual([
      { id: 'bare', name: 'bare', ownerUserId: '', ownerUsername: null, details: null },
    ])
  })

  it('hides the GM\'s own characters from a player and names each player once', () => {
    const fixtures = [
      { id: 'gm-npc', data: { name: 'Npc', ownerUserId: 'gm-uid', ownerUsername: 'gm1' } },
      { id: 'b', data: { name: 'B', ownerUserId: 'player-b', ownerUsername: 'bravo' } },
      { id: 'a', data: { name: 'A', ownerUserId: 'player-a' } },
      { id: 'a2', data: { name: 'A2', ownerUserId: 'player-a', ownerUsername: 'alpha' } },
    ]
    const asPlayer = renderDirectory('player', 'gm-uid')
    emit(fixtures)
    expect(asPlayer.result.current.allCampaignCharacters.map(({ id }) => id)).toEqual(['b', 'a', 'a2'])
    expect(asPlayer.result.current.campaignPlayers).toEqual([
      { userId: 'player-b', username: 'bravo' },
      { userId: 'player-a', username: null },
    ])
  })

  it('lists the GM\'s own characters for the GM', () => {
    const { result } = renderDirectory('gm', 'gm-uid')
    emit([{ id: 'gm-npc', data: { name: 'Npc', ownerUserId: 'gm-uid' } }])
    expect(result.current.allCampaignCharacters.map(({ id }) => id)).toEqual(['gm-npc'])
    expect(result.current.campaignPlayers).toEqual([])
  })
})
