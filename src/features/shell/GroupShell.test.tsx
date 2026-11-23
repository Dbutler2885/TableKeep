// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useCombatErrors } from '../lubec/combat/combatErrors'
import type { User } from 'firebase/auth'

const mocks = vi.hoisted(() => ({ path: '/groups/g/campaigns/c/notes', selected: true, campaign: true, demo: false, enabled: false, workspace: vi.fn(), combatReport: null as null | ((message: string) => void), accessError: vi.fn() }))
vi.mock('../common/useDocumentVisibility', () => ({ useDocumentVisibility: () => true }))
vi.mock('../character/hooks/useCharacters', () => ({ useCharacters: () => ({ characters: [] }) }))
vi.mock('../groups/GroupPicker', () => ({ GroupPicker: () => <p>Choose a group</p> }))
vi.mock('../groups/GroupHome', () => ({ GroupHome: () => <p>Group home</p> }))
vi.mock('../groups/useGroupAccess', () => ({ useGroupAccess: () => ({ groups: [], loading: false, error: null, setError: mocks.accessError }) }))
vi.mock('../demo/DemoBanner', () => ({ DemoBanner: () => <p>Demo visitor</p> }))
vi.mock('../lubec/combat/useLubecCombatShell', () => ({ useLubecCombatShell: () => ({ watch: { enabled: mocks.enabled, ready: true, live: null }, access: false }) }))
vi.mock('../lubec/combat/LubecCombatServices', () => ({ LubecCombatServices: ({ setError }: { setError: (message: string) => void }) => { mocks.combatReport = setError; return null } }))
vi.mock('../../firebase', () => ({ db: {} }))
vi.mock('./CampaignWorkspace', () => ({ CampaignWorkspace: (props: unknown) => { mocks.workspace(props); const errors = useCombatErrors(); return <><p>Campaign tab content</p>{errors.message ? <p role="alert">{errors.message}</p> : null}</> } }))
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
afterEach(() => { cleanup(); mocks.path = '/groups/g/campaigns/c/notes'; mocks.selected = true; mocks.campaign = true; mocks.demo = false; mocks.enabled = false })
describe('the workspace feedback boundary', () => {
  it('preserves workspace content on another tab while combat is off', () => {
    show()
    expect(screen.getByText('Campaign tab content')).toBeTruthy()
    expect(document.querySelector('.combat-cards')).toBeNull()
    expect(screen.queryByRole('button', { name: /Your turn/ })).toBeNull()
    expect(mocks.workspace.mock.lastCall![0]).toMatchObject({ activeTab: 'notes', gameSystem: 'lubec', user: { uid: 'p' } })
  })
  it('mounts feedback around campaign content when combat is on', () => {
    mocks.enabled = true
    show()
    expect(screen.getByText('Campaign tab content')).toBeTruthy()
    expect(document.querySelector('.combat-cards')).toBeTruthy()
  })
  it('contains background fight failures without setting the campaign access error', () => {
    show()
    act(() => mocks.combatReport!('That fight stage is stale.'))
    expect(screen.getByText('Campaign tab content')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('That fight stage is stale.')
    expect(mocks.workspace.mock.lastCall![0]).toMatchObject({ error: null })
    expect(mocks.accessError).not.toHaveBeenCalled()
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
