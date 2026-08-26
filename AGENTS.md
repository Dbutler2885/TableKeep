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
  `tsconfig.app.json` excludes `src/**/*.test.ts` and `src/**/*.emulator.test.ts`, and `tsconfig.node.json` includes only `vite.config.ts`.
  Type errors inside a test file surface when Vitest runs it, not from the typecheck gate.
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
  ESLint 9 looks for `eslint.config.js` and, finding none in `functions/`, silently climbed to the root config instead - so the package's own rules were dead and `npm run lint` there exited 0 without ever applying them.
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
  exported as `GCLOUD_PROJECT` by `firebase emulators:exec`) - not the `projectId`
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
