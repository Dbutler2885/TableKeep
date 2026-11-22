import { describe, expect, it } from 'vitest'
import type { LubecEffect } from '../../../ruleSets/lubec/effects'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { rollDiceOf, valueBreakdownOf } from './rollBreakdown'
import type { CombatSheet } from './types'

// A combat roll card's dice and the number the roll was made under, read from
// the sheet the roll read, as the roll read it this round.

const record = (effects: LubecEffect[] = [], handle = 50): CombatSheet => {
  const sheet = lubecCharacterSheet({ effects })
  return { kind: 'character', sheetId: 'hero', name: 'Tommy', ownerUserId: 'p', portraitPath: '', sheet: { ...sheet, base: { ...sheet.base, Handle: handle } } }
}
const round = { fightId: 'fight', round: 2 }

describe('a combat roll\'s dice', () => {
  it('keeps both dice of a roll under a mode, with the card that set it', () => {
    expect(rollDiceOf({ dice: [72, 89], mode: 'disadvantage', because: 'Disadvantage from Ribs' })).toEqual({ dice: { values: [72, 89], mode: 'disadvantage', because: 'Disadvantage from Ribs' } })
    expect(rollDiceOf({ dice: [12, 30], mode: 'advantage' })).toEqual({ dice: { values: [12, 30], mode: 'advantage', because: null } })
  })

  it('adds nothing for one die', () => {
    expect(rollDiceOf({ dice: [40], mode: 'normal' })).toEqual({})
    expect(rollDiceOf({})).toEqual({})
  })
})

describe('the number a combat roll was made under', () => {
  it('names each change on the sheet this round, leaving out this fight\'s cards that are not effective yet', () => {
    const now: LubecEffect = { id: 'arm', name: 'Arm wound', cause: '', steps: [{ modifiers: [{ target: 'Handle', amount: -20 }], labels: [] }] }
    const later: LubecEffect = { id: 'leg', name: 'Leg wound', cause: '', combatOrigin: { fightId: 'fight', originatingRound: 2, effectiveRound: 3 }, steps: [{ modifiers: [{ target: 'Handle', amount: -10 }], labels: [] }] }
    expect(valueBreakdownOf(record([now, later]), 'Handle', 35, round)).toEqual({
      breakdown: { name: 'Handle', target: 35, parts: [{ label: 'Base', value: '50' }, { label: 'Working Kid', value: '+5' }, { label: 'Arm wound', value: '-20' }] },
    })
  })

  it('says when Handle\'s cap held the number down', () => {
    expect(valueBreakdownOf(record([], 120), 'Handle', 100, round).breakdown!.parts.at(-1)).toEqual({ label: 'Cap', value: 'no higher than 100' })
  })

  it('has nothing to show without the sheet, or for a hole', () => {
    expect(valueBreakdownOf(null, 'Speed', 56, round)).toEqual({})
    const holed = record()
    expect(valueBreakdownOf({ ...holed, sheet: { ...holed.sheet, base: { ...holed.sheet.base, Speed: null } } }, 'Speed', 56, round)).toEqual({})
  })
})
