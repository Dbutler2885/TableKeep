// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import type { Campaign, Role } from '../../../types/app'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { LubecCombatContext } from './combatWatch'
import { planCombatCommand } from './engine/lifecycle'
import type { CombatCommand, CombatOutcome, CombatSheet } from './engine/types'

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, (snap: { data: () => unknown }) => void>(),
  sent: [] as CombatCommand[],
  outcome: { ok: true } as CombatOutcome,
  drain: vi.fn(async () => undefined),
  reply: null as null | ((command: CombatCommand) => Promise<CombatOutcome>),
}))

vi.mock('../../../firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => path,
  onSnapshot: (path: string, next: (snap: { data: () => unknown }) => void) => {
    mocks.listeners.set(path, next)
    return () => mocks.listeners.delete(path)
  },
}))
vi.mock('./useLubecCombatSend', () => ({
  COMBAT_UNCERTAIN: 'The table did not answer. Press again to retry the same action.',
  useLubecCombatSend: () => async (_key: string, make: () => CombatCommand) => {
    const command = make()
    mocks.sent.push(command)
    return mocks.reply ? mocks.reply(command) : mocks.outcome
  },
}))

vi.mock('./woundDelivery', () => ({ drainCombatWounds: (...args: unknown[]) => mocks.drain(...args) }))

const { LubecCombatServices } = await import('./LubecCombatServices')
const { COMBAT_UNCERTAIN } = await import('./useLubecCombatSend')

const campaign = { id: 'gym', groupId: 'school', name: 'Gym', status: 'active' } as Campaign
const root = 'groups/school/campaigns/gym'
const stored = (name: string) => ({ system: 'lubec', schemaVersion: 1, name, ownerUserId: 'gm', portraitPath: '', lubec: lubecCharacterSheet() })
const roy: CombatSheet = { kind: 'npc', sheetId: 'roy', name: 'Roy Carver', ownerUserId: 'gm', portraitPath: '', sheet: lubecCharacterSheet() }

function liveFight() {
  const command = { envelope: { id: 'start', groupId: 'school', campaignId: 'gym', fightId: 'fight', round: 0, phase: 'setup', stageInstanceId: 'setup', actorKey: null, interactionSequence: 0 }, seed: 's', payload: { type: 'start', combatants: [{ kind: 'npc', sheetId: 'roy' }], floor: [], dodgeball: true } } as CombatCommand
  return { id: 'fight', fight: planCombatCommand(command, { activeFightId: null, fight: null, sheets: [roy], items: new Map() }, { userId: 'gm', isGm: true }).fight }
}

function show(role: Role, setError = vi.fn(), live = liveFight()) {
  render(<LubecCombatContext value={{ enabled: true, ready: true, live }}><LubecCombatServices campaign={campaign} role={role} userId="gm" setError={setError} /></LubecCombatContext>)
  return setError
}

const wounded = () => {
  const live = liveFight()
  live.fight.state.woundOutbox = [{ id: 'w', target: { kind: 'npc', sheetId: 'roy' }, originatingRound: 0, effectiveRound: 1, traumaDelta: 1, stressDelta: 0, effect: { id: 'e', name: 'Winded', cause: 'row', steps: [] } }]
  return live
}

const read = (path: string, data: unknown) => act(() => { mocks.listeners.get(`${root}/${path}`)?.({ data: () => data }) })

