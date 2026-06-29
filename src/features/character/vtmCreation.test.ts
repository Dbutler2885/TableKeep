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
  emptyFreebieDots,
  freebiePointsFromDots,
  freebieStatus,
  sheetCreationErrors,
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

  it('derives freebie points spent from per-pool freebie dots', () => {
    expect(freebiePointsFromDots(emptyFreebieDots())).toBe(0)
    // 1 attribute dot (5) + 2 ability dots (2 each) + 1 discipline dot (7)
    // + 1 background dot (1) + 1 virtue dot (2) + 1 willpower dot (2) + 1 humanity dot (1)
    expect(
      freebiePointsFromDots({
        ...emptyFreebieDots(),
        physical: 1,
        talents: 2,
        disciplines: 1,
        backgrounds: 1,
        virtues: 1,
        willpower: 1,
        humanity: 1,
      }),
    ).toBe(5 + 4 + 7 + 1 + 2 + 2 + 1)
  })

  it('does not count freebie-funded dots as starting-pool overspend (Bug B)', () => {
    const sheet = defaultVtmSheet()
    // Fill the Physical pool exactly to its budget of 7 (the freebie gate requires
    // every starting pool to be fully assigned before freebies open).
    sheet.attributes.physical.Strength = 4
    sheet.attributes.physical.Dexterity = 4
    sheet.attributes.physical.Stamina = 2
    expect(attributePoolStatus(sheet, 'physical')).toMatchObject({ allocated: 7, remaining: 0, over: false })

    // Open freebies and raise Strength 4 -> 5: a legal 5-point freebie purchase.
    sheet.attributes.physical.Strength = 5
    sheet.freebieDots = { ...emptyFreebieDots(), physical: 1 }
    sheet.freebiePointsSpent = freebiePointsFromDots(sheet.freebieDots)

    // The freebie dot is charged against the 15-point freebie budget, not the pool:
    expect(freebieStatus(sheet)).toMatchObject({ allocated: 5, remaining: 10, over: false })
    // ...so the Physical pool reads its base allocation (7), NOT an overspend.
    expect(attributePoolStatus(sheet, 'physical')).toMatchObject({ allocated: 7, remaining: 0, over: false })
    // ...and creation is valid, so Finalize is not blocked.
    expect(sheetCreationErrors(sheet)).toEqual([])
  })

  it('still flags a true freebie overspend (more than 15 points)', () => {
    const sheet = defaultVtmSheet()
    // Four freebie attribute dots cost 20 > 15.
    sheet.attributes.physical.Strength = 5 // +4 over the 1-dot baseline... but pool funds 4
    sheet.freebieDots = { ...emptyFreebieDots(), physical: 4 }
    sheet.freebiePointsSpent = freebiePointsFromDots(sheet.freebieDots)
    expect(sheet.freebiePointsSpent).toBe(20)
    expect(freebieStatus(sheet).over).toBe(true)
    expect(sheetCreationErrors(sheet).length).toBeGreaterThan(0)
  })
})
