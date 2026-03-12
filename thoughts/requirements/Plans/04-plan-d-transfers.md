# Plan D: Player-to-Player Item Transfers

**Phase:** 5
**Depends on:** Plan A (unified inventory/types), Plan C (item detail actions)

## Why

Players can currently equip, drop, sell, spend, and receive granted items, but they cannot hand inventory items to each other. Transfers should preserve the unified inventory model, require receiver consent, and reuse the current transaction/overflow patterns instead of inventing a parallel item system.

---

## Current-System Assumptions

This plan is intentionally based on the live codebase, not the earlier draft assumptions.

- `CharacterInventoryItem` is now the transfer unit.
- Inventory item kinds are:
  - `weapon`
  - `armour`
  - `ammunition`
  - `consumable`
  - `general`
  - `gold`
- Inventory items now carry current-instance fields such as:
  - `qty`
  - `stack`
  - `sourceItemId`
  - `description`
  - `specialRule`
  - `portraitUrl`
- Gold is part of the unified inventory model and uses chunk/overflow helpers.
- Packed-slot capacity is governed by:
  - `computeAvailablePackedSlots`
  - `computeOverflow`
- Existing GM grant flows already use `runTransaction` and should be treated as the pattern reference.

Implication:
- Transfer should move a live inventory instance from one character to another.
- It should not reconstruct an item from `CampaignItem` unless explicitly needed for fallback overflow/drop handling.

---

## Product Decisions For The Revised Plan

### Transfer scope

Phase D covers transferring non-gold inventory items between characters.

- Included:
  - `weapon`
  - `armour`
  - `ammunition`
  - `consumable`
  - `general`
- Excluded for now:
  - `gold`

Why gold is deferred:
- gold has separate spend/chunk/overflow behavior
- a gold transfer UX likely wants amount entry rather than “send this item”
- accepting gold should probably merge/chunk rather than move a single object verbatim

Gold transfer can be added later as a small follow-up once item transfer is stable.

### Consent model

Transfers use sender-create / receiver-accept-or-decline.

- Sender offers an item
- Receiver sees a global notification
- Receiver accepts or declines
- Item stays with sender until accept succeeds

### Capacity behavior on accept

Accept should follow the current inventory capacity model rather than a simplified hard-stop rule.

On accept:
- build the receiver’s candidate inventory
- run `computeOverflow(...)`
- if the transfer would cause overflow, reject the accept with a clear message instead of silently dropping the transferred item

Reason:
- transfer is player-to-player intent, not a grant/drop flow
- silently dropping a transferred item into campaign loot would be surprising and unsafe

So the receiver must have enough packed capacity for the incoming item as accepted.

### GM powers

GM can:
- read all transfers
- cancel/delete a pending transfer

GM force-accept is deferred.

Reason:
- force-accept changes ownership and capacity semantics
- it needs a clearer UX and policy decision than this phase requires

---

## Data Model

### Firestore collection

`campaigns/{campaignId}/pendingTransfers/{transferId}`

```ts
export type PendingTransfer = {
  id: string
  itemSnapshot: CharacterInventoryItem
  itemId: string
  itemKind: Exclude<ItemKind, 'gold'>
  itemName: string
  fromCharacterId: string
  fromCharacterName: string
  fromUserId: string
  toCharacterId: string
  toCharacterName: string
  toUserId: string
  createdAt: Timestamp
}
```

Notes:
- `itemSnapshot` is the full live inventory item at the time of offer.
- `itemId` is duplicated for easy lookup/debugging.
- `itemKind` and `itemName` are duplicated for simple list rendering/rules sanity.
- No persisted status field. Existence means pending.

### Type location

Add `PendingTransfer` to [app.ts](/Users/davidb/Documents/Code/HomeBoysHouse/src/types/app.ts).

Also add a narrow helper type if useful:

```ts
export type TransferableInventoryItem = Exclude<CharacterInventoryItem, CharacterGoldItem>
```

This makes the “gold excluded for now” rule explicit in code.

---

## Firestore Rules

Add a `pendingTransfers` match under campaign scope.

Required behavior:
- read: any campaign member
- create: campaign member where `fromUserId === request.auth.uid`
- update: false
- delete: sender, receiver, or GM

Additional rule expectations:
- sender cannot spoof another sender uid
- required identity fields must exist
- `itemKind` must not be `gold`

Pseudo-shape:

```txt
match /pendingTransfers/{transferId} {
  allow read: if isCampaignMember(campaignId);

  allow create: if isCampaignMember(campaignId)
    && request.resource.data.fromUserId == request.auth.uid
    && request.resource.data.itemKind != 'gold';

  allow update: if false;

  allow delete: if request.auth.uid == resource.data.fromUserId
    || request.auth.uid == resource.data.toUserId
    || isCampaignGM(campaignId);
}
```

Final rules should follow the project’s existing membership/GM helper style in [firestore.rules](/Users/davidb/Documents/Code/HomeBoysHouse/firestore.rules).

---

## Transfer Flow

### 1. Sender initiates from item detail

In the character item detail modal:
- add `Give to...` for transferable, non-gold items
- open a target picker of other campaign characters
- exclude self
- show basic target info:
  - character name
  - owner username if useful
  - packed slot usage / available capacity if available

On confirm:
- create `PendingTransfer` doc
- do not remove the item from sender inventory
- mark the item as having an outgoing pending transfer in UI

