# Plan B: GM "Grant Item to Character" Flow

**Phase:** 3
**Depends on:** Plan A (CampaignItem type + useItems hook)
**Unblocks:** None (independent of Plans C and D)

## Why

Core use case: GM creates module items in the Items tab and gives them to players. Currently there's no way to get an item from the Items tab into a character's inventory.

## Key Design Decisions

- **Granting is snapshot-based**: copies template data into a `CharacterInventoryItem` instance once. No live sync — if the GM later edits the template, existing granted copies are not updated.
- **GM can edit granted instances**: since `isCampaignGM` has write access to character docs, the GM can modify any character's inventory items after granting.
- **Granted items land in packed inventory** (`equipped: false`).
- **Uses `runTransaction`** for the grant write. Granting reads the target character's current inventory, appends the new item, and writes back — this is a read-modify-write that needs transaction protection to avoid lost updates if two grants race.

---

## Changes

### Utility function: `campaignItemToInventoryItem`

Location: `src/features/items/itemConversion.ts` (new file) or inline in ItemsTab.

```typescript
function campaignItemToInventoryItem(item: CampaignItem): CharacterInventoryItem
```

Mapping by `item.type`:

**`type === 'weapon'` → `CharacterWeaponItem`:**
- `kind: 'weapon'`
- `weaponId: ''` (no catalog weapon — this is a custom/module item)
- `isMagic` ← `item.isMagic` (direct copy)
- `damageDiceCount` ← `item.weaponStats.damageDiceCount` (direct copy)
- `damageDiceSides` ← `item.weaponStats.damageDiceSides` (direct copy)
- `bonus` ← `item.weaponStats.attackBonus`
- `rangeShort` ← `item.weaponStats.rangeShort` (direct copy)
- `rangeMedium` ← `item.weaponStats.rangeMedium` (direct copy)
- `rangeLong` ← `item.weaponStats.rangeLong` (direct copy)
- `twoHanded` ← `item.weaponStats.twoHanded` (direct copy)

**`type === 'armour'` → `CharacterArmourItem`:**
- `kind: 'armour'`
- `armourId: ''`
- `isMagic` ← `item.isMagic` (direct copy)
- `ac` ← `item.armourStats.acBonus`
- `bonus: ''`
- Note: `item.armourStats.armourType` (`'body' | 'shield'`) is intentionally dropped on grant — `CharacterArmourItem` has no `armourType` field. Can be inferred from armour catalog or added to inventory items later if combat needs it.

**`type === 'ammunition'` → `CharacterAmmunitionItem`:**
- `kind: 'ammunition'`
- `qty` ← `parseInt(item.qty) || 1`

**`type === 'general'` → `CharacterGeneralItem`:**
- `kind: 'general'`

**`type === 'custom'` → `CharacterCustomItem`:**
- `kind: 'custom'`

**Common fields (all variants):**
- `id: crypto.randomUUID()`
- `name: item.name`
- `costGp: parseFloat(item.gpValue) || 0`
- `equipped: false` (lands packed)
- `notes: ''`
- `sourceItemId: item.id`
- `description: item.description`
- `specialRule: item.specialRule`
- `portraitUrl: item.portraitUrl`

### ItemsTab detail panel: "Grant to Character" button

In `src/features/items/ItemsTab.tsx`, add to the detail panel (GM only):

1. **Button**: "Grant to Character" — visible when `role === 'gm'` and an item is selected
2. **Character picker**: dropdown of all campaign characters (names + class)
   - Needs character list — either passed as prop from App.tsx or loaded via a shared hook
   - Show current packed slot availability for each character
3. **On confirm**:
   - Call `campaignItemToInventoryItem(selectedItem)` to create inventory instance
   - Use `runTransaction`:
     - Read target character doc inside transaction
     - Get current `details.inventory[]`
     - Append new item
     - Write updated character doc (transaction retries on conflict)
   - Show success feedback (toast or brief message)

### Props / data access

ItemsTab needs access to campaign characters for the picker. Options:
- **Option A**: Pass `characters: CharacterRecord[]` as prop from App.tsx (simple, App already has them)
- **Option B**: Import `useCharacters` in ItemsTab (creates coupling but self-contained)
- **Recommended**: Option A — keeps ItemsTab decoupled, App.tsx already manages characters

Also needs Firestore `db` instance for `runTransaction`. Import from Firebase config.

---

## Verification

1. GM creates a weapon item in ItemsTab with damageDiceCount "1", damageDiceSides "8", attack bonus "2", rangeShort "20", twoHanded false, isMagic false
2. GM clicks "Grant to Character" → picks a character → confirms
3. Character's inventory shows a new weapon with `damageDiceCount: "1"`, `damageDiceSides: "8"`, `bonus: "2"`
4. Item has `sourceItemId` pointing back to the campaign item
5. Item is packed (`equipped: false`)
6. GM edits the campaign item template → granted instance is NOT affected (snapshot-based)
7. GM can click on the granted instance in character's inventory and edit it

## Files Modified

| File | Action |
|------|--------|
| `src/features/items/itemConversion.ts` | **Create** — `campaignItemToInventoryItem` utility |
| `src/features/items/ItemsTab.tsx` | Add Grant button + character picker in detail panel |
| `src/App.tsx` | Pass `characters` prop to ItemsTab (if using Option A) |
