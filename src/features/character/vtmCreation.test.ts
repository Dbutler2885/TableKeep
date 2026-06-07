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
