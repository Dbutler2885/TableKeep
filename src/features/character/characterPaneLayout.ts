import { CHARACTER_SINGLE_PANE_MAX_WIDTH } from '../../constants/layout'

export type CharacterPaneView = 'list' | 'detail'

/** Whether the roster and the sheet have to take turns at this viewport width. */
export function isSinglePaneWidth(width: number): boolean {
  return width <= CHARACTER_SINGLE_PANE_MAX_WIDTH
}

/**
 * Which pane to show after a viewport change, or `null` for "leave it alone".
 *
 * Only crossing the single-pane boundary re-targets the view: resizing within a
 * mode must never yank the player off whatever they were reading. Collapsing
 * with a sheet open keeps the sheet, because that is the pane being read and
 * the roster is one tap away on the back control.
 */
export function paneViewAfterResize({
  wasSinglePane,
  isSinglePane,
  hasOpenDetail,
}: {
  wasSinglePane: boolean
  isSinglePane: boolean
  hasOpenDetail: boolean
}): CharacterPaneView | null {
  if (wasSinglePane === isSinglePane) return null
  if (!isSinglePane) return 'list'
  return hasOpenDetail ? 'detail' : 'list'
}
