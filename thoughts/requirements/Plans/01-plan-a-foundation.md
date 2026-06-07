# Plan A: Foundation — Persist ItemsTab + Extend Inventory Types

**Phases:** 1 + 2
**Depends on:** Nothing
**Unblocks:** Plans B, C, D

## Why

ItemsTab currently stores items in local React state only — everything vanishes on page reload. This makes the Items tab useless as a GM prep tool. Persisting to Firestore is the foundation for all other item system work.

Additionally, `CharacterInventoryItem` needs optional fields (description, provenance) to support richer items from GM grants and player creation.

---

## Phase 1: Persist GM Items to Firestore

### New type: `CampaignItem` in `src/types/app.ts`

```typescript
export type CampaignItemType = 'weapon' | 'armour' | 'ammunition' | 'general' | 'custom'

export type CampaignItem = {
  id: string
  name: string
  type: CampaignItemType
  status: 'authored' | 'dropped'
  droppedByCharacterId?: string
  droppedByCharacterName?: string
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  tokenIcon: TokenIconConfig
  subtype: string
  description: string
  gpValue: string
  qty: string
  isMagic: boolean
  weaponStats: {
    damageDiceCount: string
    damageDiceSides: string
    attackBonus: string
    damageBonus: string
    rangeShort: string
    rangeMedium: string
    rangeLong: string
    twoHanded: boolean
  }
  armourStats: { acBonus: string; armourType: 'body' | 'shield' }
  specialRule: string
  notes: string
}
```

### New hook: `src/features/items/useItems.ts`

Modeled on `useCharacters.ts` (`src/features/character/useCharacters.ts`):
- `onSnapshot` on `campaigns/{campaignId}/items` collection
- Debounced 500ms `setDoc` writes via `scheduleItemWrite()`
- `pendingWritesRef` clobbering guard (skip onSnapshot updates for items with pending writes)
- Exports:
  - `items: CampaignItem[]`
  - `addItem(item: CampaignItem): void`
  - `updateItem(id: string, patch: Partial<CampaignItem>): void`
  - `deleteItem(id: string): void`
  - `selectedItemId` / `setSelectedItemId` (optional, or keep in ItemsTab)

### Changes to `src/features/items/ItemsTab.tsx`

- Accept `campaignId: string` prop (like MonstersTab)
- Remove local `ItemRecord` type definition (replaced by imported `CampaignItem`)
- Note: `CampaignItem` types now match inventory kinds (`weapon | armour | ammunition | general | custom`), not old `ItemRecord` types. `weaponStats` includes range fields and `twoHanded`. `armourStats` uses `armourStats` (not `armorStats`) with `armourType: 'body' | 'shield'`. Top-level `isMagic` and `qty` fields.
- Remove `const [items, setItems] = useState<ItemRecord[]>([])` and all local CRUD logic
- Use `useItems(campaignId)` hook instead
- Rewire all handlers:
  - Add button → `addItem(newItemTemplate(type))`
  - Field edits → `updateItem(id, { field: value })`
  - Delete → `deleteItem(id)` (after ConfirmModal)
- Add "Dropped" option to filter tabs (alongside All/Weapons/Armour/Ammunition/General/Custom)
  - Filter items by `status === 'dropped'` when this tab is active
  - Dropped items show who dropped them in the list row
- Players can browse items (read-only); GM can edit. Keep existing `canEdit = role === 'gm'` guard.

### Changes to `src/App.tsx`

- Pass `campaignId` prop to `<ItemsTab>` (check if already passed — MonstersTab pattern)

### Changes to `firestore.rules`

Add inside `match /campaigns/{campaignId}` block, same pattern as monsters (line 155-158):

```
match /items/{itemId} {
  allow read: if isCampaignMember(campaignId);
  allow write: if isCampaignGM(campaignId);
}
```

**Deliberate phase override:** Plan C will add a player create rule scoped to `status === 'dropped'`. For now, GM-only write is sufficient and intentionally restrictive.

---

## Phase 2: Extend CharacterInventoryItem

### Changes to `CharacterInventoryItemBase` in `src/types/app.ts`

Add optional fields — all additive, no migration needed:

**Already implemented in Phase 1.** The base type now includes:

```typescript
type CharacterInventoryItemBase = {
  id: string
  name: string
  kind: 'weapon' | 'armour' | 'ammunition' | 'general' | 'gold' | 'custom'
  costGp: number
  equipped: boolean
  notes: string
  sourceItemId?: string       // links back to CampaignItem it was created from
  description?: string        // item description (from GM template or player-written)
  specialRule?: string        // special rules text
  portraitUrl?: string | null // item portrait
  qty?: number                // bundled quantity (for consumables sharing a slot)
}
```

The `qty` field on the base allows general items to bundle (e.g., 6 torches = 1 slot), complementing the existing `qty` on `CharacterAmmunitionItem`.

---

## Verification

1. **ItemsTab persistence**: Create items in ItemsTab, reload page, confirm they persist
2. **Firestore console**: Check `campaigns/{id}/items/{itemId}` documents exist with correct shape
3. **Rules**: Deploy `firestore.rules`, verify GM can write items, players can read
4. **Type safety**: Run `npx tsc --noEmit` — all existing code should compile (new fields are optional)
5. **No regression**: Existing character inventory loads and saves correctly with new base fields

## Files Modified

| File | Action |
|------|--------|
| `src/types/app.ts` | Add `CampaignItem` type, extend `CharacterInventoryItemBase` |
| `src/features/items/useItems.ts` | **Create** — Firestore hook |
| `src/features/items/ItemsTab.tsx` | Swap local state for hook, add campaignId prop, add Dropped filter |
| `src/App.tsx` | Pass campaignId to ItemsTab |
| `firestore.rules` | Add items collection rules |
