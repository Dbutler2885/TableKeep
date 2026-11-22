# Revisioned Lubec sheet writes

`saveSheetIntention(db, sheetRef, intention)` is the transactional mutation path for Lubec characters and NPC sheets.
It removes any Firestore converter before reading canonical data.
The shared store, gear transactions and transfer callable use the same pure planner in `functions/src/sheets/`, re-exported here for browser callers.
The former Lubec replacement-save route now refuses calls; OSE and VtM retain their existing serializer path.
Creation uses `createRevisionedSheet`, which atomically writes revision zero and a stable creation receipt and refuses to overwrite a later edit.
Deletion uses `deleteSheetWithReceipts` (`sheetTeardown.ts`), which deletes the sheet and its `writeReceipts` in one transaction, relisting when the revision moved after the listing, so a save that lands meanwhile leaves no receipt and a later save finds no sheet to bring back.

Create an operation id once, retain the entire intention while awaiting acknowledgement, and retry that exact envelope after a network failure.
Operation ids use 1-128 ASCII letters, digits, underscores or hyphens.
Each envelope carries a nonnegative integer `baseRevision` and ordered edits with base values from that snapshot.
A missing stored revision reads as zero.

```ts
const intention: SheetIntention = {
  operationId: 'retained-operation-id',
  baseRevision: 0,
  edits: [
    { kind: 'delta', path: ['lubec', 'counters', 'stress'], base: 4, amount: 2 },
    {
      kind: 'set',
      path: ['lubec', 'effects', { recordId: 'effect-1' }, 'name'],
      base: { exists: true, value: 'Severe Concussion' },
      value: 'Concussion',
    },
  ],
}
const outcome = await saveSheetIntention(db, sheetRef, intention)
```

Paths name object fields and stable collection record ids, never array indexes.
Use the smallest touched field path; a `set` of an object or array compares its complete base value and replaces that value only if it still matches.
`{ exists: false }` distinguishes a missing field from a stored `null`.
Missing ancestors require repair rather than creating a new sheet or record.
`insert` addresses a collection path and supplies a complete record with a stable `id`.
`remove` addresses a field or identified record and carries its base value.
Edits later in one envelope see the results of earlier edits in that envelope.

Sets and removals compare base values even when the revision has not changed.
Deltas validate that the current value is numeric and apply the original amount to it, preserving other concurrent deltas.
A record collision, missing record, changed base value, deleted sheet or invalid revision returns a structured `repair` outcome with a code and path.
Network and authorization errors reject so the caller can retain the pending intention for retry.
A revision fence can return `permission-denied` before Firestore reports optimistic transaction contention.
After a prepared write receives that error, the standalone save checks the canonical revision with a server-only read and restarts only if it advanced beyond the revision that attempt read.
It retains the same captured intention and operation id for at most two restarts (three transactions total), rebasing each time and checking the immutable receipt first.
An unchanged revision, deleted sheet, revoked read authority, read-stage denial or other transport error surfaces without another transaction.
This recovery does not weaken rules or grant write authority; continuing contention after the bound still rejects for caller-managed retry.
No refused edit creates a receipt or advances the revision.

Successful mutations increment `sheetRevision` once per envelope and commit a `writeReceipts/{operationId}` document containing the intention and committed outcome in the same transaction.
An identical retry returns that stored outcome without rereading or rewriting the sheet, including after subsequent edits or deletion.
Object key order is irrelevant to receipt identity; array order and all values remain significant.
Changed payload reuse returns `operation-id-reused`.
Schema stamps and all untouched canonical data survive; only `updatedAt` and `sheetRevision` are protocol-managed writes.

For multi-sheet gear and system transactions, call `prepareSheetIntention` for each affected sheet and finish every external read before calling `writePreparedSheetIntentions`.
Pass one envelope per sheet, combining that sheet's edits into it.
The plural writer checks every prepared outcome before adding any write and throws `SheetRepair` if any sheet needs repair, aborting the enclosing transaction.
The singular writer returns a repair outcome without writing and is intended for a standalone save.
`planSheetIntention` contains no Firebase dependency and exposes the same canonical-data plan for server adapters that compose sheet and command writes.
Do not generate operation ids, sample dice, or mutate intentions inside a transaction callback.

The emulator protocol suite uses an isolated project with rules disabled and proves actual transaction behavior only.
The real owner/GM authorization, immutable receipts, revision fence and two-user concurrent saves are exercised in `../../lubec/combatRules.emulator.test.ts`.

## Confirmed and optimistic state

Each hook instance keeps confirmed server data apart from its pending intentions.
A Lubec subscription waits for a server-backed snapshot and includes metadata changes so a local write's confirmation is observed.
Before rendering a newer snapshot, it checks pending receipts and replays only operations not already represented in that snapshot.
Pending edits are stored in a user-and-sheet-scoped session journal before sending.
A network failure retains the same operation id for retry; a genuine conflict or vanished record remains visible for review and explicit discard.
A rules denial offers refresh messaging without discarding the journal.
Callbacks that were rendered before a newer snapshot pass their rendered base into the store, so copying a containing map cannot convert an unrelated remote wound into an edit.
An asynchronous snapshot from an unsubscribed campaign cannot replace the next campaign's roster.

The reviewed producer inventory and off-hours release checklist are in the root README.
No rule deployment or combat release follows from passing local tests.
