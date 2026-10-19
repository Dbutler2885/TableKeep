import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  IDLE_TRACKER,
  START_CYCLE,
  advanceEncounterCycle,
  encounterNoticeFor,
  rollD6,
  trackerAfterStep,
  type EncounterStep,
} from './encounterCycle'

const rollsOf = (...values: number[]) => {
  const queue = [...values]
  return () => queue.shift() ?? 6
}

const step = (lastEvent: EncounterStep['lastEvent'], rolls: number[] = [], feet = 0): EncounterStep => ({
  cycle: { feet, turnStage: 0 },
  rolls,
  lastEvent,
})

describe('advancing the encounter cycle', () => {
  it('only counts feet within a turn', () => {
    const roll = vi.fn(rollsOf())
    expect(advanceEncounterCycle(START_CYCLE, 119.5, roll)).toEqual({
      cycle: { feet: 119.5, turnStage: 0 },
      rolls: [],
      lastEvent: null,
    })
    expect(roll).not.toHaveBeenCalled()
  })

  it('ends the first turn in a warning', () => {
    expect(advanceEncounterCycle({ feet: 100, turnStage: 0 }, 30, rollsOf())).toEqual({
      cycle: { feet: 10, turnStage: 1 },
      rolls: [],
      lastEvent: 'first',
    })
  })

  it('ends the second turn in a roll', () => {
    expect(advanceEncounterCycle({ feet: 100, turnStage: 1 }, 20, rollsOf(3))).toEqual({
      cycle: { feet: 0, turnStage: 0 },
      rolls: [3],
      lastEvent: 'roll',
    })
  })

  it('crosses every turn end in a long movement', () => {
    expect(advanceEncounterCycle(START_CYCLE, 485, rollsOf(1, 4))).toEqual({
      cycle: { feet: 5, turnStage: 0 },
      rolls: [1, 4],
      lastEvent: 'roll',
    })
    expect(advanceEncounterCycle(START_CYCLE, 360, rollsOf(2))).toEqual({
      cycle: { feet: 0, turnStage: 1 },
      rolls: [2],
      lastEvent: 'first',
    })
  })
})

describe('the distance tracker after a movement', () => {
  it('shows a full turn and the last roll after a roll', () => {
    expect(trackerAfterStep(step('roll', [1, 5], 4), IDLE_TRACKER)).toEqual({ feet: 120, mode: 'roll', roll: 5 })
  })

  it('shows a full turn and the warning after the first turn', () => {
    expect(trackerAfterStep(step('first', [2], 4), { feet: 120, mode: 'roll', roll: 2 })).toEqual({ feet: 120, mode: 'first', roll: null })
  })

  it.each([
    [{ feet: 120, mode: 'roll', roll: 4 } as const, 9.9, { feet: 120, mode: 'roll', roll: 4 }],
    [{ feet: 120, mode: 'first', roll: null } as const, 0, { feet: 120, mode: 'first', roll: null }],
    [{ feet: 120, mode: 'roll', roll: 4 } as const, 10, { feet: 10, mode: 'count', roll: null }],
    [{ feet: 120, mode: 'first', roll: null } as const, 12, { feet: 12, mode: 'count', roll: null }],
    [{ feet: 3, mode: 'count', roll: null } as const, 5, { feet: 5, mode: 'count', roll: null }],
  ])('after showing %j, %s feet into the turn shows %j', (shown, feet, expected) => {
    expect(trackerAfterStep(step(null, [], feet), shown)).toEqual(expected)
  })
})

describe('the encounter alert', () => {
  it('reports every roll when one finds an encounter', () => {
    expect(encounterNoticeFor(step('roll', [6, 1]))).toEqual({ checks: 2, hits: 1, rolls: [6, 1] })
  })

  it('stays quiet when no roll finds one', () => {
    expect(encounterNoticeFor(step('roll', [2, 6]))).toBeNull()
  })

  it.each(['first', null] as const)('stays quiet when the movement ends on %s', (lastEvent) => {
    expect(encounterNoticeFor(step(lastEvent, [1]))).toBeNull()
  })
})

describe('the d6', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    [0, 1],
    [0.5, 4],
    [0.9999, 6],
  ])('turns %s into %s', (random, face) => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(random)
    expect(rollD6()).toBe(face)
  })
})
