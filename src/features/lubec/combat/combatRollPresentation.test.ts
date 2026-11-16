import { describe, expect, it } from 'vitest'
import { combatRollComparison, combatRollPreview, combatRollVerdict } from './combatRollPresentation'
import type { CombatRoll } from './engine/combatFeedback'

const roll = (value: string, target: string): CombatRoll => ({ who: 'Tommy', what: 'Attack roll', roll: value, target, tone: 'ok', result: 'Hit · Quality 5' })

describe('shared roll presentation', () => {
  it.each([
    ['54', 'against 64', 64, 'UNDER'],
    ['64', 'against 45', 45, 'OVER'],
    ['45', 'against 45', 45, 'EQUAL TO'],
    ['100', 'under 100', 100, 'EQUAL TO'],
    ['06', 'under Speed 52', 52, 'UNDER'],
    ['27', 'under 50%', 50, 'UNDER'],
  ])('shows %s compared with %s without deciding the outcome', (value, target, number, relation) => {
    expect(combatRollComparison(roll(value, target))).toEqual({ value, target: number, relation })
  })

  it('leaves an unfamiliar roll or target format to its original log text', () => {
    expect(combatRollComparison(roll('2d10', 'against 64'))).toBeNull()
    expect(combatRollComparison(roll('54', 'a special table'))).toBeNull()
  })

  it('keeps qualifications separate from the recorded outcome', () => {
    expect(combatRollVerdict('Hit · Quality 5 (critical)')).toEqual({ headline: 'Hit', detail: 'Quality 5 (critical)' })
    expect(combatRollVerdict('Dropped: still a dodge')).toEqual({ headline: 'Dropped', detail: 'still a dodge' })
    expect(combatRollVerdict('Miss')).toEqual({ headline: 'Miss', detail: '' })
    expect(combatRollVerdict('Success')).toEqual({ headline: 'Success', detail: '' })
  })

  it('gives every viewer the same changing cosmetic previews within a d100', () => {
    const frames = Array.from({ length: 12 }, (_, step) => combatRollPreview('shared-roll', step))
    expect(frames).toEqual(Array.from({ length: 12 }, (_, step) => combatRollPreview('shared-roll', step)))
    expect(new Set(frames).size).toBe(12)
    expect(frames.every((value) => Number(value) >= 1 && Number(value) <= 100)).toBe(true)
  })
})
