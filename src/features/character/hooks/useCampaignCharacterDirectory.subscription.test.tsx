// @vitest-environment jsdom
/**
 * When the campaign's character directory subscribes, and what it holds
 * when the subscription fails or moves to another campaign.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { Role } from '../../../types/app'

type Listener = { next: (snap: unknown) => void; fail: (error: unknown) => void }

const mocks = vi.hoisted(() => ({ listeners: {} as Record<string, Listener>, subscribedTo: [] as string[] }))

vi.mock('../../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: (_db: unknown, path: string) => ({ path }),
  onSnapshot: (ref: { path: string }, next: Listener['next'], fail: Listener['fail']) => {
    mocks.subscribedTo.push(ref.path)
    mocks.listeners[ref.path] = { next, fail }
    return () => delete mocks.listeners[ref.path]
  },
}))

const { useCampaignCharacterDirectory } = await import('./useCampaignCharacterDirectory')

type Props = { campaignId: string; groupId: string; gmUserId: string | null; role: Role | null }

const CAMPAIGN_1 = 'groups/group-1/campaigns/campaign-1/characters'
const CAMPAIGN_2 = 'groups/group-1/campaigns/campaign-2/characters'

const playerDoc = { id: 'a', data: () => ({ name: 'A', ownerUserId: 'player-a', ownerUsername: 'alpha' }) }

function renderDirectory(props: Props) {
  return renderHook(
    (current: Props) => useCampaignCharacterDirectory(current.campaignId, current.groupId, current.gmUserId, current.role),
    { initialProps: props },
  )
}

function emit(path: string, docs: unknown[]) {
  act(() => mocks.listeners[path].next({ docs }))
}

afterEach(() => {
  cleanup()
  mocks.subscribedTo.length = 0
})

describe('the campaign character subscription', () => {
  it('does not subscribe without a campaign', () => {
    const { result } = renderDirectory({ campaignId: '', groupId: 'group-1', gmUserId: 'gm-uid', role: 'gm' })
    expect(mocks.subscribedTo).toEqual([])
    expect(result.current).toEqual({ allCampaignCharacters: [], campaignPlayers: [] })
  })

  it('empties the list when the subscription fails', () => {
    const { result } = renderDirectory({ campaignId: 'campaign-1', groupId: 'group-1', gmUserId: 'gm-uid', role: 'gm' })
    emit(CAMPAIGN_1, [playerDoc])
    expect(result.current.allCampaignCharacters).toHaveLength(1)
    act(() => mocks.listeners[CAMPAIGN_1].fail(new Error('denied')))
    expect(result.current).toEqual({ allCampaignCharacters: [], campaignPlayers: [] })
  })

  it('empties the list and subscribes again when the campaign changes', () => {
    const { result, rerender } = renderDirectory({ campaignId: 'campaign-1', groupId: 'group-1', gmUserId: 'gm-uid', role: 'gm' })
    emit(CAMPAIGN_1, [playerDoc])
    rerender({ campaignId: 'campaign-2', groupId: 'group-1', gmUserId: 'gm-uid', role: 'gm' })
    expect(result.current.allCampaignCharacters).toEqual([])
    expect(mocks.listeners).not.toHaveProperty(CAMPAIGN_1)
    expect(mocks.subscribedTo).toEqual([CAMPAIGN_1, CAMPAIGN_2])
  })

  it('subscribes again when the viewer\'s role changes, and filters by the new one', () => {
    const gmCharacter = { id: 'npc', data: () => ({ name: 'Npc', ownerUserId: 'gm-uid' }) }
    const { result, rerender } = renderDirectory({ campaignId: 'campaign-1', groupId: 'group-1', gmUserId: 'gm-uid', role: 'gm' })
    emit(CAMPAIGN_1, [gmCharacter, playerDoc])
    expect(result.current.allCampaignCharacters.map(({ id }) => id)).toEqual(['npc', 'a'])
    rerender({ campaignId: 'campaign-1', groupId: 'group-1', gmUserId: 'gm-uid', role: 'player' })
    expect(result.current.allCampaignCharacters).toEqual([])
    emit(CAMPAIGN_1, [gmCharacter, playerDoc])
    expect(result.current.allCampaignCharacters.map(({ id }) => id)).toEqual(['a'])
    expect(mocks.subscribedTo).toEqual([CAMPAIGN_1, CAMPAIGN_1])
  })

  it('lists every character when there is no GM, and sorts players by name, then id', () => {
    const { result } = renderDirectory({ campaignId: 'campaign-1', groupId: 'group-1', gmUserId: null, role: 'player' })
    emit(CAMPAIGN_1, [
      { id: 'c', data: () => ({ name: 'C', ownerUserId: 'zed' }) },
      { id: 'b', data: () => ({ name: 'B', ownerUserId: 'player-b', ownerUsername: 'bravo' }) },
      playerDoc,
    ])
    expect(result.current.allCampaignCharacters.map(({ id }) => id)).toEqual(['c', 'b', 'a'])
    expect(result.current.campaignPlayers).toEqual([
      { userId: 'player-a', username: 'alpha' },
      { userId: 'player-b', username: 'bravo' },
      { userId: 'zed', username: null },
    ])
  })
})
