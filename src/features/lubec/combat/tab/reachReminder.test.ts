import { describe, expect, it } from 'vitest'
import { reachReminder } from './attackWindowModel'
import type { CombatState } from '../engine/types'

const state = { round: 2, combatants: [{ key: 'npc:roy', name: 'Roy' }], outOfReach: [{ attackerKey: 'character:hero', targetKey: 'npc:roy', round: 1 }] } as unknown as CombatState
const melee = { handle: 50, skill: null, total: 50, ranged: false }

describe('the out-of-reach reminder', () => {
  it('shows on the original attacker\'s melee aim at the target it knocked back, and nowhere else', () => {
    expect(reachReminder(state, 'character:hero', 'npc:roy', melee)).toBe('Roy was knocked out of striking reach by your last hit. The GM rules whether this melee attack can reach them.')
    expect(reachReminder(state, 'character:hero', 'npc:roy', { ...melee, ranged: true })).toBeNull()
    expect(reachReminder(state, 'character:other', 'npc:roy', melee)).toBeNull()
    expect(reachReminder(state, 'character:hero', 'npc:dale', melee)).toBeNull()
    expect(reachReminder({ ...state, outOfReach: [] }, 'character:hero', 'npc:roy', melee)).toBeNull()
  })
})
