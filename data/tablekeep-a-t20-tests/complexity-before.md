# Ticket 20 characterization baseline

Measured before production changes, at base commit `feb2585eac7dc928bce027c8c0620b0feeb531a7`.
This task changes tests only, plus this requested inventory.
Ticket 20 and Spec A sections 5.9, 5.11-5.13 and A5 define the extraction boundary.
VtM subscription, reading, deferred saves, media resolution, current-character state and direct deletion move in ticket 20.
OSE, grants, approvals and the transfer callable are compatibility safety nets requested by the brief; ticket 20 does not itself require changing those writers.

## Measurement

Each CC value comes from `/Users/davidb/.firstmate-crapper/bin/crapper --no-coverage`.
The tool was invoked with absolute `--source-root` paths and an external `--root` so its `.metrics/crap.edn` stayed outside this checkout.
Raw reports and unchanged extracted function expressions are in `/Users/davidb/Documents/Code/firstmate/data/tablekeep-a-t20-tests/`.
The tool reports nested function expressions inside their enclosing hook or component, and does not enumerate the `onCall` callback.
For individually named nested writers below, TypeScript AST ranges copied the original function expressions verbatim into a scratch TypeScript module, then the same tool measured them as top-level expressions.
Those individual scores are not additive with the enclosing hook or component scores.
`acceptPendingTransfer` denotes the unchanged `onCall` handler expression, not Firebase's wrapper.
No production source was rewritten to obtain these scores.
Coverage is N/A because this repository has no coverage script, installed coverage provider or existing coverage report, and `--no-coverage` intentionally does not collect it.
N/A does not mean zero coverage.

