import { describe, expect, it } from 'vitest'
import { parseLubecGear } from '../../../ruleSets/lubec/gear/gearRecord'
import type { LubecEffect } from '../../../ruleSets/lubec/effects'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { catchChance } from './attackDefense'
import { combatAttackReading } from './attackMath'
import { weaponInHand } from './chooseAgain'
import type { CombatAttack, CombatSheet } from './types'

const inHand = (id: string, name: string, slot: number, extra: Record<string, unknown> = {}) =>
  ({ id, kind: 'weapon', carrier: 'hands', slot, name, size: 1, qty: 1, weight: 'normal', note: '', mode: 'melee', impact: 1, wounds: ['cut'], ...extra })
const restricted = (kind: string, side?: 'L' | 'R'): LubecEffect =>
  ({ id: `${kind}-${side}`, name: 'Wound', cause: '', steps: [{ modifiers: [], labels: [], until: 'long-rest', restrictions: [{ kind, ...(side ? { side } : {}) }] } as never] })
const record = (items: Record<string, unknown>[], effects: LubecEffect[] = []): CombatSheet =>
  ({ kind: 'character', sheetId: 'hero', name: 'Wayne', ownerUserId: 'p', portraitPath: '', sheet: lubecCharacterSheet({ gear: parseLubecGear({ items }), effects }) })
const knife = inHand('knife', 'Knife', 1)

describe('combat reads the same hand limits', () => {
  it('takes a declared weapon out of hand once its arm is unusable, so choose-again opens', () => {
    expect(weaponInHand(record([knife]), { weaponItemId: 'knife', attackId: 'slash' })).toBe(true)
    expect(weaponInHand(record([knife], [restricted('arm-unusable', 'R')]), { weaponItemId: 'knife', attackId: 'slash' })).toBe(false)
    expect(weaponInHand(record([knife], [restricted('arm-unusable', 'L')]), { weaponItemId: 'knife', attackId: 'slash' })).toBe(true)
  })

  it('refuses a forged aim with a two-handed weapon while two-handed actions are impossible', () => {
    const bat = inHand('bat', 'Bat', 0, { size: 2, wounds: ['blunt'] })
    const sheet = record([bat], [restricted('no-two-handed')]).sheet
    expect(combatAttackReading(sheet, [], 'bat', 'swing')).toBeNull()
    expect(combatAttackReading(record([bat]).sheet, [], 'bat', 'swing')).not.toBeNull()
  })

  it('offers no catch when the only free hand is out of use', () => {
    const thrown = { detached: [{ item: { id: 'ball', name: 'Ball', kind: 'weapon', size: 1, qty: 1, weight: 'normal', note: '', catchChance: 50 }, supplies: [] }] } as unknown as CombatAttack
    const lamp = { ...inHand('lamp', 'Lamp', 0), kind: 'thing' }
    expect(catchChance(thrown, record([lamp]), 0)).toBe(50)
    expect(catchChance(thrown, record([lamp], [restricted('no-grip', 'R')]), 0)).toBe(0)
  })
})
