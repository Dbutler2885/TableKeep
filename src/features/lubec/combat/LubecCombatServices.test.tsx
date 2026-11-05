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
    mocks.sent.push(make())
    return mocks.outcome
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

  it('reports a refusal other than an already-current summary', async () => {
    mocks.outcome = { ok: false, reason: 'That fight stage is stale.' }
    const setError = show('gm')
    read('npcSheets/roy', stored('Roy'))
    read('npcs/roy', { name: 'Changed' })
    await waitFor(() => expect(setError).toHaveBeenCalledWith('That fight stage is stale.'))
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
