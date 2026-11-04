// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { User } from 'firebase/auth'
import type { GroupRecord } from '../../types/app'
import { LubecCombatContext, type LubecCombatWatch } from '../lubec/combat/combatWatch'
import { CampaignSideNav } from './CampaignSideNav'

vi.mock('../auth/DiscordConnection', () => ({ DiscordConnection: () => null }))
vi.mock('../auth/DiscordReturnNotice', () => ({ DiscordReturnNotice: () => null }))
afterEach(cleanup)

const fight: LubecCombatWatch = { enabled: true, ready: true, live: { id: 'f', fight: { status: 'live', participantUserIds: ['p'], state: { round: 1, phase: 'attack', stageInstanceId: 'one', combatants: [{ key: 'wayne', kind: 'character', ownerUserId: 'p', sheetId: 'wayne', name: 'Wayne', speed: 50, outReason: null, armor: [], portraitPath: '', interactionSequence: 0 }], pendingActions: [{ combatantKey: 'wayne', action: 'attack' }], floor: [], attack: null, woundOutbox: [], woundAcknowledgements: [] } } } }
const setDrawerOpen = vi.fn(), setSettingsOpen = vi.fn(), navigate = vi.fn(), onSignOut = vi.fn()
function show(watch = fight, userId = 'p', role: 'player' | 'gm' = 'player', isDemoVisitor = false) {
  return render(<MemoryRouter><LubecCombatContext value={watch}><CampaignSideNav group={{ id: 'g', name: 'School' } as GroupRecord} campaign={{ id: 'c', groupId: 'g', name: 'Gym', status: 'active' }} user={{ uid: userId } as User} username="someone" role={role} isDemoVisitor={isDemoVisitor} visibleTabs={[{ id: 'combat', label: 'Combat' }, { id: 'notes', label: 'Notes' }, { id: 'rules', label: 'Rules' }]} drawerOpen={false} setDrawerOpen={setDrawerOpen} setSettingsOpen={setSettingsOpen} navigate={navigate} onSignOut={onSignOut} /></LubecCombatContext></MemoryRouter>)
}
describe('Combat attention in campaign navigation', () => {
  it('marks only the pending Combat link and preserves normal navigation', () => {
    show()
    expect(screen.getByRole('link', { name: /Combat.*Your turn/ }).getAttribute('href')).toBe('/groups/g/campaigns/c/combat')
    expect(screen.getByRole('link', { name: 'Notes' }).querySelector('i')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: /Combat.*Your turn/ }))
    expect(setDrawerOpen).toHaveBeenCalledWith(false)
    expect(screen.getByRole('link', { name: 'Rules' }).getAttribute('target')).toBe('_blank')
    fireEvent.click(screen.getByRole('button', { name: 'Back to School' }))
    expect(navigate).toHaveBeenCalledWith('/groups/g', { replace: true })
    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }))
    expect(onSignOut).toHaveBeenCalled()
  })
  it('gives a GM no mark for a player turn, and still opens campaign settings', () => {
    show(fight, 'gm', 'gm', true)
    expect(screen.queryByRole('img', { name: 'Your turn' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Campaign settings' }))
    expect(setSettingsOpen).toHaveBeenCalledWith(true)
  })
  it('gives spectators, Out viewers and idle workspaces no mark', () => {
    const view = show(fight, 'spectator')
    expect(screen.queryByRole('img', { name: 'Your turn' })).toBeNull()
    view.unmount()
    const out = structuredClone(fight)
    out.live!.fight.state.combatants[0].outReason = 'caught'
    const outView = show(out)
    expect(screen.queryByRole('img', { name: 'Your turn' })).toBeNull()
    outView.unmount()
    show({ enabled: true, ready: true, live: null })
    expect(screen.queryByRole('img', { name: 'Your turn' })).toBeNull()
  })
})
