# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Continuous integration

`.github/workflows/ci.yml` gates every pull request and every push to `main`.
It runs seven parallel jobs, each invoking a real npm script: root `lint`, `typecheck`, `test`, `build`, `test:emulator`, `test:browser-smoke`, and `lint` + `build` inside `functions/`.
The workflow is read-only (`permissions: contents: read`), uses no secrets, and never deploys.

- **Web app jobs run on Node 24; the Cloud Functions job runs on Node 20.**
  The split is deliberate: 24 matches the README prerequisites, and 20 matches `engines.node` in `functions/package.json`, which is the deployed function runtime.
  Do not collapse them into one version or widen either into a matrix.
- **`npm run typecheck` is `tsc -b`, and it does not cover test files.**
  `tsconfig.app.json` excludes `src/**/*.test.ts`, `src/**/*.test.tsx` and `src/**/*.emulator.test.ts`, and `tsconfig.node.json` includes only `vite.config.ts`.
  Type errors inside a test file appear when Vitest runs it, not from the typecheck gate.
- **The emulator job needs JDK 21 and caches `~/.cache/firebase/emulators`.**
  The cache key is the root `package-lock.json` hash, because the emulator jar versions are decided by the pinned firebase-tools release.
- **The browser-smoke job uses Puppeteer against only local services.**
  It starts Vite inside `firebase emulators:exec`, creates isolated Auth emulator users, completes email verification through the emulator OOB API, claims a handle, and creates a group at desktop and mobile viewports.
  It fails on page errors and console errors, and uploads review-only screenshots even when the smoke command fails.

## Lint configuration and its recorded debt

There are two ESLint flat configs: `eslint.config.js` for the web app and `functions/eslint.config.js` for the Cloud Functions package.

- **The root config ignores `functions/`.**
  Without that ignore, `eslint .` from the repo root walks into the Cloud Functions package and lints its Node entrypoint (and its compiled `lib/` output) with the browser/React rule set.
- **`functions/` must keep a flat config, not an `.eslintrc.cjs`.**
  ESLint 9 looks for `eslint.config.js` and, finding none in `functions/`, climbed to the root config instead without saying so.
  The package's own rules were dead, and `npm run lint` there exited 0 without ever applying them.
  The `--ext .ts` flag was dropped from the script at the same time; flat config selects files through its own `files` patterns.
- **`eslint.config.js` ends with four `react-hooks-v7-debt/*` blocks.**
  `eslint-plugin-react-hooks` v7 promoted `set-state-in-effect`, `refs`, `immutability`, and `purity` into its recommended set, and 21 files that predate those rules still violate them.
  Those blocks name the exact files and downgrade only those four rules there, so every other file is still held to the full error-level rule set and no new violations can land outside the list.
  Shrink the lists as the hooks are reworked; never add a file to them.

## Firebase emulator tests

`npm run test:emulator` runs every `src/**/*.emulator.test.ts` against a live
Firestore + Storage emulator, with the repo's real `firestore.rules` /
`storage.rules` loaded.

