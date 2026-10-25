import { describe, expect, it } from 'vitest'
import { LUBEC_STARTING_COUNTERS } from './characterRecord'
import { lubecStressLoweredBy, stepLubecCounter } from './counters'

describe('Lubec counters', () => {
  it('raise and lower one counter by one, leaving the others alone', () => {
    expect(stepLubecCounter(LUBEC_STARTING_COUNTERS, 'stress', 1)).toEqual({ stress: 3, minimumStress: 2, trauma: 0 })
    expect(stepLubecCounter(LUBEC_STARTING_COUNTERS, 'minimumStress', -1)).toEqual({ stress: 2, minimumStress: 1, trauma: 0 })
    expect(stepLubecCounter(LUBEC_STARTING_COUNTERS, 'trauma', 1)).toEqual({ stress: 2, minimumStress: 2, trauma: 1 })
  })

  it('never go below 0', () => {
    expect(stepLubecCounter(LUBEC_STARTING_COUNTERS, 'trauma', -1)).toBeNull()
    expect(stepLubecCounter({ stress: 0, minimumStress: 0, trauma: 0 }, 'stress', -1)).toBeNull()
  })

  it('let Stress go below Minimum Stress and above any maximum by hand', () => {
    expect(stepLubecCounter(LUBEC_STARTING_COUNTERS, 'stress', -1)).toEqual({ stress: 1, minimumStress: 2, trauma: 0 })
    expect(stepLubecCounter({ stress: 20, minimumStress: 2, trauma: 0 }, 'stress', 1)?.stress).toBe(21)
  })

  it('lower Stress for recovery no further than Minimum Stress, and never raise it to that floor', () => {
    expect(lubecStressLoweredBy({ stress: 9, minimumStress: 2, trauma: 0 }, 3)).toBe(6)
    expect(lubecStressLoweredBy({ stress: 4, minimumStress: 2, trauma: 0 }, 7)).toBe(2)
    expect(lubecStressLoweredBy({ stress: 1, minimumStress: 2, trauma: 0 }, 3)).toBe(1)
  })
})
