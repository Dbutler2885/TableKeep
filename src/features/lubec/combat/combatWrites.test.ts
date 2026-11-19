import { describe, expect, it, vi } from 'vitest'
import type { Firestore, Transaction } from 'firebase/firestore'
import { combatEntropy } from './engine/commandEntropy'
import type { CombatCommand, CombatPlan } from './engine/types'

// A command's state names the roll log entries it was rolled in, so every viewer can hold the state back until they reveal.

vi.mock('firebase/firestore', async (original) => ({
  ...await original<typeof import('firebase/firestore')>(),
  doc: (parent: { path?: string }, ...parts: string[]) => ({ path: [parent.path, ...parts].filter(Boolean).join('/') }),
  serverTimestamp: () => 'now',
}))

const { writeCombatPlan } = await import('./combatWrites')

const command = (type: string): CombatCommand => ({
  envelope: { id: 'cmd', groupId: 'g', campaignId: 'c', fightId: 'fight', round: 1, phase: 'attack', stageInstanceId: 's', actorKey: null, interactionSequence: 0 },
  seed: 'seed', payload: { type },
})
const roll = { who: 'Roy', what: 'Attack roll', roll: '27', target: 'against 36', result: 'Hit', tone: 'ok' as const }
const plan: CombatPlan = {
  fight: { status: 'live', participantUserIds: [], state: { round: 1, phase: 'attack', stageInstanceId: 's', combatants: [], floor: [], attack: null, woundOutbox: [], woundAcknowledgements: [], revealRolls: ['stale'] } },
  items: [], logs: [{ event: 'Roy attacked.', actor: null, roll }, { event: 'It hits.', actor: null }, { event: 'Strength.', actor: null, roll }],
}

function written(type: string) {
  const tx = { set: vi.fn(), update: vi.fn() }
  writeCombatPlan({} as Firestore, tx as unknown as Transaction, command(type), plan, combatEntropy(command(type)))
  return tx
}

describe('the state a command writes', () => {
  it('names the roll log entries it was rolled in, and only those', () => {
    const tx = written('roll')
    const logIds = tx.set.mock.calls.filter(([ref]) => ref.path.includes('/log/')).map(([ref]) => ref.path.split('/').at(-1))
    const state = tx.update.mock.calls[0][1].state
    expect(state.revealRolls).toEqual([logIds[0], logIds[2]])
  })

  it('names them on the fight Start creates too', () => {
    const tx = written('start')
    const fight = tx.set.mock.calls.find(([ref]) => ref.path.endsWith('combats/fight'))![1]
    expect(fight.state.revealRolls).toHaveLength(2)
  })
})
