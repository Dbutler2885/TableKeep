# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

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
