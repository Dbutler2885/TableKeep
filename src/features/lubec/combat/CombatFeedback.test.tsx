// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Timestamp } from 'firebase/firestore'
import type { Campaign } from '../../../types/app'
import type { CombatFight, CombatState } from './engine/types'
import type { CombatLogEntry, CombatLogUpdate } from './combatLog'
import { LubecCombatContext, type LubecCombatWatch } from './combatWatch'
import { CombatFeedback } from './CombatFeedback'
import { CombatTicker, CombatTurnNotice } from './CombatMessages'

const mocks = vi.hoisted(() => ({ subscriptions: [] as { scope: unknown; id: string; receive: (update: CombatLogUpdate) => void; error: () => void; stop: ReturnType<typeof vi.fn> }[] }))
vi.mock('../../../firebase', () => ({ db: {} }))
vi.mock('./combatLog', async (original) => ({
  ...await original<typeof import('./combatLog')>(),
  subscribeCombatLog: (_db: unknown, scope: unknown, id: string, receive: (update: CombatLogUpdate) => void, error: () => void) => {
    const subscription = { scope, id, receive, error, stop: vi.fn() }
    mocks.subscriptions.push(subscription)
    return subscription.stop
  },
}))
const campaign: Campaign = { groupId: 'g', id: 'c', gmUserId: 'gm', name: 'Gym', status: 'active' }
const state: CombatState = { round: 1, phase: 'attack', stageInstanceId: 's', combatants: [{ key: 'wayne', kind: 'character', ownerUserId: 'p', name: 'Wayne Gardner', sheetId: 'wayne', speed: 50, outReason: null, armor: [], interactionSequence: 0, portraitPath: '' }], pendingActions: [{ combatantKey: 'wayne', action: 'attack' }], attack: null, floor: [], woundOutbox: [], woundAcknowledgements: [] }
const watch: LubecCombatWatch = { enabled: true, ready: true, live: { id: 'fight', fight: { status: 'live', participantUserIds: ['p'], state } } }
const entry = (id: string): CombatLogEntry => ({ id, at: Timestamp.fromMillis(1000), ordinal: 0, event: id, actor: 'wayne', roll: { who: id, what: 'Attack roll', roll: '27', target: 'against 36', result: 'Hit · Quality 2', tone: 'ok', extra: 'Dodgeball thrown at Roy Carver.' } })
const navigate = vi.fn()
const setError = vi.fn()
const tree = (activeTab: 'notes' | 'combat' = 'notes', value = watch, selected: Campaign | null = campaign, role: 'gm' | 'player' = 'player', userId = 'p') => (
  <LubecCombatContext value={value}>
    <CombatFeedback campaign={selected} role={role} userId={userId} activeTab={activeTab} navigate={navigate} setError={setError}>
      <input aria-label="Keep editing" /><CombatTicker />
    </CombatFeedback>
  </LubecCombatContext>
)
const send = (entries: CombatLogEntry[], arriving: CombatLogEntry[] = []) => act(() => mocks.subscriptions.at(-1)!.receive({ entries, arriving }))
beforeEach(() => { mocks.subscriptions = []; vi.clearAllMocks(); vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('workspace roll feedback', () => {
  it('renders only workspace content when combat is disabled, even if stale fight state remains', () => {
    render(tree('notes', { ...watch, enabled: false }))
    expect(screen.getByLabelText('Keep editing')).toBeTruthy()
    expect(document.querySelector('.combat-cards')).toBeNull()
    expect(screen.queryByRole('button', { name: /Your turn/ })).toBeNull()
    expect(mocks.subscriptions).toHaveLength(0)
  })
  it('keeps one listener across tabs, shows committed cards without taking focus, and opens the full newest-first ticker', () => {
    const view = render(tree())
    const input = screen.getByLabelText('Keep editing')
    input.focus()
    const a = entry('Wayne'), b = entry('Roy')
    send([a])
    expect(document.querySelectorAll('.rcard')).toHaveLength(0)
    send([a, b], [b])
    expect(document.activeElement).toBe(input)
    expect(document.querySelector('.rcard')?.textContent).toBe('Roy · Attack roll27against 36Hit · Quality 2Dodgeball thrown at Roy Carver.')
    expect(screen.getByRole('button', { name: /Your turn/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Your turn/ }))
    expect(navigate).toHaveBeenCalledWith('/groups/g/campaigns/c/combat')
    view.rerender(tree('combat'))
    expect(mocks.subscriptions).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Your turn/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Table/ }))
    expect(screen.getByRole('button', { name: /Table/ }).getAttribute('aria-expanded')).toBe('true')
    expect([...document.querySelectorAll('.ticker-list li')].map((row) => row.textContent)).toEqual([expect.stringContaining('Roy - Attack roll'), expect.stringContaining('Wayne - Attack roll')])
    expect(document.querySelector('.rcard')?.textContent).toContain('Roy')
    act(() => vi.advanceTimersByTime(6500))
    expect(document.querySelector('.rcard')?.className).toContain('gone')
    act(() => vi.advanceTimersByTime(600))
    expect(document.querySelectorAll('.rcard')).toHaveLength(0)
    view.rerender(tree())
    expect(document.querySelectorAll('.rcard')).toHaveLength(0)
    expect(mocks.subscriptions).toHaveLength(1)
  })
  it('caps bursts at three, times each card independently, and leaves ticker history intact', () => {
    render(tree())
    const a = entry('one'), b = entry('two'), c = entry('three'), d = entry('four')
    send([a], [a])
    act(() => vi.advanceTimersByTime(1000))
    send([a, b], [b])
    act(() => vi.advanceTimersByTime(1000))
    send([a, b, c, d], [c, d])
    expect([...document.querySelectorAll('.rcard .rw')].map((node) => node.textContent)).toEqual(['two · Attack roll', 'three · Attack roll', 'four · Attack roll'])
    act(() => vi.advanceTimersByTime(5500))
    expect(document.querySelectorAll('.rcard.gone')).toHaveLength(1)
    act(() => vi.advanceTimersByTime(600))
    expect(document.querySelectorAll('.rcard')).toHaveLength(2)
    expect(screen.getByText('All 4')).toBeTruthy()
  })
  it('does not replay after remount, follows a final End entry, and cleans timers and subscriptions', () => {
    const view = render(tree())
    send([entry('old')], [entry('old')])
    act(() => vi.advanceTimersByTime(7100))
    view.rerender(tree('combat', { ...watch, live: null }))
    expect(document.querySelectorAll('.rcard')).toHaveLength(0)
    const ended = { ...entry('ended'), roll: undefined }
    send([entry('old'), ended], [ended])
    expect(document.querySelector('.rcard')?.textContent).toBe('Tableended')
    view.unmount()
    expect(mocks.subscriptions[0].stop).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
    render(tree())
    send([entry('old'), ended])
    expect(document.querySelectorAll('.rcard')).toHaveLength(0)
  })
  it('clears stale fight and campaign feedback, reports errors, and never attaches behind the gate', () => {
    const view = render(tree())
    send([entry('old')], [entry('old')])
    const next: LubecCombatWatch = { ...watch, live: { ...watch.live!, id: 'new-fight' } }
    view.rerender(tree('combat', next))
    expect(mocks.subscriptions[0].stop).toHaveBeenCalledOnce()
    expect(screen.getByText('All 0')).toBeTruthy()
    send([entry('history')])
    expect(document.querySelectorAll('.rcard')).toHaveLength(0)
    act(() => mocks.subscriptions.at(-1)!.error())
    expect(setError).toHaveBeenCalledWith('Could not follow the combat log.')
    view.rerender(tree('notes', { ...watch, live: null }, { ...campaign, id: 'other' }))
    expect(mocks.subscriptions.at(-1)!.stop).toHaveBeenCalledOnce()
    expect(screen.getByText('All 0')).toBeTruthy()
    view.rerender(tree('notes', { enabled: false, ready: true, live: null }, null))
    expect(mocks.subscriptions).toHaveLength(2)
  })
  it('keeps spectator and Out roll cards while offering no turn notice', () => {
    const view = render(tree('notes', watch, campaign, 'player', 'spectator'))
    send([entry('live')], [entry('live')])
    expect(document.querySelectorAll('.rcard')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Your turn/ })).toBeNull()
    const fight: CombatFight = { ...watch.live!.fight, state: { ...state, combatants: [{ ...state.combatants[0], outReason: 'caught' }] } }
    view.rerender(tree('notes', { ...watch, live: { id: 'fight', fight } }))
    expect(document.querySelectorAll('.rcard')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Your turn/ })).toBeNull()
  })
  it('renders rolls without extra text in every result tone', () => {
    render(tree())
    const a = entry('Miss'), b = entry('Dropped')
    a.roll = { ...a.roll!, tone: 'bad', extra: undefined }
    b.roll = { ...b.roll!, tone: 'neutral', extra: undefined }
    send([a, b], [a, b])
    expect(document.querySelectorAll('.rcard .rx')).toHaveLength(0)
    expect(document.querySelector('.rcard.bad')).toBeTruthy()
    expect(document.querySelector('.rcard.neutral')).toBeTruthy()
  })
  it('renders every owned request without another actor controls, including GM requests', () => {
    const onReturn = vi.fn()
    render(<CombatTurnNotice actions={[{ combatantKey: 'a', name: 'Wayne', action: 'defense' }, { combatantKey: 'b', name: 'Joseph', action: 'save' }]} onReturn={onReturn} />)
    expect(screen.getByText('Wayne: roll Defense')).toBeTruthy()
    expect(screen.getByText('Joseph: roll a Save')).toBeTruthy()
    fireEvent.click(screen.getByRole('button'))
    expect(onReturn).toHaveBeenCalledOnce()
  })
})
