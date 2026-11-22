import { describe, expect, it } from 'vitest'
import type { LubecEffect, LubecEffectStep, LubecRestriction } from './effects'
import { LUBEC_FREE_MOVEMENT, lubecMovementLimits } from './movementLimits'

const step = (restrictions: LubecRestriction[], extra: Partial<LubecEffectStep> = {}): LubecEffectStep => ({ modifiers: [], labels: [], until: 'long-rest', restrictions, ...extra })
const card = (name: string, steps: LubecEffectStep[], extra: Partial<LubecEffect> = {}): LubecEffect => ({ id: name, name, cause: '', steps, ...extra })

describe('the Movement choices the active cards forbid', () => {
  it('takes Run for cannot-run, Evasive for no Evasive Movement, and both for crawl only, naming the card', () => {
    expect(lubecMovementLimits([card('Knee', [step([{ kind: 'no-run' }])])])).toEqual({ run: 'Cannot run (Knee)', evade: null })
    expect(lubecMovementLimits([card('Ankle', [step([{ kind: 'no-evasive' }])], { part: 'Ankle sprain' })])).toEqual({ run: null, evade: 'No Evasive Movement (Ankle)' })
    expect(lubecMovementLimits([card('Leg', [step([{ kind: 'crawl-only' }])])])).toEqual({ run: 'Crawl only without help (Leg)', evade: 'Crawl only without help (Leg)' })
  })

  it('never reads words, a later step, a converted card, Speed at Disadvantage or a speech restriction', () => {
    const words = card('Hip', [{ modifiers: [], labels: ['Half Movement. No Evasive Movement.'] }])
    const later = card('Later', [step([]), step([{ kind: 'no-run' }])])
    const converted = card('Converted', [step([{ kind: 'no-run' }])], { afterCombat: { fightId: 'f' } })
    const slow = card('Slow', [step([], { rolls: [{ scope: 'speed', mode: 'disadvantage' }] })])
    const speech = card('Jaw', [step([{ kind: 'speech', words: 'Speech slurred' }])])
    expect(lubecMovementLimits([words, later, converted, slow, speech])).toEqual(LUBEC_FREE_MOVEMENT)
  })
})
