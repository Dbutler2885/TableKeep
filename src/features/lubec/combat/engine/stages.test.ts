import { describe, expect, it } from 'vitest'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { publicCombatant } from './inputs'
import { combatEntropy } from './commandEntropy'
import { withDeclareRequests, combatAttackers, RAN } from './declare'
import { withMovementRequests } from './movement'
import { lostStageWords, actionResolved, lostRoundsOf, withLostStages } from './stages'
import type { CombatCommand, CombatState } from './types'

const key = 'character:hero'
const command = { envelope: { id: 'x' }, seed: 's' } as CombatCommand
const state = (attacked: string[] = []): CombatState => ({
  round: 3, phase: 'attack', stageInstanceId: 's', attacked, order: [key], floor: [], attack: null,
  woundOutbox: [], woundAcknowledgements: [], combatants: [publicCombatant({ kind: 'character', sheetId: 'hero', name: 'Hero', ownerUserId: 'p', portraitPath: '', sheet: lubecCharacterSheet() })],
})

describe('stage loss at landing', () => {
  it.each([
    [false, 1, { movement: [4], action: [3] }],
    [false, 2, { movement: [4, 5], action: [3, 4] }],
    [true, 2, { movement: [4, 5], action: [4, 5] }],
  ] as const)('Dazed after acting=%s for %s stages has fixed rounds', (acted, count, expected) => {
    expect(lostRoundsOf({ kind: 'dazed', turns: '1d4' }, state(acted ? [key] : []), key, count)).toEqual(expected)
  })

  it('takes next Movement in round 4 and next unresolved Action in round 3, including Full Defense and Ran', () => {
    const current = state()
    for (const declaration of [RAN, { ...RAN, ran: false, full: true }, null]) {
      current.combatants[0].declaration = declaration
      expect(actionResolved(current, key)).toBe(false)
      expect(lostRoundsOf({ kind: 'lose-action' }, current, key, 1)).toEqual({ movement: [], action: [3] })
    }
    expect(lostRoundsOf({ kind: 'lose-movement' }, current, key, 1)).toEqual({ movement: [4], action: [] })
  })

  it('unions overlapping losses and stops remaining Defense without changing the recorded roll', () => {
    const current = state()
    current.combatants[0].declaration = { ...RAN, ran: false, full: true, lines: [{ against: 'npc:foe', amount: 40 }], defenseRolled: true }
    const rolled = { id: 'done', closed: true, defense: { roll: 20 } }
    current.lastAttack = rolled as CombatState['lastAttack']
    const loss = { movement: [4], action: [3] }
    const after = withLostStages(withLostStages(current, key, loss, 'Dazed'), key, loss, 'Dazed')
    expect(after.lost?.[key]).toEqual({ ...loss, reason: 'Dazed' })
    expect(after.combatants[0].declaration).toMatchObject({ stopped: true, lost: true, defenseRolled: true })
    expect(after.lastAttack).toBe(rolled)
    expect(combatAttackers(after)).toEqual([])
  })

  it('automatically fills lost Movement and Action without asking or approval', () => {
    const current = withLostStages({ ...state(), phase: 'movement', round: 4 }, key, { movement: [4], action: [4] }, 'Dazed')
    const moved = withMovementRequests(current)
    expect(moved).toMatchObject({ pendingActions: [], movementComplete: true, combatants: [{ movement: { choice: 'stay', lost: true } }] })
    const declared = withDeclareRequests({ ...moved, phase: 'declare' }, combatEntropy(command)).state
    expect(declared).toMatchObject({ phase: 'attack', pendingActions: [], combatants: [{ declaration: { stopped: true, lost: true, lines: [] } }] })
    expect(combatAttackers(declared)).toEqual([])
    expect(JSON.parse(JSON.stringify(declared)).lost).toEqual(declared.lost)
  })
})

it.each(['comatose', 'dead'] as const)('skips Movement, Action and Defense for %s without Out or changing completed rolls', (condition) => {
  const current = { ...state(), phase: 'movement' }
  current.combatants[0].condition = condition
  const moved = withMovementRequests(current)
  expect(moved).toMatchObject({ pendingActions: [], movementComplete: true, combatants: [{ condition, outReason: null, movement: { lost: true } }] })
  const declared = withDeclareRequests({ ...moved, phase: 'declare' }, combatEntropy(command)).state
  expect(declared.combatants[0].declaration).toMatchObject({ stopped: true, lines: [] })
  expect(combatAttackers(declared)).toEqual([])
  expect(lostStageWords(declared, key)).toEqual([`Unresolved stages lost - ${condition === 'dead' ? 'Dead' : 'Comatose'}`])
})
