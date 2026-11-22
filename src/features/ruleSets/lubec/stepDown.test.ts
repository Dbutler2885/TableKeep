import { describe, expect, it } from 'vitest'
import type { LubecEffect } from './effects'
import { stepDownLubecSheet } from './stepDown'

const counters = { stress: 3, minimumStress: 2, trauma: 4 }
const skull: LubecEffect = {
  id: 'skull', name: 'Skull fracture', cause: 'Blunt Force', part: 'Body', steps: [
    { modifiers: [], labels: [], until: 'long-rest', rolls: [{ scope: 'physical', mode: 'disadvantage' }] },
    { modifiers: [], labels: [], until: 'long-rest', rolls: [{ scope: 'physical', mode: 'disadvantage' }] },
    { modifiers: [{ target: 'Body', amount: -20 }], labels: [], until: 'lasting', minimumStress: 4 },
  ],
}
const bleed: LubecEffect = { id: 'bleed', name: 'Skull fracture', cause: 'Blunt Force', steps: [{ modifiers: [], labels: ['+1 Trauma every 30 minutes'], until: 'treated' }] }

describe('Step down', () => {
  it('adds a lasting step\'s Minimum Stress once, as that step begins, and never at an earlier step', () => {
    const first = stepDownLubecSheet({ effects: [skull, bleed], counters }, 'skull')
    expect(first.counters).toBe(counters)
    expect(first.effects[0].steps).toHaveLength(2)
    const second = stepDownLubecSheet(first, 'skull')
    expect(second.counters).toEqual({ stress: 3, minimumStress: 6, trauma: 4 })
    expect(second.effects[0].steps).toEqual([skull.steps[2]])
  })

  it('never repeats Stress or Trauma, and leaves every other card alone', () => {
    const treated = stepDownLubecSheet({ effects: [skull, bleed], counters }, 'bleed')
    expect(treated).toEqual({ effects: [skull], counters })
    const atLasting = { effects: [{ ...skull, steps: [skull.steps[2]] }], counters }
    expect(stepDownLubecSheet(atLasting, 'skull')).toEqual({ effects: [], counters })
  })
})
