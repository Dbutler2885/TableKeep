import { describe, expect, it } from 'vitest'
import { LUBEC_SHEET_FULL_WIDTH, lubecFitWidth } from './lubecFitWidth'

describe('lubecFitWidth', () => {
  it('keeps the sheet full size when its pane has room for it', () => {
    expect(lubecFitWidth(LUBEC_SHEET_FULL_WIDTH)).toBe(1)
    expect(lubecFitWidth(1600)).toBe(1)
  })

  it('scales a narrower pane down to the 5% step that still fits', () => {
    expect(lubecFitWidth(LUBEC_SHEET_FULL_WIDTH - 1)).toBe(0.95)
    expect(lubecFitWidth(939)).toBe(0.85)
    expect(lubecFitWidth(864)).toBe(0.8)
  })

  it('never makes the sheet wider than its pane', () => {
    for (let width = 500; width <= 1200; width += 7) {
      expect(LUBEC_SHEET_FULL_WIDTH * lubecFitWidth(width)).toBeLessThanOrEqual(width)
    }
  })

  it('leaves a pane that has not been laid out yet at full size', () => {
    expect(lubecFitWidth(0)).toBe(1)
    expect(lubecFitWidth(Number.NaN)).toBe(1)
  })
})