| Function | File | Cyclomatic complexity | Current measured coverage |
| --- | --- | ---: | --- |
| `emptyVtmCharacterSaves` | `src/features/character/vtmCharacterWrites.ts` | 1 | N/A |
| `vtmCampaignScope` | `src/features/character/vtmCharacterWrites.ts` | 3 | N/A |
| `isVtmCharacterSaveOutstanding` | `src/features/character/vtmCharacterWrites.ts` | 2 | N/A |
| `sendVtmCharacterSavesNow` | `src/features/character/vtmCharacterWrites.ts` | 1 | N/A |
| `vtmCharacterSaveFields` | `src/features/character/vtmCharacterWrites.ts` | 1 | N/A |
| `newVtmCharacterFields` | `src/features/character/vtmCharacterWrites.ts` | 2 | N/A |
| `createVtmCharacterDoc` | `src/features/character/vtmCharacterWrites.ts` | 1 | N/A |
| `deleteVtmCharacterDoc` | `src/features/character/vtmCharacterWrites.ts` | 1 | N/A |
| `saveCurrentVtmCharacter` | `src/features/character/vtmCharacterWrites.ts` | 1 | N/A |
| `sendVtmCharacterSave` | `src/features/character/vtmCharacterWrites.ts` | 2 | N/A |
| `scheduleVtmCharacterSave` | `src/features/character/vtmCharacterWrites.ts` | 2 | N/A |
| `useVtmCharacters` | `src/features/character/useVtmCharacters.ts` | 2 | N/A |
| `useSendVtmCharacterSavesOnLeave` | `src/features/character/useVtmCharacters.ts` | 1 | N/A |
| `readCurrentCharacterId` | `src/features/character/useVtmCharacterRoster.ts` | 3 | N/A |
| `useCurrentVtmCharacterId` | `src/features/character/useVtmCharacterRoster.ts` | 4 | N/A |
| `useVtmCharacterRoster` | `src/features/character/useVtmCharacterRoster.ts` | 5 | N/A |
| `findVtmCharacter` | `src/features/character/vtmCharacterRoster.ts` | 1 | N/A |
| `readSnapshotCharacter` | `src/features/character/vtmCharacterRoster.ts` | 3 | N/A |
| `readVtmCharacterSnapshot` | `src/features/character/vtmCharacterRoster.ts` | 1 | N/A |
| `visibleVtmCharacters` | `src/features/character/vtmCharacterRoster.ts` | 2 | N/A |
| `nextSelectedVtmCharacterId` | `src/features/character/vtmCharacterRoster.ts` | 4 | N/A |
| `normalizeVtmSheet` | `src/features/character/vtmCharacterRecord.ts` | 2 | N/A |
| `parseVtmCharacter` | `src/features/character/vtmCharacterRecord.ts` | 3 | N/A |
| `serializeVtmCharacter` | `src/features/character/vtmCharacterRecord.ts` | 3 | N/A |
| `readVtmCharacterDoc` | `src/features/character/vtmCharacterRecord.ts` | 2 | N/A |
| `needsVtmMediaUrls` | `src/features/character/useVtmCharacterMedia.ts` | 4 | N/A |
| `resolveOptionalPath` | `src/features/character/useVtmCharacterMedia.ts` | 2 | N/A |
| `resolveVtmMediaUrls` | `src/features/character/useVtmCharacterMedia.ts` | 1 | N/A |
| `withResolvedVtmMedia` | `src/features/character/useVtmCharacterMedia.ts` | 3 | N/A |
| `useVtmCharacterMedia` | `src/features/character/useVtmCharacterMedia.ts` | 3 | N/A |
| `canEditVtmCharacter` | `src/features/character/vtmCharacterActions.ts` | 3 | N/A |
| `canChooseVtmCharacter` | `src/features/character/vtmCharacterActions.ts` | 3 | N/A |
| `updateVtmCharacter` | `src/features/character/vtmCharacterActions.ts` | 4 | N/A |
| `addVtmCharacter` | `src/features/character/vtmCharacterActions.ts` | 3 | N/A |
| `deleteVtmCharacter` | `src/features/character/vtmCharacterActions.ts` | 3 | N/A |
| `chooseCurrentVtmCharacter` | `src/features/character/vtmCharacterActions.ts` | 4 | N/A |
| `emptyCharacterSaves` | `src/features/character/lib/characterWrites.ts` | 1 | N/A |
| `campaignScope` | `src/features/character/lib/characterWrites.ts` | 3 | N/A |
| `isCharacterSaveOutstanding` | `src/features/character/lib/characterWrites.ts` | 2 | N/A |
| `sendCharacterSavesNow` | `src/features/character/lib/characterWrites.ts` | 1 | N/A |
| `cancelCharacterSave` | `src/features/character/lib/characterWrites.ts` | 2 | N/A |
| `characterSaveFields` | `src/features/character/lib/characterWrites.ts` | 2 | N/A |
| `deleteCharacterDoc` | `src/features/character/lib/characterWrites.ts` | 1 | N/A |
| `saveCurrentCharacter` | `src/features/character/lib/characterWrites.ts` | 1 | N/A |
| `sendCharacterSave` | `src/features/character/lib/characterWrites.ts` | 2 | N/A |
| `scheduleCharacterSave` | `src/features/character/lib/characterWrites.ts` | 2 | N/A |
| `useCharacterRoster` | `src/features/character/hooks/useCharacterRoster.ts` | 28 | N/A |
| `applyGrantToCharacter` | `src/features/character/lib/grantTransaction.ts` | 23 | N/A |
| `useGrantTools` | `src/features/character/hooks/useGrantTools.ts` | 43 | N/A |
| `ItemsTab` | `src/features/items/ItemsTab.tsx` | 184 | N/A |
| `useItemApprovals` | `src/features/character/hooks/useItemApprovals.ts` | 59 | N/A |
| `characterSchemaStamp` | `src/features/ruleSets/characterSchemaStamp.ts` | 1 | N/A |
| `assertCharacterAtCurrentVersion` | `src/features/ruleSets/characterSchemaStamp.ts` | 3 | N/A |
| `addCharacter` | `src/features/character/hooks/useCharacterRoster.ts` | 6 | N/A |
| `grantItemToCharacter` | `src/features/items/ItemsTab.tsx` | 30 | N/A |
| `approveCreate` | `src/features/character/hooks/useItemApprovals.ts` | 9 | N/A |
| `approveSell` | `src/features/character/hooks/useItemApprovals.ts` | 15 | N/A |
| `approveLearnSpell` | `src/features/character/hooks/useItemApprovals.ts` | 12 | N/A |
| `approveAbilityReroll` | `src/features/character/hooks/useItemApprovals.ts` | 8 | N/A |
| `approveRequest` | `src/features/character/hooks/useItemApprovals.ts` | 4 | N/A |
| `acceptPendingTransfer` | `functions/src/index.ts` | 42 | N/A |
| `resolveCharacterRuleSet` | `functions/src/characterSchemaVersions.ts` | 3 | N/A |
| `currentCharacterSchemaVersion` | `functions/src/characterSchemaVersions.ts` | 1 | N/A |
| `isCharacterAtSchemaVersion` | `functions/src/characterSchemaVersions.ts` | 3 | N/A |