- **Java 21 or newer is required.** firebase-tools 15 refuses to start the
  emulators on anything older, with a message that does not mention which JDK it
  found. On macOS: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="$JAVA_HOME/bin:$PATH" npm run test:emulator`.
- **Storage Rules suites must use the emulator's own project id.** `storage.rules`
  reaches into Firestore via `firestore.get()`, and the Storage emulator resolves
  those lookups against the project it was started with (`.firebaserc`'s default,
  exported as `GCLOUD_PROJECT` by `firebase emulators:exec`), not the `projectId`
  passed to `initializeTestEnvironment`. Under a mismatched id every
  `firestore.get()`-gated rule reads an empty database and denies, which looks
  exactly like a rules bug. Use `process.env.GCLOUD_PROJECT ?? 'homeboyshouse-dev'`.
- **Emulator suites run serially** (`fileParallelism: false` in
  `vitest.emulator.config.ts`). They share one emulator instance, and the storage
  suites now share one project id, so in parallel one suite's `cleanup()` unloads
  the ruleset another is still using and one suite's `clearFirestore()` wipes
  another's seed.
- Both Vitest configs inject placeholder `VITE_FIREBASE_*` values from
  `vitest.firebaseEnv.ts`. Tests never touch a real project, but some test modules
  transitively import `src/firebase`, which builds the SDK singleton at import
  time and throws `auth/invalid-api-key` without a config. (The underlying
  coupling is real: `inventoryOverflow.ts` imports `toFirestoreItem` from the
  `useItems` hook module, which pulls in the singleton.)
- **One suite runs a real Cloud Function against the emulator.**
  `acceptPendingTransfer.emulator.test.ts` imports `functions/src/index.ts` and invokes the callable through its `run()` entrypoint.
  The admin SDK inside the function finds the emulator through `FIRESTORE_EMULATOR_HOST`, which `firebase emulators:exec` exports, and resolves its project from `GCLOUD_PROJECT` - so that suite must use `process.env.GCLOUD_PROJECT` as its `initializeTestEnvironment` project id for the same reason the Storage suites do, or the function and the client would read two different namespaces inside one emulator.
  Because that import crosses into the Cloud Functions package, the `emulator-tests` CI job installs `functions/` dependencies too (`npm ci --prefix functions`); the web app's own `node_modules` has neither firebase-admin nor firebase-functions.
  `functions/src/index.ts` calls `initializeApp()` at import time, so exactly one emulator suite may import it.

## The group-scoped data model in Cloud Functions

Every campaign document lives under `groups/{groupId}/campaigns/{campaignId}`.
Nothing in the app writes to the pre-reorganisation flat `campaigns/{campaignId}` tree any more, and no campaign can be created there: `useGroupAccess` only ever enumerates `groups/{groupId}/campaigns`.
The flat Firestore documents that survive exist solely so `storage.rules`' `isCampaignMember(campaignId)` keeps resolving for the legacy campaign's un-migrated art (see the migration section below); treat them as read-gates, not as a live schema.

- **A Cloud Function must never hand-build a campaign path.**
  `functions/src/firestorePaths.ts` holds the segments and `campaignRef` / `groupMemberRef` in `index.ts` are the only builders.
  `acceptPendingTransfer` shipped for a while resolving `campaigns/{campaignId}/...` while the client wrote to the group-scoped tree, so accepting an item transfer failed for every player in every campaign and no test noticed, because the two sides were only ever tested apart.
- **Membership is held by the group, not the campaign.**
  The campaign-level `members` collection is gone from the nested model; `campaigns/{campaignId}/userState/{uid}` replaced it and carries UI scratch only.
  Server-side authorization must mirror `isGroupMember` / `isCampaignGm` in `firestore.rules`: an active `groups/{groupId}/members/{uid}`, with GM meaning that member's `role == 'admin'` or the campaign document's `gmUserId`.
  Note the role vocabulary differs between the two trees - group members are `admin`/`member`, the retired campaign members were `gm`/`player`.
- **A callable that touches a campaign needs `groupId` in its payload.**
  A campaign id alone cannot be resolved to its group without a collection-group scan, and the campaign document that would carry the answer is itself only reachable through the group.
  Passing it is safe: the function still verifies membership against `groups/{groupId}/members/{uid}`, and a mismatched pair simply resolves to a document that does not exist.

## Legacy campaign migration (two phases, `scripts/`)

The one real pre-reorg campaign was migrated from the flat schema
(`campaigns/237sg5HxL39dgZbZg9pQ`, "My OSE Module") into the nested one
(`groups/nCNPq08BwD5dR7wAiONG/campaigns/S9OsX5rbdBthdhh49LIW`, "The Black Wyrm of
Brandonsford"). Both scripts are dry-run by default and need `--apply` to write.

- `migrate_legacy_campaign.py` (phase 1, **applied**) copies Firestore documents.
  It never touches Cloud Storage, so it leaves every `portraitPath` /
  `tokenIcon.customImagePath` / `imagePath` / `tokenImagePath` pointing into the
  old flat storage tree.
- `migrate_legacy_campaign_storage.py` (phase 2) copies the referenced Storage
  objects into the group-scoped tree and rewrites those pointers. Unit tests for
  its pure planning logic: `python3 scripts/migrate_legacy_campaign_storage_test.py`.
  Post-state rules verification:
  `src/features/character/portraitMigration.emulator.test.ts`.

**The legacy data is not safe to prune until phase 2 has been applied.**
`storage.rules` gates the flat `campaigns/{campaignId}/...` tree on
`isCampaignMember(campaignId)`, so migrated portraits and token icons resolve
today only because the superseded `campaigns/237sg5HxL39dgZbZg9pQ/members/*`
documents still exist. Deleting them takes every migrated character's existing
art dark for reads, GM included.

Both storage trees use the same suffix, so the mapping is a prefix swap:
`campaigns/{legacyCampaignId}/REST` -> `groups/{groupId}/campaigns/{campaignId}/REST`
(see `uploadEntityImage` in `src/features/common/mediaStorage.ts` and the map/
token-asset path builders in `src/features/maps/hooks/`).

## Demo harness (`scripts/demo/`, `emulator-data/`)

A reviewer can see a real, populated game without a Firebase project or any credentials.
The mechanism is a committed Firebase emulator snapshot in `emulator-data/`, plus two commands that boot the emulators and the Vite dev server together and differ in one way that matters.

- **`npm run demo` (visitor) never writes `emulator-data/`.**
  It passes `--import` and no export flag at all, so a visitor gets the campaign read-write in their own emulator while the snapshot in their checkout stays byte-for-byte pristine.
  This is the whole reason it is not `npm run emulators:import`.
  That script passes `--export-on-exit`, which would let a visitor's session overwrite the committed snapshot without anyone noticing.
- **`npm run demo:author` is the only command that overwrites the snapshot**, via `--export-on-exit`.
  `npm run demo:save` exports a running demo emulator without quitting it.
  Both commands print a startup banner that states which of the two behaviours is in effect; keep that banner accurate if the flags change.
- **`scripts/demo/run.mjs` spawns both children `detached`.**
  In author mode an interactive Ctrl+C would otherwise reach the Firebase CLI through the terminal's process group at the same time as the orchestrator's own handler, and a second signal arriving mid-export abandons the export.
  The orchestrator owns the shutdown order instead: SIGTERM to Vite, then a single SIGINT to the Firebase CLI, which is the signal its export-on-exit hook runs on.
- **The demo accounts have pinned uids** (`demo-gm-uid`, `demo-player-uid`, `demo-player-2-uid` through `demo-player-4-uid`, in `scripts/demo/config.mjs`).
  The snapshot stores campaign ownership, group membership, and character ownership by uid, so a re-seed on a visitor's machine has to land on the same uids or the imported campaign would belong to nobody.
  Usernames must be exactly seven characters (`src/features/auth/usernameRules.ts`).
- **More accounts are seeded than are offered as a seat.**
  The campaign's characters belong one apiece to the four player accounts, because a player only ever sees characters that are not GM-owned (`src/features/character/useCharacters.ts`), so a single shared player account would land on an empty list.
  Only the two accounts carrying a `seat` in `demoAccounts` read their credentials from `.env.demo`; the party members are written directly in `scripts/demo/config.mjs`.
  That split is the guard rail: `.env.demo` holds exactly the logins the sign-in screen offers, so a new account cannot grow the picker by being added to it.
  `demoSeatAccounts` is what the startup banner prints, and `scripts/demo/config.test.mjs` pins both halves.
- **Seeding goes through the emulator's admin endpoints, not a browser.**
  `POST {auth}/identitytoolkit.googleapis.com/v1/projects/{projectId}/accounts` with `Authorization: Bearer owner` accepts `localId` and `emailVerified`, which the client `accounts:signUp` endpoint does not; `accounts:update` on the same prefix repairs an existing account.
  Firestore writes use `PATCH {firestore}/v1/projects/{projectId}/databases/(default)/documents/{path}?updateMask.fieldPaths=...` with the same owner token, which bypasses `firestore.rules`.
  Every write in `scripts/demo/seed-accounts.mjs` is idempotent, so it can run against a freshly imported snapshot without disturbing it.
- **`.env.demo` is committed and is injected into the dev server's environment, not loaded as a Vite mode.**
  Vite's `loadEnv` lets `process.env` win over every `.env` file, so injecting beats any real `.env.local` on the machine as well as any exported `VITE_*` shell variable.
  `npm run dev` and `npm run build` never read `.env.demo`, so the normal config path is unchanged.
- **The demo harness does not start the functions emulator**, only `auth,firestore,storage`.
  `acceptPendingTransfer` (`src/features/transfers/usePendingTransfers.ts`) is the one callable in the app, so accepting an item transfer does not work in the demo.
- **In emulator mode the sign-in screen swaps the Google button for two seat buttons.**
  Against the auth emulator a Google popup only reaches the emulator's own stub page, and that page's "Add new account" mints a random uid, which matches nothing in a snapshot that stores ownership by uid.
  `src/features/auth/demoSeats.ts` resolves the seats from `VITE_DEMO_*`, so `.env.demo` is the single definition of the two logins: `scripts/demo/config.mjs` reads it to seed them and `run.mjs` injects it into the dev server for the app to offer them.
  A seat is offered only when the emulator flag is on *and* both credentials are present.
  That is why `scripts/browser-smoke.mjs`, which runs with emulators on but no `VITE_DEMO_*`, still gets the ordinary Google-plus-form screen it asserts against.
  A production build never loads `.env.demo`, so Vite folds those references to `undefined` and no demo login reaches the bundle.
- **`emulator-data/` is committed and budgeted.**
  It carries every Storage object the demo uses, the map images and the portraits, and git keeps every version of each one forever.
  The budget is 25 MB total and 1 MB per file, enforced by `npm run demo:size` (`scripts/demo/check-snapshot-size.mjs`); run it before committing a re-export.
  Shrink source images before uploading them in the app rather than trimming the snapshot afterwards.
  A large PNG that lands in one commit is permanent weight even if a later commit removes it.

## Component tests

`npm test` runs in the Node environment by default (`vite.config.ts`), because nearly every suite is pure logic.
The few component suites are `.test.tsx` and opt into a DOM per file with a `// @vitest-environment jsdom` docblock, so the jsdom cost stays off the rest of the run.

- **`tsconfig.app.json` excludes `.test.tsx` as well as `.test.ts`**, so `npm run typecheck` does not cover component tests either.
  Their type errors appear when Vitest runs them.
- **`@testing-library/react` auto-cleanup does not fire here.**
  It installs itself only when `afterEach` is a global, and neither Vitest config enables `globals`.
  Call `cleanup` from an explicit `afterEach`.

## Documentation

`README.md` is the only document this project ships.
The former `docs/` folder (PRD, architecture, schema, IA, component/UX specs, milestones) is gone on purpose.
It had drifted behind the group/campaign model, and the code is the authority.
Do not reintroduce a `docs/` tree.
Put durable engineering knowledge here in `AGENTS.md`, and put anything a reader needs in the README.

- **README media lives in `.github/media/` and is committed.**
  It is outside `src/` and `public/` on purpose, so it never reaches the production bundle.
  Reference it from the README with repo-relative paths.
- **Motion on the rendered page is carried by animated WebP, embedded inline with an `<img>` tag.**
  A repo-relative `.mp4` does not reliably play inline in a README, because GitHub reserves its inline player for files uploaded through its own attachment flow.
  So an `.mp4` is only ever a plain "full-quality recording" link underneath the animation, never the thing the page depends on.
  This only works because the clips are short: the two map clips are 33s and 14s and cost about 2.4 MB each as animated WebP.
  Recut a long recording rather than animating it.
  A minute-plus clip would be enormous, and git keeps every version of it forever.
- **The session transcription pipeline is external.**
  This repo owns only the receiving endpoints in `functions/`: `postSessionSummary` and `getCampaignNpcs`.
  The watcher, VAD, on-device speech model, and recap generation run as a separate macOS service on the GM's machine and are not in this codebase.

## Maps feature decomposition

`src/features/maps/MapsTab.tsx` is the composition root, while GM controls, pane navigation, scene-NPC editing, vision reveal, and pure geometry live under the feature's `components/`, `hooks/`, and `lib/` directories.

- **Vision surface flood fill is intentionally 8-connected.**
  Diagonally touching blocker paint belongs to one reveal region, and `visionBlockers.test.ts` pins that geometry.
- **Flood-fill pixels are marked visited before blocker classification.**
  This ensures boundary pixels are classified at most once during interactive token movement.
- **The vision reveal scratch mask is region-sized.**
  It is distinct from `useFogTools`' full-canvas reveal mask, and its offset `drawImage` call depends on that clipped-region sizing.
- **Fog fallback stamping is nondeterministic.**
  `useFogTools` uses randomized spray dots, so regression tests assert deterministic blocker, raycast, throttle, and structural behavior instead of exact fog pixels.
- **Scene-NPC document and media paths must use the builders in `lib/sceneNpcRecord.ts` and `features/common/mediaStorage.ts`.**
  The maps-scoped emulator suite verifies those production builders against the real Firestore and Storage rules.
