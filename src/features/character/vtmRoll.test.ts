import { describe, expect, it } from 'vitest'
import { defaultVtmSheet } from './vtmDefaults'
import {
  abilityRating,
  attributeRating,
  buildPoolLabel,
  disciplineRating,
  initiativePreset,
  poolDiceCount,
  rollDice,
  rollDie,
  soakPreset,
} from './vtmRoll'

// A deterministic RNG that walks a fixed list of [0,1) values, so dice come out
// predictably. Each value v maps to a die face of floor(v * 10) + 1.
function seededRng(values: number[]): () => number {
  let index = 0
  return () => values[index++ % values.length]
}

describe('vtmRoll dice', () => {
  it('maps RNG values to d10 faces (1-10)', () => {
    expect(rollDie(seededRng([0]))).toBe(1)
    expect(rollDie(seededRng([0.05]))).toBe(1)
    expect(rollDie(seededRng([0.95]))).toBe(10)
    expect(rollDie(seededRng([0.5]))).toBe(6)
  })

  it('rolls exactly `count` dice deterministically from the RNG', () => {
    const dice = rollDice(5, seededRng([0, 0.95, 0.5, 0.1, 0.89]))
    expect(dice).toEqual([1, 10, 6, 2, 9])
  })

  it('clamps non-positive and fractional counts to whole, non-negative pools', () => {
    expect(rollDice(0)).toEqual([])
    expect(rollDice(-3)).toEqual([])
    expect(rollDice(3.9, seededRng([0.2, 0.4, 0.6]))).toEqual([3, 5, 7])
  })

  it('only ever produces faces in 1..10 over many rolls', () => {
    for (const face of rollDice(200)) {
      expect(face).toBeGreaterThanOrEqual(1)
      expect(face).toBeLessThanOrEqual(10)
    }
  })
})

describe('vtmRoll pool maths', () => {
  it('sums attribute and second-slot ratings', () => {
    expect(poolDiceCount({ name: 'Dexterity', rating: 3 }, { kind: 'Ability', name: 'Stealth', rating: 2 })).toBe(5)
    expect(poolDiceCount({ name: 'Stamina', rating: 3 }, null)).toBe(3)
    expect(poolDiceCount(null, null)).toBe(0)
  })

  it('labels solo and combined pools', () => {
    expect(buildPoolLabel({ name: 'Stamina', rating: 3 }, null)).toBe('Stamina')
    expect(buildPoolLabel({ name: 'Dexterity', rating: 3 }, { kind: 'Ability', name: 'Stealth', rating: 2 })).toBe('Dexterity + Stealth')
    expect(buildPoolLabel(null, null)).toBe('')
  })
})

describe('vtmRoll trait lookups', () => {
  it('reads ratings across categories with the right defaults', () => {
    const sheet = defaultVtmSheet()
    sheet.attributes.mental.Wits = 4
    sheet.abilities.talents.Alertness = 3
    sheet.disciplines = [{ id: 'd1', name: 'Fortitude', rating: 2 }]

    expect(attributeRating(sheet, 'Wits')).toBe(4)
    expect(attributeRating(sheet, 'Strength')).toBe(1) // default floor
    expect(abilityRating(sheet, 'Alertness')).toBe(3)
    expect(abilityRating(sheet, 'Brawl')).toBe(0) // default
    expect(disciplineRating(sheet, 'Fortitude')).toBe(2)
    expect(disciplineRating(sheet, 'Celerity')).toBe(0) // not owned
  })
})

describe('vtmRoll presets', () => {
  it('builds Initiative from Wits + Alertness', () => {
    const sheet = defaultVtmSheet()
    sheet.attributes.mental.Wits = 3
    sheet.abilities.talents.Alertness = 2
    expect(initiativePreset(sheet)).toEqual({
      attr: { name: 'Wits', rating: 3 },
      second: { kind: 'Ability', name: 'Alertness', rating: 2 },
    })
  })

  it('builds Soak from Stamina + Fortitude when Fortitude is present', () => {
    const sheet = defaultVtmSheet()
    sheet.attributes.physical.Stamina = 3
    sheet.disciplines = [{ id: 'f1', name: 'Fortitude', rating: 2 }]
    expect(soakPreset(sheet)).toEqual({
      attr: { name: 'Stamina', rating: 3 },
      second: { kind: 'Discipline', name: 'Fortitude', rating: 2 },
    })
  })

  it('builds Soak from Stamina alone when the character has no Fortitude', () => {
    const sheet = defaultVtmSheet()
    sheet.attributes.physical.Stamina = 2
    expect(soakPreset(sheet)).toEqual({
      attr: { name: 'Stamina', rating: 2 },
      second: null,
    })
  })
})
