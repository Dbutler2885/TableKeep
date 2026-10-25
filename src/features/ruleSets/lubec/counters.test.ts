import { describe, expect, it } from 'vitest'
import { LUBEC_STARTING_COUNTERS } from './characterRecord'
import { stepLubecCounter } from './counters'

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
})
