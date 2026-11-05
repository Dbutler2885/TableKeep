// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import type { AppTab, Campaign, Role } from '../../../types/app'
import { tabFromPathname, type GameSystem } from '../../navigation/tabs'
import { useCampaignNav } from '../../shell/useCampaignNav'
import type { Combatant, CombatFight } from './engine/types'

const mocks = vi.hoisted(() => ({
  enabled: true,
  receive: null as null | ((fight: { id: string; fight: CombatFight } | null) => void),
  subscriptions: 0,
}))

vi.mock('../../../firebase', () => ({ db: {} }))
vi.mock('./combatGate', () => ({ get lubecCombatEnabled() { return mocks.enabled } }))
vi.mock('./combatSubscription', () => ({
  subscribeCombat: (_db: unknown, _scope: unknown, receive: typeof mocks.receive) => {
    mocks.subscriptions += 1
    mocks.receive = receive
    return () => { mocks.receive = null }
  },
}))

const { combatPath, useLubecCombatShell } = await import('./useLubecCombatShell')

const root = '/groups/school/campaigns/gym'
const campaign = (enabledTabs?: AppTab[]): Campaign => ({ id: 'gym', name: 'Gym', status: 'active', groupId: 'school', gmUserId: 'gm', enabledTabs })
const combatant = (key: string, ownerUserId: string) => ({ key, ownerUserId }) as Combatant
const fight = (id: string, status: 'live' | 'ended' = 'live') => ({
  id, fight: { status, participantUserIds: ['wayne'], state: { combatants: [combatant('character:wayne', 'wayne'), combatant('npc:roy', 'gm')] } } as unknown as CombatFight,
})

type Props = { role: Role; userId: string; gameSystem?: GameSystem; enabledTabs?: AppTab[] }

function renderShell(path: string, initialProps: Props) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  return renderHook(({ role, userId, gameSystem = 'lubec', enabledTabs }: Props) => {
    const location = useLocation()
    const navigate = useNavigate()
    const open = campaign(enabledTabs)
    const combat = useLubecCombatShell({ campaign: open, gameSystem, role, userId, navigate, setError: () => undefined })
    const tabs = useCampaignNav(open, gameSystem, role, tabFromPathname(location.pathname), navigate, combat.access)
    return { path: location.pathname, tabs: tabs.map((tab) => tab.id), navigate, openCombat: combat.watch.openCombat }
  }, { wrapper, initialProps })
}

const send = (value: ReturnType<typeof fight> | null) => act(() => { mocks.receive?.(value) })

beforeEach(() => {
  mocks.enabled = true
  mocks.receive = null
  mocks.subscriptions = 0
})
afterEach(cleanup)

describe('the Combat tab in the workspace', () => {
  it('waits on a player deep link until the fight is read, then sends them to Character with no fight', () => {
    const { result } = renderShell(`${root}/combat`, { role: 'player', userId: 'wayne' })
    expect(result.current.path).toBe(`${root}/combat`)
    expect(result.current.tabs).not.toContain('combat')
    send(null)
    expect(result.current.path).toBe(`${root}/character`)
  })

  it('takes a participant to the tab once per fight, then lets them leave', () => {
    const { result } = renderShell(`${root}/notes`, { role: 'player', userId: 'wayne' })
    send(fight('one'))
    expect(result.current.path).toBe(`${root}/combat`)
    expect(result.current.tabs.slice(0, 2)).toEqual(['character', 'combat'])
    act(() => { void result.current.navigate(`${root}/notes`) })
    send(fight('one'))
    expect(result.current.path).toBe(`${root}/notes`)
    send(fight('two'))
    expect(result.current.path).toBe(`${root}/combat`)
  })

  it('has no Combat tab outside a campaign', () => {
    expect(combatPath(null)).toBe('')
  })

  it('gives sheets the way to the Combat tab', () => {
    const { result } = renderShell(`${root}/notes`, { role: 'player', userId: 'marcy' })
    act(() => result.current.openCombat!())
    expect(result.current.path).toBe(`${root}/combat`)
  })

  it('shows a spectator the tab without moving them', () => {
    const { result } = renderShell(`${root}/notes`, { role: 'player', userId: 'marcy' })
    send(fight('one'))
    expect(result.current.path).toBe(`${root}/notes`)
    expect(result.current.tabs).toContain('combat')
  })

  it('returns a player on the tab to Character when the fight ends', () => {
    const { result } = renderShell(`${root}/combat`, { role: 'player', userId: 'marcy' })
    send(fight('one'))
    expect(result.current.path).toBe(`${root}/combat`)
    send(fight('one', 'ended'))
    expect(result.current.path).toBe(`${root}/character`)
    expect(result.current.tabs).not.toContain('combat')
  })

  it('always gives the GM the tab, even under a saved enabledTabs list that predates it', () => {
    const { result } = renderShell(`${root}/combat`, { role: 'gm', userId: 'gm', enabledTabs: ['character', 'notes'] })
    expect(result.current.tabs).toEqual(['character', 'combat', 'notes'])
    send(null)
    expect(result.current.path).toBe(`${root}/combat`)
  })

  it('keeps a saved enabledTabs list from hiding a live fight from players', () => {
    const { result } = renderShell(`${root}/notes`, { role: 'player', userId: 'marcy', enabledTabs: ['character', 'notes'] })
    send(fight('one'))
    expect(result.current.tabs).toEqual(['character', 'combat', 'notes'])
  })

  it('follows no fight when the gate is off or the campaign is not Lubec', () => {
    mocks.enabled = false
    const off = renderShell(`${root}/combat`, { role: 'gm', userId: 'gm' })
    expect(off.result.current.tabs).not.toContain('combat')
    expect(off.result.current.path).toBe(`${root}/character`)
    mocks.enabled = true
    const ose = renderShell(`${root}/notes`, { role: 'gm', userId: 'gm', gameSystem: 'ose' })
    expect(ose.result.current.tabs).not.toContain('combat')
    expect(mocks.subscriptions).toBe(0)
  })
})
