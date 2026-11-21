import { describe, expect, it } from 'vitest'
import {
  lubecAllocationLabelPlace,
  lubecAllocationOutcome,
  lubecAllocationPosition,
  lubecAllocationSegments,
  lubecAllocationToolStatus,
  lubecFightHandle,
  lubecFightSkillBonus,
  lubecFightSkills,
  withLubecLineMoved,
  withLubecLinePlaced,
  withLubecLineRemoved,
} from './fightAllocation'
import { lubecSheet } from './sheetFixtures'

describe('the Fight bar\'s Handle', () => {
  it('is Effective Handle plus the armed skill\'s bonus, held to the bar\'s 0-100', () => {
    expect(lubecFightHandle(55, 0)).toBe(55)
    expect(lubecFightHandle(55, 15)).toBe(70)
    expect(lubecFightHandle(95, 15)).toBe(100)
    expect(lubecFightHandle(-5, 0)).toBe(0)
  })

  it('divides nothing for a hole', () => {
    expect(lubecFightHandle(null, 15)).toBe(0)
  })
})

describe('the skills a fight can take', () => {
  const fighter = lubecSheet({ skills: { free: 'Scrapping', picked: ['Boxing', 'Athletics', 'Not A Skill'] } })

  it('lists every skill with a bonus, a fighting skill included, Trained before Expert', () => {
    expect(lubecFightSkills(fighter).map((skill) => [skill.name, skill.bonus])).toEqual([
      ['Athletics', 10], ['Scrapping', 10], ['Boxing', 15],
    ])
  })

  it('adds the armed skill\'s bonus, and nothing for none or a skill the character lacks', () => {
    expect(lubecFightSkillBonus(fighter, 'Boxing')).toBe(15)
    expect(lubecFightSkillBonus(fighter, 'Scrapping')).toBe(10)
    expect(lubecFightSkillBonus(fighter, null)).toBe(0)
    expect(lubecFightSkillBonus(fighter, 'Diving')).toBe(0)
  })
})

describe('the bar\'s parts', () => {
  it('is all attack with no lines', () => {
    expect(lubecAllocationSegments([], 55)).toEqual([{ index: 0, start: 0, size: 55, kind: 'attack', name: 'ATK', alt: false }])
  })

  it('makes each part before the last a Defense, numbered, every other one the lighter blue', () => {
    expect(lubecAllocationSegments([10, 25, 40], 55)).toEqual([
      { index: 0, start: 0, size: 10, kind: 'defense', name: 'DEF 1', alt: false },
      { index: 1, start: 10, size: 15, kind: 'defense', name: 'DEF 2', alt: true },
      { index: 2, start: 25, size: 15, kind: 'defense', name: 'DEF 3', alt: false },
      { index: 3, start: 40, size: 15, kind: 'attack', name: 'ATK', alt: false },
    ])
  })

  it('leaves off a line past the Handle, and an attack of no size', () => {
    expect(lubecAllocationSegments([20, 60], 55).map((part) => [part.name, part.size])).toEqual([['DEF 1', 20], ['ATK', 35]])
    expect(lubecAllocationSegments([20, 55], 55).map((part) => [part.name, part.size])).toEqual([['DEF 1', 20], ['DEF 2', 35]])
  })

  it('has nothing to divide on a Handle of 0', () => {
    expect(lubecAllocationSegments([], 0)).toEqual([])
  })
})

describe('a part\'s label', () => {
  const part = (start: number, size: number) => ({ index: 0, start, size, kind: 'defense' as const, name: 'DEF 1', alt: false })

  it('sits at the part\'s centre, or pins to an end within 5 of it', () => {
    expect(lubecAllocationLabelPlace(part(10, 20))).toEqual({ left: 20, edge: null })
    expect(lubecAllocationLabelPlace(part(0, 8))).toEqual({ left: 0, edge: 'at-start' })
    expect(lubecAllocationLabelPlace(part(92, 8))).toEqual({ left: 100, edge: 'at-end' })
  })
})

describe('a part\'s roll', () => {
  it('succeeds under the part\'s size, as the prototype rolls it', () => {
    expect(lubecAllocationOutcome(14, 15)).toEqual({ success: true, double: false })
    expect(lubecAllocationOutcome(15, 15)).toEqual({ success: false, double: false })
  })

  it('is a double on 11, 22 ... 99, either way', () => {
    expect(lubecAllocationOutcome(22, 40)).toEqual({ success: true, double: true })
    expect(lubecAllocationOutcome(99, 40)).toEqual({ success: false, double: true })
    expect(lubecAllocationOutcome(100, 40)).toEqual({ success: false, double: false })
  })
})

describe('the Defense lines', () => {
  it('places a line at the nearest whole number from 1 to the Handle', () => {
    expect(lubecAllocationPosition(0.234, 55)).toBe(23)
    expect(lubecAllocationPosition(0, 55)).toBe(1)
    expect(lubecAllocationPosition(0.9, 55)).toBe(55)
  })

  it('keeps the lines in order, and never two at one place', () => {
    expect(withLubecLinePlaced([30], 10)).toEqual([10, 30])
    expect(withLubecLinePlaced([10, 30], 30)).toEqual([10, 30])
  })

  it('removes the line at an index', () => {
    expect(withLubecLineRemoved([10, 20, 30], 1)).toEqual([10, 30])
  })

  it('drags a line between its neighbours, and the last one no further than the Handle', () => {
    expect(withLubecLineMoved([10, 20, 30], 1, 25, 55)).toEqual([10, 25, 30])
    expect(withLubecLineMoved([10, 20, 30], 1, 5, 55)).toEqual([10, 11, 30])
    expect(withLubecLineMoved([10, 20, 30], 1, 40, 55)).toEqual([10, 29, 30])
    expect(withLubecLineMoved([10, 20], 0, -3, 55)).toEqual([1, 20])
    expect(withLubecLineMoved([10, 20], 1, 80, 55)).toEqual([10, 55])
  })
})

describe('the tool status', () => {
  it('says what the tool on does', () => {
    expect(lubecAllocationToolStatus('place')).toBe('Click the bar to place')
    expect(lubecAllocationToolStatus('remove')).toBe('Click a line to remove')
    expect(lubecAllocationToolStatus(null)).toBe('Tools off')
  })
})
