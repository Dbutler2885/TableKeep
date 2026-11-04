// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { User } from 'firebase/auth'

const mocks = vi.hoisted(() => ({ path: '/groups/g/campaigns/c/notes', selected: true, campaign: true, demo: false, workspace: vi.fn() }))
vi.mock('../common/useDocumentVisibility', () => ({ useDocumentVisibility: () => true }))
vi.mock('../character/hooks/useCharacters', () => ({ useCharacters: () => ({ characters: [] }) }))
vi.mock('../groups/GroupPicker', () => ({ GroupPicker: () => <p>Choose a group</p> }))
vi.mock('../groups/GroupHome', () => ({ GroupHome: () => <p>Group home</p> }))
vi.mock('../groups/useGroupAccess', () => ({ useGroupAccess: () => ({ groups: [], loading: false, error: null, setError: () => undefined }) }))
vi.mock('../demo/DemoBanner', () => ({ DemoBanner: () => <p>Demo visitor</p> }))
vi.mock('../lubec/combat/useLubecCombatShell', () => ({ useLubecCombatShell: () => ({ watch: { enabled: false, ready: true, live: null }, access: false }) }))
vi.mock('../lubec/combat/LubecCombatServices', () => ({ LubecCombatServices: () => null }))
vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('./CampaignWorkspace', () => ({ CampaignWorkspace: (props: unknown) => { mocks.workspace(props); return <p>Campaign tab content</p> } }))
vi.mock('./characterTabProps', () => ({ characterTabPropsFor: () => null }))
vi.mock('./shellSelection', () => ({ campaignIds: () => ({}), campaignRole: () => 'player', campaignSystem: () => 'lubec', shellTheme: () => 'lubec' }))
vi.mock('./useApprovalQueue', () => ({ useApprovalQueue: () => ({ pendingRequests: [] }) }))
vi.mock('./useCampaignLifecycle', () => ({ useCampaignLifecycle: () => ({}) }))
vi.mock('./useCampaignNav', () => ({ useCampaignNav: () => [] }))
vi.mock('./useDemoSession', () => ({ useDemoSession: () => ({ handleSignOut: () => undefined, demoExpiresAt: 0 }) }))
vi.mock('./useGroupNavigation', () => ({ useGroupNavigation: () => ({}) }))
vi.mock('./useRootRedirect', () => ({ useRootRedirect: () => undefined }))
vi.mock('./useSelectedCampaign', () => ({ useSelectedCampaign: () => ({ selectedGroup: mocks.selected ? { id: 'g' } : null, campaign: mocks.campaign ? { groupId: 'g', id: 'c' } : null }) }))
vi.mock('./useShellRoute', () => ({ useShellRoute: () => ({ pathname: mocks.path, navigate: () => undefined, activeTab: 'notes', selectedGroupId: 'g', selectedCampaignId: mocks.campaign ? 'c' : null }) }))
const { GroupShell } = await import('./GroupShell')
const show = () => render(<GroupShell user={{ uid: 'p' } as User} username="someone" isDemoVisitor={mocks.demo} />)
afterEach(() => { cleanup(); mocks.path = '/groups/g/campaigns/c/notes'; mocks.selected = true; mocks.campaign = true; mocks.demo = false })
describe('the workspace feedback boundary', () => {
  it('mounts feedback around a campaign while another tab is active, with the gate disabled', () => {
    show()
    expect(screen.getByText('Campaign tab content')).toBeTruthy()
    expect(document.querySelector('.combat-cards')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Your turn/ })).toBeNull()
    expect(mocks.workspace.mock.lastCall![0]).toMatchObject({ activeTab: 'notes', gameSystem: 'lubec', user: { uid: 'p' } })
  })
  it('keeps campaign listeners and feedback out of the group picker and group home', () => {
    mocks.path = '/groups'
    const picker = show()
    expect(screen.getByText('Choose a group')).toBeTruthy()
    expect(document.querySelector('.combat-cards')).toBeNull()
    picker.unmount()
    mocks.path = '/groups/g'
    mocks.selected = false
    const missing = show()
    expect(screen.getByText('Choose a group')).toBeTruthy()
    missing.unmount()
    mocks.selected = true
    mocks.campaign = false
    mocks.demo = true
    show()
    expect(screen.getByText('Group home')).toBeTruthy()
    expect(screen.getByText('Demo visitor')).toBeTruthy()
    expect(document.querySelector('.combat-cards')).toBeNull()
  })
})