## Safety net and behavior pinned

- `vtmPersistence.emulator.test.ts` drives the real hook, migrations, parser, debounce and Firestore writer against the real rules with a populated version 0 or 1 document.
  It checks the entire saved document, unknown top-level and nested fields, array-row fields, timestamp values, portrait and token paths, a caller-chosen document ID, and the untouched current-character record after edit and reload.
  Only Storage URL resolution is stubbed; Firestore listeners and writes are real.
  It also proves direct deletion leaves user state and a dependent subcollection document intact.
- `useVtmCharacters.test.tsx` already covers subscription/error handling, selection, visibility, media healing, create/edit/delete/current-character actions and the ticket 8 unmount/campaign/group flush cases.
  Added cases record the disabled-roster lost edit, subscription restart while an edit waits, optimistic state after failed create/current writes, and stale selected/current IDs after a rejected delete.
- `characterSaveConcurrency.test.ts` exercises both OSE and VtM save scheduling and completion.
  A pending second edit remains outstanding after the first write completes, but the first completion clears the shared boolean while a second write is already in flight.
  This is a current limitation, not a requested fix.
- Existing `lib/characterWrites.test.ts`, `vtmCharacterWrites.test.ts` and `hooks/useCharacterRoster.test.tsx` pin exact create/save/current-state payloads, merge versus replacement, retired OSE field deletion, stamping, debounce, cancellation, missing records and rejected writes.
  Existing OSE hook leave tests preserve its flush behavior.
- `lib/grantTransaction.test.ts` and its emulator suite pin quantity expansion, XP, gold rechunking, overflow documents before the character write, unknown details, missing/malformed records, version gates and failures.
  Added cases record the caller-target class controlling XP despite a different stored class, and negative gold normalization with a missing quantity.
- `ItemsTab.grant.test.tsx` pins character-first writes, overflow documents, source-gold decrement/delete, authored source retention, retained dropped non-gold sources, version gates and error feedback.
  Added cases prove it reads only the character and trusts the selected source snapshot, and shows failure when a commit rejects after writes are staged.
- `hooks/useItemApprovals.test.tsx` pins create/sell/learn/reroll payloads and ordering, malformed defaults, missing items, empty spells, non-draft rerolls, version gates and failures.
  Added cases record trusting a supplied already-rejected request and failure after staging the character write.
  Existing `characterWriters.emulator.test.ts` proves a missing approval rolls back that character write.
- `acceptPendingTransfer.callable.emulator.test.ts` drives the real callable with a mocked transaction boundary, pinning read order, sender/receiver write order, offer cleanup, authorization, version gates, capacity, quantity changes, malformed inventory and success/failure paths.
  Added cases pin authorization before version checking and version checking before item availability.
  Existing `acceptPendingTransfer.emulator.test.ts` exercises committed transfer behavior against Firestore.
- `characterSchemaStamp.test.ts` and `characterSchemaVersions.function.test.ts` cover stamping, strict version comparisons, absent-version defaults and campaign rule-set resolution on both server source and compiled output.
  Added stamp-check coverage records that the check ignores `system` and write-time presence or age.

These tests deliberately preserve current limitations; changing those assertions requires an explicit behavior change rather than silently treating them as the extraction's intended design.
No browser checks, production edits, quality configuration changes or refactors belong to this task.

## Validation

- `npm test`: 134 files, 1,963 tests passed.
- `npm run test:emulator`: 22 files, 281 tests passed; Firebase stopped the processes it started after the command.
- Isolated final VtM persistence run: all 3 cases passed after explicitly awaiting pending write acknowledgements before comparing server timestamps.
- `npm run lint -- --ignore-pattern '.scratch/**'`: zero errors; the 64 existing warnings remain.
  Plain local lint also scanned pre-existing ignored `.scratch/crapper-review` copies and reported errors in those copies, which are absent from a CI checkout.
  The quality configuration was not changed.
- `npm run build` (including `tsc -b`), Cloud Functions lint and Cloud Functions build passed.
- No local browser checks were run, as requested.
