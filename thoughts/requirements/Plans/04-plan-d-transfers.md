# Plan D: Item Transfer Between Characters

**Phase:** 5
**Depends on:** Plan A (types), Plan C (item actions in detail modal)

## Why

Players need to give items to each other. Items shouldn't be permanently bound to one character. The transfer flow uses an accept/decline pattern with a Firestore `pendingTransfers` collection so both parties are aware and consent.

---

## Data Model

### Firestore collection: `campaigns/{campaignId}/pendingTransfers/{transferId}`

```typescript
export type PendingTransfer = {
  id: string
  itemSnapshot: CharacterInventoryItem  // full snapshot of item at time of offer
  fromCharacterId: string
  fromCharacterName: string
  fromUserId: string                    // auth uid of sender (for rules)
  toCharacterId: string
  toCharacterName: string
  toUserId: string                      // auth uid of receiver (for rules)
  createdAt: Timestamp
}
// Note: only 'pending' status is stored. Docs are deleted on accept/decline — no status lifecycle.

```

### Firestore rules

```
match /pendingTransfers/{transferId} {
  // All campaign members can read (GM needs visibility too)
  allow read: if isCampaignMember(campaignId);

  // Sender can create (must reference own uid, fields must be present)
  allow create: if isCampaignMember(campaignId)
    && request.resource.data.fromUserId == request.auth.uid
    && request.resource.data.keys().hasAll([
      'id', 'itemSnapshot', 'fromCharacterId', 'fromCharacterName',
      'fromUserId', 'toCharacterId', 'toCharacterName', 'toUserId', 'createdAt'
    ]);

  // No update — docs are deleted on accept/decline, not status-updated
  allow update: if false;

  // Sender, receiver, or GM can delete
  allow delete: if (
    request.auth.uid == resource.data.fromUserId
    || request.auth.uid == resource.data.toUserId
    || isCampaignGM(campaignId)
  );
}
```

---

## Transfer Flow

### 1. Sender initiates

In the item detail modal (CharacterTab.tsx), "Give to..." button:
- Opens character picker (other campaign characters, not self)
- Shows target character's name and available packed slots
- On confirm:
  - Creates `PendingTransfer` doc (existence = pending; deleted on resolution)
  - Item stays in sender's inventory (not removed yet — removed on accept)
  - Visual indicator on the item that it has a pending transfer (e.g., "Offered to [name]")

### 2. Receiver gets notification

**Global notification component** (`src/features/transfers/TransferNotification.tsx`):
- Mounted in `App.tsx` (or layout wrapper) — visible from any tab
- Subscribes to `pendingTransfers` where `toUserId === currentUser.uid` (all docs are pending by definition — deleted on resolution)
- Shows a modal/overlay when there are pending incoming transfers:
  - Item name and kind
  - "From [character name]"
  - Receiver's current inventory: X/Y packed slots used
  - Accept / Decline buttons

### 3. Receiver accepts

On accept (`runTransaction` — read-modify-write on both character docs):
1. Read sender's character doc (get current `details.inventory[]`)
2. Find item by `itemSnapshot.id` — if not found, abort (item was dropped/sold, see edge case)
3. Read receiver's character doc (get current `details.inventory[]`)
4. Capacity check: verify receiver has room in packed slots
5. Remove item from sender's inventory
6. Add item to receiver's inventory with `equipped: false` (packed)
7. Write both character docs + delete the `PendingTransfer` doc
8. Transaction retries automatically on conflict

**Capacity check**: Before accepting, verify receiver has room in packed slots. If full, show error and don't allow accept.

**Edge case**: If sender already dropped/sold the item before receiver accepts, the item won't be found in sender's inventory. Handle gracefully — show "Item no longer available" and auto-delete the transfer.

### 4. Receiver declines

On decline:
- Delete the `PendingTransfer` doc
- Item stays with sender (nothing else changes)
- Optional: brief notification to sender that transfer was declined

### 5. GM visibility

GM can see all pending transfers and:
- Force-accept (bypass receiver)
- Cancel (delete transfer, item stays with sender)

---

## New Files

### `src/features/transfers/usePendingTransfers.ts`

Hook modeled on `useItems.ts`:
- `onSnapshot` on `campaigns/{campaignId}/pendingTransfers`
- Filters by current user for "my incoming" vs "my outgoing"
- Exports:
  - `incomingTransfers: PendingTransfer[]` (where `toUserId === me`)
  - `outgoingTransfers: PendingTransfer[]` (where `fromUserId === me`)
  - `allTransfers: PendingTransfer[]` (for GM view)
  - `createTransfer(item, fromChar, toChar): Promise<void>`
  - `acceptTransfer(transferId): Promise<void>` (handles runTransaction)
  - `declineTransfer(transferId): Promise<void>`
  - `cancelTransfer(transferId): Promise<void>`

### `src/features/transfers/TransferNotification.tsx`

Global component:
- Uses `usePendingTransfers` hook
- Renders nothing when no incoming pending transfers
- Renders a modal overlay when there are pending transfers
- Shows item details, slot availability, accept/decline buttons
- Needs access to current character's inventory for slot count (pass as prop or context)

---

## Changes to Existing Files

### `src/features/character/CharacterTab.tsx`
- Add "Give to..." button in item detail modal (alongside Drop/Sell from Plan C)
- Character picker for transfer target
- Visual indicator on items with pending outgoing transfers

### `src/App.tsx`
- Mount `<TransferNotification>` component
- Pass required props (campaignId, currentUser, characters)

### `src/types/app.ts`
- Export `PendingTransfer` type

### `firestore.rules`
- Add `pendingTransfers` collection rules

---

## Verification

1. Character A opens item detail → clicks "Give to..." → picks Character B → confirms
2. Character B's player sees notification from any tab → modal shows item + slot info
3. Character B accepts → item moves from A to B's packed inventory
4. Character B declines → item stays with A, transfer disappears
5. If A drops the item before B accepts → B sees "Item no longer available"
6. Capacity check: B with full inventory cannot accept
7. GM can see and manage all pending transfers
8. Multiple pending transfers queue correctly

## Files Modified

| File | Action |
|------|--------|
| `src/types/app.ts` | Add `PendingTransfer` type |
| `src/features/transfers/usePendingTransfers.ts` | **Create** — Firestore hook + transfer operations |
| `src/features/transfers/TransferNotification.tsx` | **Create** — Global notification component |
| `src/features/character/CharacterTab.tsx` | Add "Give to..." button in detail modal |
| `src/App.tsx` | Mount TransferNotification |
| `firestore.rules` | Add pendingTransfers rules |
