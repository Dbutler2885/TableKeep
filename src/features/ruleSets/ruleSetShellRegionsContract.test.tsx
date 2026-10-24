// @vitest-environment jsdom
/**
 * The rule-set contract, campaign-wide half: which campaign dialogs each rule
 * set's shell subscribes to and shows, and whether it shows the campaign strip.
 * The rows for OSE and VtM were recorded from the shell as it stood before the
 * registry declared any of them, so any change to them is a visible change for
 * a player or GM, not a refactor. VtM's approval and transfer rows changed on
 * purpose when the registry began declaring them: VtM has neither, so its
 * campaigns stopped subscribing to approvals and showing the transfer notice.
 */
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { User } from 'firebase/auth'
import type { Campaign, GroupRecord, ItemApprovalRequest } from '../../types/app'

const mocks = vi.hoisted(() => ({
  props: {} as Record<string, Record<string, unknown>>,
  groups: [] as unknown[],
  pendingRequests: [] as unknown[],
  approvalsCalls: [] as unknown[][],
}))

function stub(name: string) {
  return function Stub(props: Record<string, unknown>) {
    mocks.props[name] = props
    return createElement('div', { 'data-testid': name })
  }
}

vi.mock('../../firebase', () => ({ auth: {}, db: {} }))
vi.mock('../common/useDocumentVisibility', () => ({ useDocumentVisibility: () => true }))
vi.mock('../groups/useGroupAccess', () => ({
  useGroupAccess: () => ({ groups: mocks.groups, loading: false, error: null, setError: () => undefined }),
}))
vi.mock('../character/hooks/useCharacters', () => ({ useCharacters: () => ({ characters: [] }) }))
vi.mock('../character/hooks/useItemApprovals', () => ({
  useItemApprovals: (...args: unknown[]) => {
    mocks.approvalsCalls.push(args)
    return { pendingRequests: mocks.pendingRequests, approveRequest: async () => undefined, rejectRequest: async () => undefined }
  },
}))
vi.mock('../auth/DiscordConnection', () => ({ DiscordConnection: stub('DiscordConnection') }))
vi.mock('../auth/DiscordReturnNotice', () => ({ DiscordReturnNotice: stub('DiscordReturnNotice') }))
vi.mock('../character/CharacterTab', () => ({ CharacterTab: stub('CharacterTab') }))
vi.mock('../character/VtmCharacterTab', () => ({ VtmCharacterTab: stub('VtmCharacterTab') }))
vi.mock('../lubec/LubecCharacterTab', () => ({ LubecCharacterTab: stub('LubecCharacterTab') }))
vi.mock('../maps/MapsTab', () => ({ MapsTab: stub('MapsTab') }))
vi.mock('../notes/NotesTab', () => ({ NotesTab: stub('NotesTab') }))
vi.mock('../notes/CliffhangerModal', () => ({ CliffhangerModal: stub('CliffhangerModal') }))
vi.mock('../transfers/TransferNotification', () => ({ TransferNotification: stub('TransferNotification') }))
vi.mock('../campaign/CampaignSettingsModal', () => ({ CampaignSettingsModal: stub('CampaignSettingsModal') }))

const { GroupShell } = await import('../shell/GroupShell')
const { CampaignStrip } = await import('../shell/CampaignStrip')
const { ruleSets } = await import('./registry')

const GM = 'gm-1'

const groupWith = (system: string): GroupRecord => {
  const campaign: Campaign = { id: 'c1', name: 'Wyrm', status: 'active', groupId: 'g1', gmUserId: GM, system }
  return { id: 'g1', name: 'Home Boys', slug: 'home-boys', activeCampaignId: 'c1', activeCampaign: campaign, drafts: [], inactiveCampaigns: [], memberRole: 'admin' }
}

const pendingReroll = { id: 'r1', action: 'ability_reroll', campaignId: 'c1', characterId: 'ch1', characterName: 'Mirelda', requestedByUserId: 'player-1', requestedByUsername: 'playerone', status: 'pending', createdAt: null } as ItemApprovalRequest

// The GM opens a campaign of the rule set on one of its tabs.
async function openCampaign(system: string, tab: 'character' | 'maps' | 'notes') {
  mocks.groups = [groupWith(system)]
  render(
    <MemoryRouter initialEntries={[`/groups/g1/campaigns/c1/${tab}`]}>
      <Routes>
        <Route path="/groups/:groupId/campaigns/:campaignId/*" element={<GroupShell user={{ uid: GM } as User} username="gmhandl" isDemoVisitor={false} />} />
      </Routes>
    </MemoryRouter>,
  )
  await act(async () => { await Promise.resolve() })
}

const approvalsEnabled = () => mocks.approvalsCalls.at(-1)?.[4]

beforeEach(() => {
  mocks.props = {}
  mocks.pendingRequests = []
  mocks.approvalsCalls = []
})

afterEach(() => {
  cleanup()
})

describe('approvals', () => {
  it.each([
    ['ose', true],
    ['vtm', false],
    ['lubec', false],
  ] as const)('%s subscribes the GM to approval requests: %s', async (system, subscribed) => {
    await openCampaign(system, 'notes')

    expect(approvalsEnabled()).toBe(subscribed)
  })

  it.each([
    ['ose', true],
    ['vtm', false],
    ['lubec', false],
  ] as const)('%s shows the GM a pending approval request: %s', async (system, shown) => {
    mocks.pendingRequests = [pendingReroll]
    await openCampaign(system, 'notes')

    expect(screen.queryByRole('dialog') !== null).toBe(shown)
  })
})

describe('transfers', () => {
  it.each([
    ['ose', true],
    ['vtm', false],
    ['lubec', false],
  ] as const)('%s shows the transfer notice on the character and maps tabs: %s', async (system, shown) => {
    for (const tab of ['character', 'maps'] as const) {
      await openCampaign(system, tab)
      expect(screen.queryByTestId('TransferNotification') !== null).toBe(shown)
      cleanup()
    }
  })
})

describe('cliffhanger dialog', () => {
  it.each(['ose', 'vtm', 'lubec'] as const)('%s shows the cliffhanger dialog off the notes tab', async (system) => {
    await openCampaign(system, 'maps')

    expect(mocks.props.CliffhangerModal).toEqual({ campaignId: 'c1', groupId: 'g1', userId: GM, enabled: true })
  })
})

describe('campaign strip', () => {
  it.each(Object.keys(ruleSets))('%s shows no campaign strip', async (system) => {
    for (const tab of ['character', 'maps', 'notes'] as const) {
      await openCampaign(system, tab)
      expect(document.querySelector('.campaign-strip')).toBeNull()
      cleanup()
    }
  })

  it('is a status line when a rule set switches it on', () => {
    const { container } = render(<CampaignStrip />)

    expect(container.innerHTML).toBe('<div class="campaign-strip" role="status"></div>')
  })
})
