import type { Role } from '../../../types/app'

export type ViewportPanInput = {
  role: Role | null
  // Raw DOM `MouseEvent.button`: 0 = left, 1 = middle, 2 = right.
  button: number
  shiftKey: boolean
  // GM hand tool active (explicit pan tool).
  handToolActive: boolean
  // GM Map Preview allows plain left-drag panning.
  allowGmInlinePan: boolean
  // Current viewport zoom; plain pans are only meaningful when zoomed in.
  zoom: number
}

// Decides whether a mousedown should begin a viewport pan/drag.
//
// Player behavior is preserved exactly (left-drag pans when shifted or zoomed in).
// GM additions are additive: middle mouse, the hand tool, and shift+left are
// deliberate pan gestures that always pan; plain left-drag never pans in Map Run,
// and only pans in Map Preview (`allowGmInlinePan`) when zoomed in.
export function shouldBeginViewportPan(input: ViewportPanInput): boolean {
  const { role, button, shiftKey, handToolActive, allowGmInlinePan, zoom } = input
  const isLeft = button === 0
  const isMiddle = button === 1

  if (role === 'gm') {
    if (isMiddle) return true
    if (!isLeft) return false
    if (shiftKey) return true
    if (handToolActive) return true
    if (allowGmInlinePan) return zoom > 1
    return false
  }

  // Player (and unauthenticated) viewport: unchanged.
  if (!isLeft) return false
  return shiftKey || zoom > 1
}
