export const MOBILE_BREAKPOINT = 900
export const CHARACTER_INTERMEDIATE_MAX_WIDTH = 1150
export const CHARACTER_MOBILE_PORTRAIT_INTERMEDIATE_MIN_WIDTH = 700
export const CHARACTER_MOBILE_INTERMEDIATE_MIN_WIDTH = 800

/**
 * Width below which the character tabs stop showing the roster and the sheet
 * side by side and switch to one pane at a time.
 *
 * Derived from the point where the second pane starts costing the sheet real
 * width rather than just slack: the roster column is clamp(220px, 26vw, 290px),
 * the grid gap is 1rem and `.monsters-detail-inner` caps the sheet at 920px, so
 * roughly 1250px is the last width at which both can coexist without squeezing
 * the sheet. Below that the sheet is the pane worth keeping.
 *
 * The sheet's own reflow bands (`CHARACTER_INTERMEDIATE_MAX_WIDTH` and the
 * `@media` bands in App.css) are keyed to viewport width and assume the sheet
 * owns that width - an assumption that only holds because of this breakpoint.
 * Keep it in sync with the `.characters-layout` single-pane block in App.css.
 */
export const CHARACTER_SINGLE_PANE_MAX_WIDTH = 1250
