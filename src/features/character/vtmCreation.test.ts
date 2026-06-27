import { describe, expect, it } from 'vitest'
import { defaultVtmSheet } from './vtmDefaults'
import {
  abilityPoolStatus,
  attributePoolStatus,
  backgroundPoolStatus,
  deriveBloodPoolMax,
  deriveHumanity,
  deriveWillpower,
  disciplinePoolStatus,
  dotMaxForPhase,
  freebieStatus,
  virtuePoolStatus,
} from './vtmCreation'

describe('vtmCreation', () => {
  it('derives Humanity, Willpower, and Blood Pool max', () => {
    const sheet = defaultVtmSheet()
    expect(deriveHumanity(sheet.virtues)).toBe(2)
    expect(deriveWillpower(sheet.virtues)).toBe(1)
    expect(deriveBloodPoolMax('8th')).toBe(15)
    expect(deriveBloodPoolMax('3rd')).toBeNull()
  })

  it('counts attribute dots above the one-dot baseline by ranked pool', () => {
    const sheet = defaultVtmSheet()
    sheet.attributes.physical.Strength = 4
    sheet.attributes.physical.Dexterity = 3
    sheet.attributes.physical.Stamina = 2
    expect(attributePoolStatus(sheet, 'physical')).toEqual({
      allocated: 6,
      budget: 7,
      remaining: 1,
      over: false,
    })
  })

  it('counts ability category pools', () => {
    const sheet = defaultVtmSheet()
    sheet.abilities.talents.Acting = 3
    sheet.abilities.talents.Alertness = 3
    sheet.abilities.talents.Brawl = 3
    expect(abilityPoolStatus(sheet, 'talents')).toEqual({
      allocated: 9,
      budget: 13,
      remaining: 4,
      over: false,
    })
  })

  it('caps scaling Traits at 5 during creation but at the generation Trait Max in play', () => {
    // Creation: impossible to exceed 5 for any generation (rulebook p.139).
    expect(dotMaxForPhase('13th', false)).toBe(5)
    expect(dotMaxForPhase('6th', false)).toBe(5)
    expect(dotMaxForPhase('3rd', false)).toBe(5)
    // In play: a low-generation elder may raise a Discipline past 5.
    expect(dotMaxForPhase('13th', true)).toBe(5)
    expect(dotMaxForPhase('7th', true)).toBe(6)
    expect(dotMaxForPhase('6th', true)).toBe(7)
    expect(dotMaxForPhase('5th', true)).toBe(8)
    expect(dotMaxForPhase('3rd', true)).toBe(10)
    // Unknown / blank generation falls back to 5.
    expect(dotMaxForPhase('', true)).toBe(5)
    expect(dotMaxForPhase(undefined, true)).toBe(5)
  })

  it('counts advantage pools and freebies', () => {
    const sheet = defaultVtmSheet()
    sheet.disciplines = [{ id: 'd1', name: 'Celerity', rating: 2 }]
    sheet.backgrounds = [{ id: 'b1', name: 'Resources', rating: 5 }]
    sheet.virtues.Conscience = 3
    sheet.virtues['Self-Control'] = 3
    sheet.freebiePointsSpent = 12
    expect(disciplinePoolStatus(sheet).remaining).toBe(1)
    expect(backgroundPoolStatus(sheet).remaining).toBe(0)
    expect(virtuePoolStatus(sheet).allocated).toBe(4)
    expect(freebieStatus(sheet).remaining).toBe(3)
  })
})
