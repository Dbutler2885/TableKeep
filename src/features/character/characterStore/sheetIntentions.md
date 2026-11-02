# Opt-in revisioned sheet writes

`saveSheetIntention(db, sheetRef, intention)` is the new transactional path beside the legacy delayed save in `characterStoreWrites.ts`.
It accepts character or NPC sheet references and removes any Firestore converter before reading canonical data.
It does not migrate existing callers, local optimistic stores, rules, teardown, or callable transfers.
Those changes belong to tickets 07 and 08; this expansion alone does not make existing saves safe or authorize receipt writes under production rules.

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
Real owner/GM authorization, immutable receipt rules and the revision compatibility fence are ticket 07 work.
