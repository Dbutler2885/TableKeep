import { describe, expect, it } from 'vitest'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import type { LubecEffect } from '../../../ruleSets/lubec/effects'
import { combatEntropy } from './commandEntropy'
import { combatAttackResult } from './attackMath'
import { betterAttack, betterInitiative, combatAttackActions, combatRollMode, combatTaskPenalty, rollWithMode, successThenHigher } from './combatModes'
import type { CombatCommand, CombatSheet } from './types'
import { landingCheckMode } from './woundCheck'

const command = { envelope: { id: 'c' }, seed: 's', payload: { type: 'x' } } as unknown as CombatCommand
const dice = (...values: number[]) => ({ ...combatEntropy(command), die: () => values.shift()! })
const card = (id: string, rolls: object[], extra: object = {}): LubecEffect => ({ id, name: id, cause: '', steps: [{ modifiers: [], labels: [], until: 'long-rest', rolls, ...extra } as never] })
const record = (effects: LubecEffect[]): CombatSheet => ({ kind: 'character', sheetId: 'x', name: 'X', ownerUserId: 'p', portraitPath: '', sheet: lubecCharacterSheet({ effects }) })
const strength = (target: number) => (roll: number) => ({ roll, success: roll <= target })

describe('two dice under a mode', () => {
  it('keeps the worse Strength roll at Disadvantage: a failure over a success, the lower of two successes', () => {
    expect(rollWithMode(dice(20, 70), 'strength', 'disadvantage', strength(50), successThenHigher)).toEqual({ kept: { roll: 70, success: false }, dice: [20, 70] })
    expect(rollWithMode(dice(40, 20), 'strength', 'disadvantage', strength(50), successThenHigher).kept.roll).toBe(20)
  })

  it('keeps the better at Advantage: a success over a failure, the higher of two successes', () => {
    expect(rollWithMode(dice(70, 20), 'strength', 'advantage', strength(50), successThenHigher).kept.roll).toBe(20)
    expect(rollWithMode(dice(20, 40), 'strength', 'advantage', strength(50), successThenHigher).kept.roll).toBe(40)
  })

  it('rolls one die when the mode is normal', () => {
    expect(rollWithMode(dice(33), 'strength', 'normal', strength(50), successThenHigher)).toEqual({ kept: { roll: 33, success: true }, dice: [33] })
  })
})

describe('two attack dice under a mode', () => {
  const attack = (attackNumber: number) => (roll: number) => combatAttackResult(roll, attackNumber)
  const kept = (mode: 'advantage' | 'disadvantage', ...rolls: number[]) => rollWithMode(dice(...rolls), 'attack', mode, attack(60), betterAttack).kept.roll

  it('keeps the hit at Advantage and the miss at Disadvantage', () => {
    expect(kept('advantage', 70, 30)).toBe(30)
    expect(kept('disadvantage', 30, 70)).toBe(70)
  })

  it('keeps the higher-quality hit at Advantage and the lower at Disadvantage', () => {
    expect(kept('advantage', 25, 45)).toBe(45)
    expect(kept('disadvantage', 45, 25)).toBe(25)
  })

  it('ranks a critical by its attack number, above a higher roll that is not one', () => {
    expect(kept('advantage', 57, 44)).toBe(44)
    expect(kept('disadvantage', 44, 57)).toBe(57)
  })

  it('breaks a tie in quality by the higher roll', () => {
    expect(kept('advantage', 41, 47)).toBe(47)
    expect(kept('disadvantage', 47, 41)).toBe(41)
  })

  it('keeps the first of two misses either way, as neither is better', () => {
    expect(kept('advantage', 80, 90)).toBe(80)
    expect(kept('disadvantage', 90, 80)).toBe(90)
  })
})

describe('two initiative dice under a mode', () => {
  const speed = (roll: number) => ({ roll, speed: 50, success: roll < 50, sourceRevision: 0, ties: [] })
  const kept = (mode: 'advantage' | 'disadvantage', ...rolls: number[]) => rollWithMode(dice(...rolls), 'initiative', mode, speed, betterInitiative).kept.roll

  it('keeps the success at Advantage and the failure at Disadvantage', () => {
    expect(kept('advantage', 70, 20)).toBe(20)
    expect(kept('disadvantage', 20, 70)).toBe(70)
  })

  it('ranks two successes by the higher roll', () => {
    expect(kept('advantage', 20, 40)).toBe(40)
    expect(kept('disadvantage', 40, 20)).toBe(20)
  })

  it('ranks two failures by the lower roll, as initiative orders them', () => {
    expect(kept('advantage', 80, 60)).toBe(60)
    expect(kept('disadvantage', 60, 80)).toBe(80)
  })
})

describe('what a combat roll reads', () => {
  const context = { fightId: 'f', round: 2 }

  it('treats initiative and Evasive Movement as Speed Checks', () => {
    const legs = record([card('Leg', [{ scope: 'speed', mode: 'disadvantage' }])])
    expect(combatRollMode(legs, { kind: 'initiative', stat: 'Speed' }, context).mode).toBe('disadvantage')
    expect(combatRollMode(legs, { kind: 'evasion', stat: 'Speed' }, context).mode).toBe('disadvantage')
    expect(combatRollMode(legs, { kind: 'attack', stat: 'Handle' }, context).mode).toBe('normal')
  })

  it('never reads a wound of this fight before it is effective', () => {
    const late = { ...card('Ribs', [{ scope: 'physical', mode: 'disadvantage' }]), combatOrigin: { fightId: 'f', woundId: 'w', originatingRound: 2, effectiveRound: 3 } }
    expect(combatRollMode(record([late]), { kind: 'attack', stat: 'Handle' }, context).mode).toBe('normal')
    expect(combatRollMode(record([late]), { kind: 'attack', stat: 'Handle' }, { fightId: 'f', round: 3 }).mode).toBe('disadvantage')
  })

  it('joins a row\'s own fixed mode to the cards, so they cancel rather than stack', () => {
    const check = { kind: 'save', against: 'Body', advantage: 'disadvantage' } as const
    expect(landingCheckMode(record([]), check, 'Head 9', context)).toEqual({ mode: 'disadvantage', because: 'Disadvantage from Head 9' })
    expect(landingCheckMode(record([card('Lucky', [{ scope: 'saves', mode: 'advantage' }])]), check, 'Head 9', context).mode).toBe('normal')
    expect(landingCheckMode(record([card('Ribs', [{ scope: 'rolls', mode: 'disadvantage' }])]), check, 'Head 9', context).mode).toBe('disadvantage')
  })

  it('names a firearm or throw ranged and an unarmed blow a punch, and takes a ranged penalty off only those', () => {
    expect(combatAttackActions({ firearm: true, ranged: true, name: 'Shoot', wound: 'gunshot' } as never)).toEqual(['ranged'])
    expect(combatAttackActions({ ranged: true, name: 'Throw', wound: 'thrown' } as never)).toEqual(['ranged', 'throw'])
    expect(combatAttackActions({ name: 'Punch', wound: 'fisticuffs' } as never)).toEqual(['punch'])
    expect(combatAttackActions({ name: 'Slash', wound: 'cutting' } as never)).toEqual([])
    const eye = record([card('Eye', [], { taskModifiers: [{ target: 'Handle', amount: -20, task: 'ranged-visual' }] })])
    expect(combatTaskPenalty(eye, ['ranged'], context, 'Handle')).toBe(-20)
    expect(combatTaskPenalty(eye, [], context, 'Handle')).toBe(0)
  })
})
