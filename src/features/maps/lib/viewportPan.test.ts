import { describe, expect, it } from 'vitest'
import { shouldBeginViewportPan, type ViewportPanInput } from './viewportPan'

const base: ViewportPanInput = {
  role: 'gm',
  button: 0,
  shiftKey: false,
  handToolActive: false,
  allowGmInlinePan: false,
  zoom: 1,
}

function input(overrides: Partial<ViewportPanInput>): ViewportPanInput {
  return { ...base, ...overrides }
}

describe('shouldBeginViewportPan', () => {
  describe('GM', () => {
    it('never pans on plain left-drag in Map Run', () => {
      expect(shouldBeginViewportPan(input({ button: 0 }))).toBe(false)
      expect(shouldBeginViewportPan(input({ button: 0, zoom: 4 }))).toBe(false)
    })

    it('pans on middle mouse regardless of zoom', () => {
      expect(shouldBeginViewportPan(input({ button: 1, zoom: 1 }))).toBe(true)
      expect(shouldBeginViewportPan(input({ button: 1, zoom: 3 }))).toBe(true)
    })

    it('pans on shift+left-drag regardless of zoom', () => {
      expect(shouldBeginViewportPan(input({ button: 0, shiftKey: true, zoom: 1 }))).toBe(true)
    })

    it('pans on left-drag while the hand tool is active', () => {
      expect(shouldBeginViewportPan(input({ button: 0, handToolActive: true, zoom: 1 }))).toBe(true)
    })

    it('pans on plain left-drag in Map Preview only when zoomed in', () => {
      expect(shouldBeginViewportPan(input({ allowGmInlinePan: true, zoom: 1 }))).toBe(false)
      expect(shouldBeginViewportPan(input({ allowGmInlinePan: true, zoom: 2 }))).toBe(true)
    })

    it('ignores the right button', () => {
      expect(shouldBeginViewportPan(input({ button: 2, handToolActive: true }))).toBe(false)
    })
  })

  describe('player', () => {
    it('pans on left-drag only when shifted or zoomed in (unchanged)', () => {
      expect(shouldBeginViewportPan(input({ role: 'player', button: 0, zoom: 1 }))).toBe(false)
      expect(shouldBeginViewportPan(input({ role: 'player', button: 0, zoom: 2 }))).toBe(true)
      expect(shouldBeginViewportPan(input({ role: 'player', button: 0, shiftKey: true, zoom: 1 }))).toBe(true)
    })

    it('does not pan on middle mouse', () => {
      expect(shouldBeginViewportPan(input({ role: 'player', button: 1, zoom: 3 }))).toBe(false)
    })

    it('ignores the hand tool flag for players', () => {
      expect(shouldBeginViewportPan(input({ role: 'player', button: 0, handToolActive: true, zoom: 1 }))).toBe(false)
    })
  })
})
