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
import { LUBEC_SPIN_STEPS, lubecSpinDelay } from '../lubecCircles'

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
beforeEach(() => {
  mocks.subscriptions = []; vi.clearAllMocks(); vi.useFakeTimers()
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: vi.fn(() => ({ matches: true })) })
})
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
    expect(screen.getByRole('heading', { name: 'Hit' })).toBeTruthy()
    expect(document.querySelector('.rcard .rn')?.textContent).toBe('27UNDER36')
    expect(screen.getByText('Quality 2')).toBeTruthy()
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
  it('queues every roll in a burst, shows one at a time, and leaves ticker history intact', () => {
    render(tree())
    const a = entry('one'), b = entry('two'), c = entry('three'), d = entry('four')
    send([a], [a])
    act(() => vi.advanceTimersByTime(1000))
    send([a, b], [b])
    act(() => vi.advanceTimersByTime(1000))
    send([a, b, c, d], [c, d])
    expect([...document.querySelectorAll('.rcard .rw')].map((node) => node.textContent)).toEqual(['one · Attack roll'])
    act(() => vi.advanceTimersByTime(4500))
    expect(document.querySelectorAll('.rcard.gone')).toHaveLength(1)
    act(() => vi.advanceTimersByTime(600))
    expect(document.querySelector('.rcard .rw')?.textContent).toBe('two · Attack roll')
    act(() => vi.advanceTimersByTime(7100))
    expect(document.querySelector('.rcard .rw')?.textContent).toBe('three · Attack roll')
    act(() => vi.advanceTimersByTime(7100))
    expect(document.querySelector('.rcard .rw')?.textContent).toBe('four · Attack roll')
    act(() => vi.advanceTimersByTime(7100))
    expect(document.querySelectorAll('.rcard')).toHaveLength(0)
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
    expect(document.querySelector('.rcard')).toBeNull()
    expect(screen.getByText('All 2')).toBeTruthy()
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
    act(() => vi.advanceTimersByTime(7100))
    expect(document.querySelector('.rcard.neutral')).toBeTruthy()
  })
  it('keeps routine phase changes in history without competing with the roll', () => {
    render(tree())
    const result = entry('Tommy')
    const movement = { ...entry('movement'), roll: undefined, event: 'Round 5, Movement.' }
    send([result, movement], [result, movement])
    expect(document.querySelectorAll('.rcard')).toHaveLength(1)
    expect(document.querySelector('.rcard .rw')?.textContent).toBe('Tommy · Attack roll')
    act(() => vi.advanceTimersByTime(7100))
    expect(document.querySelectorAll('.rcard')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: /Table/ }))
    expect(screen.getByText('Round 5, Movement.')).toBeTruthy()
  })
  it('shows the sheet\'s slowing number animation before revealing the committed outcome', async () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList)
    render(tree())
    const result = entry('Tommy')
    result.roll = { ...result.roll!, roll: '54', target: 'against 64', result: 'Hit · Quality 5' }
    send([result], [result])
    expect(screen.getByRole('heading', { name: 'Rolling...' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Hit' })).toBeNull()
    expect(document.querySelector('.rcard .rn')?.getAttribute('aria-hidden')).toBe('true')
    const first = document.querySelector('.rcard .rn b')!.textContent
    await act(async () => { await vi.advanceTimersByTimeAsync(lubecSpinDelay(0)) })
    expect(document.querySelector('.rcard .rn b')!.textContent).not.toBe(first)
    for (let step = 1; step < LUBEC_SPIN_STEPS; step++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(lubecSpinDelay(step)) })
    }
    expect(screen.getByRole('heading', { name: 'Hit' })).toBeTruthy()
    expect(document.querySelector('.rcard .rn')?.textContent).toBe('54UNDER64')
    expect(screen.getByText('Quality 5')).toBeTruthy()
    expect(document.querySelector('.rcard .rn')?.getAttribute('aria-hidden')).toBe('false')
  })
  it('shows equality honestly while retaining the committed miss or save success', () => {
    render(tree())
    const miss = entry('Miss'), save = entry('Save')
    miss.roll = { ...miss.roll!, roll: '45', target: 'against 45', result: 'Miss', tone: 'bad' }
    save.roll = { ...save.roll!, roll: '45', target: 'under 45', result: 'Success' }
    send([miss, save], [miss, save])
    expect(screen.getByRole('heading', { name: 'Miss' })).toBeTruthy()
    expect(document.querySelector('.rcard .rn')?.textContent).toBe('45EQUAL TO45')
    act(() => vi.advanceTimersByTime(7100))
    expect(screen.getByRole('heading', { name: 'Success' })).toBeTruthy()
    expect(document.querySelector('.rcard .rn')?.textContent).toBe('45EQUAL TO45')
  })
  it('starts a fresh roll when a new fight reuses an entry id and cancels old timers', () => {
    const view = render(tree())
    const old = entry('same-id')
    send([old], [old])
    act(() => vi.advanceTimersByTime(4000))
    view.rerender(tree('combat', { ...watch, live: { ...watch.live!, id: 'next-fight' } }))
    const next = entry('same-id')
    next.roll = { ...next.roll!, who: 'New fight' }
    send([next], [next])
    act(() => vi.advanceTimersByTime(3100))
    expect(document.querySelector('.rcard .rw')?.textContent).toBe('New fight · Attack roll')
    expect(document.querySelector('.rcard.gone')).toBeNull()
    act(() => vi.advanceTimersByTime(4000))
    expect(document.querySelector('.rcard')).toBeNull()
  })
  it('cancels the animation and dismissal timers when feedback unmounts', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as MediaQueryList)
    const view = render(tree())
    const result = entry('Tommy')
    send([result], [result])
    expect(screen.getByRole('heading', { name: 'Rolling...' })).toBeTruthy()
    expect(vi.getTimerCount()).toBe(3)
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
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