beforeEach(() => {
  mocks.listeners.clear()
  mocks.sent = []
  mocks.reply = null
  mocks.outcome = { ok: true, fightId: 'fight', generatedIds: [], rolls: [] }
  mocks.drain.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('the GM\'s public summary refresher', () => {
  it('waits for every document, sends one refresh when a summary changed, and not again for the same change', async () => {
    show('gm')
    read('npcSheets/roy', stored('Roy'))
    expect(mocks.sent).toEqual([])
    read('npcs/roy', { name: 'Roy the Bull' })
    await waitFor(() => expect(mocks.sent).toHaveLength(1))
    expect(mocks.sent[0].payload).toEqual({ type: 'refresh' })
    expect(mocks.sent[0].envelope).toMatchObject({ fightId: 'fight', phase: 'before-initiative', actorKey: null })
    read('npcs/roy', { name: 'Roy the Bull' })
    expect(mocks.sent).toHaveLength(1)
  })

  it('reads a missing NPC record as no public face, falling back to the sheet', async () => {
    show('gm')
    read('npcSheets/roy', stored('Roy from the sheet'))
    read('npcs/roy', undefined)
    await waitFor(() => expect(mocks.sent).toHaveLength(1))
  })

  it('sends nothing while the published summary is current', () => {
    show('gm')
    read('npcSheets/roy', stored('Roy'))
    read('npcs/roy', { name: 'Roy Carver' })
    expect(mocks.sent).toEqual([])
  })

  it('reports a summary failure requiring attention', async () => {
    mocks.outcome = { ok: false, reason: 'The sheet could not be read.' }
    const setError = show('gm')
    read('npcSheets/roy', stored('Roy'))
    read('npcs/roy', { name: 'Changed' })
    await waitFor(() => expect(setError).toHaveBeenCalledWith('The sheet could not be read.'))
  })

  it('reconciles a refresh racing Movement settlement without a reload, even when the old refusal arrives last', async () => {
    const movement = liveFight()
    movement.fight.state = {
      ...movement.fight.state, round: 1, phase: 'movement', stageInstanceId: 'movement-1', movementComplete: true,
      order: ['npc:roy'], pendingActions: [],
      combatants: movement.fight.state.combatants.map((entry) => ({ ...entry, movement: { choice: 'stay', pickup: null, leave: null } })),
    }
    const refreshes: { command: CombatCommand; answer: (outcome: CombatOutcome) => void }[] = []
    mocks.reply = async (command) => command.payload.type === 'refresh'
      ? new Promise((answer) => refreshes.push({ command, answer }))
      : mocks.outcome
    const setError = vi.fn()
    const tree = (live: typeof movement) => <LubecCombatContext value={{ enabled: true, ready: true, live }}><LubecCombatServices campaign={campaign} role="gm" userId="gm" setError={setError} /></LubecCombatContext>
    const view = render(tree(movement))
    // The sheet subscription changes as the final movement commits (for example, Stand removes a down card).
    read('npcSheets/roy', stored('Roy'))
    read('npcs/roy', { name: 'Changed while moving' })
    await waitFor(() => expect(refreshes).toHaveLength(1))
    const settle = mocks.sent.find((command) => command.payload.type === 'settleMovement')!
    const records = { activeFightId: movement.id, fight: movement.fight, sheets: [roy], items: new Map() }
    const declaring = { id: movement.id, fight: planCombatCommand(settle, records, { userId: 'gm', isGm: true }).fight }
    // Stay leaves the combatants identical across the phase change. The stage itself must invalidate the refresh attempt.
    expect(declaring.fight.state.combatants).toEqual(movement.fight.state.combatants)
    view.rerender(tree(declaring))
    await waitFor(() => expect(refreshes).toHaveLength(2))
    const next = refreshes[1].command
    expect(next.envelope).toMatchObject({ phase: 'declare', stageInstanceId: declaring.fight.state.stageInstanceId })
    const refreshed = planCombatCommand(next, { ...records, fight: declaring.fight, sheets: [{ ...roy, name: 'Changed while moving' }] }, { userId: 'gm', isGm: true }).fight
    await act(async () => { refreshes[1].answer(mocks.outcome) })
    view.rerender(tree({ id: movement.id, fight: refreshed }))
    // The transaction keeps refusing genuinely stale commands; the client must reconcile that expected refusal.
    expect(() => planCombatCommand(refreshes[0].command, { ...records, fight: refreshed }, { userId: 'gm', isGm: true })).toThrow('That fight stage is stale.')
    await act(async () => { refreshes[0].answer({ ok: false, reason: 'That fight stage is stale.' }) })
    expect(refreshed.state).toMatchObject({ phase: 'declare', combatants: [{ name: 'Changed while moving' }] })
    expect(setError).not.toHaveBeenCalled()
    expect(refreshes).toHaveLength(2)
  })

  it('is the GM\'s alone', () => {
    show('player')
    expect(mocks.listeners.size).toBe(0)
  })
})

describe('the GM\'s wound delivery', () => {
  it('delivers queued wounds to their sheets from whichever tab is open', async () => {
    const setError = show('gm', vi.fn(), wounded())
    await waitFor(() => expect(mocks.drain).toHaveBeenCalledWith({}, { groupId: 'school', campaignId: 'gym', fightId: 'fight' }, 'gm'))
    expect(setError).not.toHaveBeenCalled()
  })

  it('keeps a failed delivery queued and says why', async () => {
    mocks.drain.mockRejectedValue(new Error('sheet missing'))
    const setError = show('gm', vi.fn(), wounded())
    await waitFor(() => expect(setError).toHaveBeenCalledWith('Waiting for wounds to reach the sheet: Error: sheet missing'))
  })

  it('does nothing outside a campaign', () => {
    render(<LubecCombatContext value={{ enabled: true, ready: true, live: wounded() }}><LubecCombatServices campaign={null} role="gm" userId="gm" setError={vi.fn()} /></LubecCombatContext>)
    expect(mocks.drain).not.toHaveBeenCalled()
    expect(mocks.listeners.size).toBe(0)
  })

  it('leaves delivery to the GM', () => {
    show('player', vi.fn(), wounded())
    expect(mocks.drain).not.toHaveBeenCalled()
  })
})

describe('the GM\'s Movement settlement', () => {
  const settling = (complete = true) => {
    const live = liveFight()
    live.fight.state = { ...live.fight.state, round: 1, phase: 'movement', stageInstanceId: 'movement-1', movementComplete: complete }
    return live
  }
  const settles = () => mocks.sent.filter((command) => command.payload.type === 'settleMovement')

  it('settles a Movement stage once every choice is in, once', async () => {
    show('gm', vi.fn(), settling())
    await waitFor(() => expect(settles()).toHaveLength(1))
    expect(settles()[0].envelope).toMatchObject({ phase: 'movement', stageInstanceId: 'movement-1', actorKey: null })
  })

  it('leaves an all-unconscious skipped round for the GM instead of advancing indefinitely', () => {
    const live = settling()
    live.fight.state.combatants.forEach((entry) => { entry.unconscious = true })
    show('gm', vi.fn(), live)
    expect(settles()).toEqual([])
  })

  it('waits while a choice is still to come', () => {
    show('gm', vi.fn(), settling(false))
    expect(settles()).toEqual([])
  })

  it('says nothing when another GM tab settled the stage first, and reports any other refusal', async () => {
    mocks.outcome = { ok: false, reason: 'That fight stage is stale.' }
    const quiet = show('gm', vi.fn(), settling())
    await waitFor(() => expect(settles()).toHaveLength(1))
    expect(quiet).not.toHaveBeenCalled()
    cleanup()
    mocks.outcome = { ok: false, reason: 'An item already has an owner.' }
    const loud = show('gm', vi.fn(), settling())
    await waitFor(() => expect(loud).toHaveBeenCalledWith('An item already has an owner.'))
  })

  it('tries the same stage again when the connection comes back after an unanswered send', async () => {
    mocks.outcome = { ok: false, reason: COMBAT_UNCERTAIN }
    const setError = show('gm', vi.fn(), settling())
    await waitFor(() => expect(settles()).toHaveLength(1))
    mocks.outcome = { ok: true, fightId: 'fight', generatedIds: [], rolls: [] }
    act(() => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(settles()).toHaveLength(2))
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(settles()).toHaveLength(2)
    expect(setError).not.toHaveBeenCalled()
  })
})
