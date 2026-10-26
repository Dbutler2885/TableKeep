/** The Strength prompt's words (spec 5.5 and 12.2), pinned as given. */
import { describe, expect, it } from 'vitest'
import {
  LUBEC_STRENGTH_EYEBROW,
  lubecStrengthPromptText,
  lubecStrengthText,
  lubecStrengthTitle,
  lubecTooHeavyDropped,
  lubecTooHeavyToAdd,
  lubecTooHeavyToMove,
} from './strengthLabels'

const anvil = { name: 'Small anvil', weight: 'heavy' as const }
const anchor = { name: 'Mushroom anchor', weight: 'extra' as const }

describe('the Strength prompt\'s words', () => {
  it('names the check and the thing', () => {
    expect(LUBEC_STRENGTH_EYEBROW).toBe('Strength check')
    expect(lubecStrengthTitle(anvil)).toBe('Small anvil is heavy')
    expect(lubecStrengthTitle(anchor)).toBe('Mushroom anchor is extra heavy')
  })

  it('says what a heavy thing does, passed or failed, with the Stress a failure adds', () => {
    expect(lubecStrengthPromptText(anvil, 29, 1)).toBe('Roll Strength (29). Passed: no penalty. Failed: Speed −20 while you carry it, and +1 Stress.')
    expect(lubecStrengthPromptText(anvil, 29, 2)).toBe('Roll Strength (29). Passed: no penalty. Failed: Speed −20 while you carry it, and +2 Stress.')
  })

  it('says what an extra heavy thing does, passed or failed', () => {
    expect(lubecStrengthPromptText(anchor, 41, 1)).toBe("Roll Strength (41). Passed: you carry it, Speed −20 the whole time. Failed: you can't carry it, and +1 Stress.")
  })

  it('leaves room for the target, which a hole shows as the missing mark', () => {
    expect(lubecStrengthText(anvil, 1)[0]).toBe('Roll Strength (')
  })

  it('says why an extra heavy thing that failed stays, is not added, or is dropped', () => {
    expect(lubecTooHeavyToMove(anchor)).toBe('Too heavy. Mushroom anchor stays where it is.')
    expect(lubecTooHeavyToAdd(anchor)).toBe("Strength failed: you can't carry Mushroom anchor. Pick a carrier.")
    expect(lubecTooHeavyDropped(anchor)).toBe('Too heavy to carry. Mushroom anchor is dropped where you are.')
  })
})
