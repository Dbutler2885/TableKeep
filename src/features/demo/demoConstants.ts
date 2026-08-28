/**
 * The web app's copy of the demo sandbox constants.
 *
 * These same values live in `functions/src/demoConstants.ts` and as literals
 * inside `firestore.rules` and `storage.rules`. Neither a Cloud Functions module
 * nor a rules file can be imported from the browser bundle, so the values are
 * written out in each place and `demoConstants.test.ts` reads all four files and
 * fails if any of them drifts.
 */

/** The one pristine demo campaign every visitor's sandbox is cloned from. */
export const DEMO_TEMPLATE_GROUP_ID = 'demo-template'
export const DEMO_TEMPLATE_CAMPAIGN_ID = 'demo-campaign'

/** How long a sandbox lives. See `functions/src/demoConstants.ts` for the reasoning. */
export const DEMO_SESSION_TTL_MS = 3 * 60 * 60 * 1000

/**
 * The name an anonymous visitor is shown under.
 *
 * Anonymous visitors never claim a handle out of the global `usernames` index,
 * so this is a local stand-in. It is seven characters, which is what the app's
 * handle rule expects, so nothing downstream has to special-case it.
 */
export const DEMO_VISITOR_USERNAME = 'Visitor'

/** Where the "try it now" link on the sign-in screen points. */
export const demoEntryPath = '/demo'