### 2. Receiver sees global notification

Create a global transfer notification component that:
- is mounted from `App.tsx`
- subscribes to incoming transfers for the signed-in user
- renders nothing when there are no incoming transfers
- shows pending incoming transfers from any tab

The notification should show:
- item name
- item kind
- sender character name
- receiver character name
- accept / decline actions

### 3. Receiver accepts

Use `runTransaction`.

Transaction steps:

1. Read the transfer doc
2. Read sender character doc
3. Read receiver character doc
4. Find the item in sender inventory by `itemId`
5. If item missing:
   - abort with “Item no longer available”
   - delete transfer doc after transaction failure handling
6. Verify the current sender item is still transferable:
   - not gold
7. Build receiver candidate inventory:
   - append the current sender item with `equipped: false`
8. Compute receiver packed capacity via `computeAvailablePackedSlots`
9. Use `computeOverflow(...)`
10. If overflow would drop anything:
   - reject accept with “Not enough packed slots”
   - leave inventories unchanged
11. Remove item from sender inventory
12. Write updated sender inventory
13. Write updated receiver inventory
14. Delete transfer doc

Important:
- accepted item should arrive packed, not equipped
- use the sender’s current item record, not the stale snapshot, for the actual transfer
- the snapshot is UI/reference data, not source of truth for the move

### 4. Receiver declines

On decline:
- delete the transfer doc
- sender inventory remains unchanged

### 5. Sender cancels

Sender can cancel an outgoing transfer:
- delete transfer doc
- item remains in sender inventory

### 6. GM cancels

GM can cancel any pending transfer:
- delete transfer doc
- item remains with sender

---

## Edge Cases

### Sender no longer has the item

Possible if sender:
- dropped it
- sold it
- deleted/consumed it through another path

Behavior:
- receiver accept fails gracefully
- transfer is removed
- receiver sees “Item no longer available”

### Item changed after offer

Possible if sender edits/equips/unequips/modifies the item before receiver accepts.

Behavior:
- transfer uses the sender’s current live item from inventory, not the original snapshot
- snapshot is only for displaying the offer

### Multiple pending offers for the same item

Disallow this.

Sender should not be able to create a second transfer for an item that already has a pending outgoing transfer.

Implementation options:
- UI guard: hide/disable `Give to...` when a pending outgoing transfer exists for that item
- hook-level guard: before create, check existing outgoing transfers for same `itemId` + `fromCharacterId`

### Receiver inventory full

Behavior:
- accept disabled or reject-on-attempt
- clear error message shown
- transfer remains pending

### Character ownership assumptions

Transfers are between characters, but permission is still user-based.

The hook must work from:
- sender user id
- receiver user id
- sender character id
- receiver character id

Do not assume one user has only one character.

---

## New Files

### `src/features/transfers/usePendingTransfers.ts`

New hook.

Responsibilities:
- subscribe to `pendingTransfers`
- expose:
  - `incomingTransfers`
  - `outgoingTransfers`
  - `allTransfers` for GM
  - `createTransfer(...)`
  - `acceptTransfer(...)`
  - `declineTransfer(...)`
  - `cancelTransfer(...)`

Implementation notes:
- reuse the project’s Firestore snapshot patterns
- use `runTransaction` for accept
- accept should reuse inventory capacity helpers from [inventoryOverflow.ts](/Users/davidb/Documents/Code/HomeBoysHouse/src/features/character/inventoryOverflow.ts)

### `src/features/transfers/TransferNotification.tsx`

New global UI component.

Responsibilities:
- render incoming pending transfers
- allow accept / decline
- optionally allow paging through multiple incoming offers

---

## Existing Files To Change

### `src/types/app.ts`

- add `PendingTransfer`
- optionally add `TransferableInventoryItem`

### `src/features/character/CharacterTab.tsx`

- add `Give to...` action in item detail modal
- exclude gold from transfer action
- add target picker UX
- show outgoing-pending state for an item if applicable

### `src/App.tsx`

- mount `TransferNotification`
- pass campaign/user context needed for subscription and actions

### `firestore.rules`

- add `pendingTransfers` rules

---

## Verification

1. Player A opens a non-gold item and chooses `Give to...`
2. Player A selects Character B and confirms
3. Transfer doc is created; item remains in A inventory
4. Player B sees incoming transfer notification from any tab
5. Player B accepts
6. Item moves from A inventory to B packed inventory with `equipped: false`
7. Transfer doc is deleted
8. Player B declines instead
9. Transfer doc is deleted and item remains with A
10. A drops/sells/removes the item before B accepts
11. B gets “Item no longer available”; transfer is cleaned up
12. B lacks packed capacity
13. Accept is blocked with a clear message; transfer remains pending
14. A cannot create duplicate pending transfers for the same item
15. GM can read and cancel any pending transfer

---

## Files Modified

| File | Action |
|------|--------|
| `src/types/app.ts` | Add `PendingTransfer` type |
| `src/features/transfers/usePendingTransfers.ts` | Create transfer hook |
| `src/features/transfers/TransferNotification.tsx` | Create global notification UI |
| `src/features/character/CharacterTab.tsx` | Add transfer action + picker |
| `src/App.tsx` | Mount transfer notification |
| `firestore.rules` | Add `pendingTransfers` rules |
