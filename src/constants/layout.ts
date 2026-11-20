export const MOBILE_BREAKPOINT = 900

/**
 * Width at and below which a campaign's navigation is a top bar that opens it
 * as a drawer, rather than a sidebar beside the page.
 *
 * The sidebar is as wide as its title, about 245px, and a phone held upright
 * (up to about 430px) cannot spare that beside a page. From the smallest
 * tablet up the page keeps 400px or more beside it, and the pages' own mobile
 * layouts (at and below `MOBILE_BREAKPOINT`) are built for that width.
 * Keep it in sync with the `.phone-nav-bar` block in App.css.
 */
export const PHONE_NAV_MAX_WIDTH = 640
export const CHARACTER_INTERMEDIATE_MAX_WIDTH = 1150
export const CHARACTER_MOBILE_PORTRAIT_INTERMEDIATE_MIN_WIDTH = 700
export const CHARACTER_MOBILE_INTERMEDIATE_MIN_WIDTH = 800

/**
 * Width below which the character tabs stop showing the roster and the sheet
 * side by side and switch to one pane at a time.
 *
 * Derived from the point where the second pane starts costing the sheet real
 * width rather than just slack: the roster column is clamp(220px, 26vw, 290px),
 * the grid gap is 1rem and `.monsters-detail-inner` caps the sheet at 920px,
 * which without the campaign sidebar made roughly 1250px the last width at
 * which both could coexist without squeezing the sheet. The sidebar beside the
 * page takes about 145-185px of the window (its width is set by its tab labels),
 * so the breakpoint sits 180px higher. Below it the sheet is the pane worth keeping.
 *
 * The sheet's own reflow bands (`CHARACTER_INTERMEDIATE_MAX_WIDTH` and the
 * `@media` bands in App.css) are keyed to viewport width and assume the sheet
 * has the page to itself - an assumption that only holds because of this
 * breakpoint. Keep it in sync with the `.characters-layout` single-pane block in
 * App.css and the Lubec sheet's desktop blocks (`min-width: 1431px`) in App.css
 * and the Lubec gear stylesheets.
 */
export const CHARACTER_SINGLE_PANE_MAX_WIDTH = 1430
