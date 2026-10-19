// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useEncounterTracking } from './useEncounterTracking'

// Math.random values that roll a 1 (an encounter) and a 6 (none) on a d6.
const ROLL_ONE = 0
const ROLL_SIX = 0.99

function render() {
  const view = renderHook(() => useEncounterTracking())
  const move = (...feet: number[]) => {
    for (const step of feet) act(() => view.result.current.onMovementFeet(step))
  }
  const tracker = () => {
    const { distanceTrackerFeet, distanceTrackerMode, distanceTrackerRoll } = view.result.current
    return { feet: distanceTrackerFeet, mode: distanceTrackerMode, roll: distanceTrackerRoll }
  }
  return { view, move, tracker }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('encounter tracking', () => {
  it('starts counting from zero with no notice', () => {
    const { view, tracker } = render()
    expect(tracker()).toEqual({ feet: 0, mode: 'count', roll: null })
    expect(view.result.current.encounterNotice).toBeNull()
  })

  it('ignores movement of a ten-thousandth of a foot or less', () => {
    const { move, tracker } = render()
    move(0.0001, 0, -5)
    expect(tracker()).toEqual({ feet: 0, mode: 'count', roll: null })
    move(0.001)
    expect(tracker().feet).toBeCloseTo(0.001)
  })

  it('counts feet below a turn', () => {
    const { move, tracker } = render()
    move(40, 50)
    expect(tracker()).toEqual({ feet: 90, mode: 'count', roll: null })
  })

  it('warns at the end of the first turn without rolling', () => {
    const random = vi.spyOn(Math, 'random')
    const { view, move, tracker } = render()
    move(100, 25)
    expect(tracker()).toEqual({ feet: 120, mode: 'first', roll: null })
    expect(view.result.current.encounterNotice).toBeNull()
    expect(random).not.toHaveBeenCalled()
  })

  it('holds the full turn on show until ten feet past it, then counts again', () => {
    const { move, tracker } = render()
    move(120, 9)
    expect(tracker()).toEqual({ feet: 120, mode: 'first', roll: null })
    move(1)
    expect(tracker()).toEqual({ feet: 10, mode: 'count', roll: null })
    move(5)
    expect(tracker()).toEqual({ feet: 15, mode: 'count', roll: null })
  })

  it('rolls at the end of the second turn and alerts on a 1', () => {
    vi.spyOn(Math, 'random').mockReturnValue(ROLL_ONE)
    const { view, move, tracker } = render()
    move(120, 120)
    expect(tracker()).toEqual({ feet: 120, mode: 'roll', roll: 1 })
    expect(view.result.current.encounterNotice).toEqual({ checks: 1, hits: 1, rolls: [1] })
  })

  it('rolls without an alert on a 2 or more', () => {
    vi.spyOn(Math, 'random').mockReturnValue(ROLL_SIX)
    const { view, move, tracker } = render()
    move(120, 120)
    expect(tracker()).toEqual({ feet: 120, mode: 'roll', roll: 6 })
    expect(view.result.current.encounterNotice).toBeNull()
  })

  it('holds a roll on show until ten feet past it, then counts again', () => {
    vi.spyOn(Math, 'random').mockReturnValue(ROLL_SIX)
    const { move, tracker } = render()
    move(240, 9.5)
    expect(tracker()).toEqual({ feet: 120, mode: 'roll', roll: 6 })
    move(0.5)
    expect(tracker()).toEqual({ feet: 10, mode: 'count', roll: null })
  })

  it('rolls once per two turns in a single long move and reports every roll', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(ROLL_ONE)
      .mockReturnValueOnce(ROLL_SIX)
    const { view, move, tracker } = render()
    move(485)
    expect(tracker()).toEqual({ feet: 120, mode: 'roll', roll: 6 })
    expect(view.result.current.encounterNotice).toEqual({ checks: 2, hits: 1, rolls: [1, 6] })
  })

  it('shows the first-turn warning, not the alert, when a long move ends on a first turn', () => {
    vi.spyOn(Math, 'random').mockReturnValue(ROLL_ONE)
    const { view, move, tracker } = render()
    move(360)
    expect(tracker()).toEqual({ feet: 120, mode: 'first', roll: null })
    expect(view.result.current.encounterNotice).toBeNull()
  })

  it('carries the turn stage across moves', () => {
    vi.spyOn(Math, 'random').mockReturnValue(ROLL_ONE)
    const { view, move, tracker } = render()
    move(130)
    expect(tracker().mode).toBe('first')
    move(110)
    expect(tracker()).toEqual({ feet: 120, mode: 'roll', roll: 1 })
    expect(view.result.current.encounterNotice).toEqual({ checks: 1, hits: 1, rolls: [1] })
    move(120)
    expect(tracker()).toEqual({ feet: 120, mode: 'first', roll: null })
    expect(view.result.current.encounterNotice).toEqual({ checks: 1, hits: 1, rolls: [1] })
  })

  it('keeps an earlier alert when a later roll misses', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(ROLL_ONE)
      .mockReturnValueOnce(ROLL_SIX)
    const { view, move } = render()
    move(240)
    move(240)
    expect(view.result.current.encounterNotice).toEqual({ checks: 1, hits: 1, rolls: [1] })
  })

  it('dismisses the alert and leaves the tracker as it is', () => {
    vi.spyOn(Math, 'random').mockReturnValue(ROLL_ONE)
    const { view, move, tracker } = render()
    move(240)
    act(() => view.result.current.dismissEncounterNotice())
    expect(view.result.current.encounterNotice).toBeNull()
    expect(tracker()).toEqual({ feet: 120, mode: 'roll', roll: 1 })
  })

  it('resets the tracker, the turn stage and the alert', () => {
    vi.spyOn(Math, 'random').mockReturnValue(ROLL_ONE)
    const { view, move, tracker } = render()
    move(370)
    act(() => view.result.current.resetDistanceTracker())
    expect(tracker()).toEqual({ feet: 0, mode: 'count', roll: null })
    expect(view.result.current.encounterNotice).toBeNull()
    move(120)
    expect(tracker()).toEqual({ feet: 120, mode: 'first', roll: null })
    move(10)
    expect(tracker()).toEqual({ feet: 10, mode: 'count', roll: null })
  })

  it('keeps its callbacks stable across renders', () => {
    const { view, move } = render()
    const { onMovementFeet, resetDistanceTracker } = view.result.current
    move(50)
    expect(view.result.current.onMovementFeet).toBe(onMovementFeet)
    expect(view.result.current.resetDistanceTracker).toBe(resetDistanceTracker)
  })
})
