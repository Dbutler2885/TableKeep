/**
 * The fixed identifiers and limits behind the public "try it now" demo.
 *
 * These values are duplicated, deliberately, in three places that cannot import
 * each other: here (Cloud Functions), `src/features/demo/demoConstants.ts` (the
 * web app), and as literals inside `firestore.rules` / `storage.rules`. Security
 * rules have no import mechanism, so the ids they compare against have to be
 * written out. `src/features/demo/demoConstants.test.ts` reads all four files
 * and fails if any of them drifts.
 *
 * The template ids are pinned strings rather than generated ids for exactly that
 * reason: a rules file can compare a path segment to a literal for free, whereas
 * a `demoTemplate: true` flag on the group document would cost an extra
 * `firestore.get()` on every read of a shared demo image. Pinning them also
 * means the guard rail is legible - you can read `firestore.rules` and see which
 * single group is world-readable, without cross-referencing the database.
 */
/** The one pristine demo campaign every visitor's sandbox is cloned from. */
export const DEMO_TEMPLATE_GROUP_ID = 'demo-template';
export const DEMO_TEMPLATE_CAMPAIGN_ID = 'demo-campaign';
/** Registry of live sandboxes. One document per visitor, keyed by their uid. */
export const DEMO_SESSIONS_COLLECTION = 'demoSessions';
/**
 * How long a sandbox lives.
 *
 * Three hours. A visitor who is actually trying the product spends five to
 * twenty minutes in it, so this is generous enough to survive a coffee, a phone
 * call, or a closed laptop lid and still find the same fog where they left it.
 * It is also short enough that the live population turns over eight times a day
 * at worst, which is what keeps `DEMO_MAX_LIVE_SANDBOXES` a meaningful cap on
 * the bill rather than a cap on concurrency alone.
 */
export const DEMO_SESSION_TTL_MS = 3 * 60 * 60 * 1000;
/**
 * How many sandboxes may exist at once.
 *
 * Fifty. One sandbox is roughly 30 documents and 260 KB of Firestore data (the
 * map documents carry inline fog/vision data URLs), and a browsing visitor costs
 * on the order of 150 document reads. Fifty live sandboxes is therefore ~13 MB
 * at rest, and - with the three-hour turnover above - at most ~400 sandboxes a
 * day, or ~100k Firestore operations, which is single-digit cents. A spike past
 * that gets a "the demo is full" message instead of a bill.
 */
export const DEMO_MAX_LIVE_SANDBOXES = 50;
/**
 * The display name an anonymous visitor is shown under.
 *
 * Anonymous visitors never claim a real handle: `usernames/{handle}` is a global
 * uniqueness index and burning an entry per visitor would be both wasteful and
 * a way to squat names. This is the local stand-in, and it satisfies the app's
 * seven-character handle rule (`src/features/auth/usernameRules.ts`) so nothing
 * downstream has to special-case its shape.
 */
export const DEMO_VISITOR_USERNAME = 'Visitor';
