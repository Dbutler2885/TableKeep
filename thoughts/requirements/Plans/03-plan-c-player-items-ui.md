# Plan C: Player Ad-Hoc Item Creation + Item Actions + ASW Removal

**Phases:** 4 + 4b
**Depends on:** Plan A (extended inventory types, Firestore items collection)
**Unblocks:** Plan D (transfer needs item actions in place)

## Why

Players find, buy, and create items during play that the GM didn't pre-author. The current inventory UI uses raw text inputs for empty slots (creating bare name-only items) and has no drop/sell actions outside of guided character creation. The separate "Weapons, Armour & Spells" tab duplicates item creation that should live in a unified flow.

---

## Phase 4: Add Item Modal + Item Actions

### Current state (what we're replacing)

In `src/features/character/CharacterTab.tsx`:
- **Empty equipped slots** (lines ~2936-2978): Raw `<input type="text">` that creates a `CharacterGeneralItem` with just a name on change/blur. Disabled during guided creation.
- **Empty packed slots** (lines ~3039-3062): Same pattern, `equipped: false`.
- **Item detail modal** (line 3770+): Already renders weapon/armour edit forms when clicking existing items. This is the foundation for the new creation flow.
- **Sell button**: Only shown during `isGuidedCreation` via `refundItem()`.

### New "Add Item" modal

Replace raw text inputs on empty slots with structured creation:

**Empty slot UI change:**
- Instead of `<input type="text">`, show a `<button>` with "+" icon
- `equipped` slots: button creates item with `equipped: true`
- `packed` slots: button creates item with `equipped: false`
- Clicking opens the Add Item modal

**Modal fields (adapts by kind):**

| Field | Shown for | Required |
|-------|-----------|----------|
| Kind picker (general/weapon/armour/ammunition/custom) | All | Yes |
| Name | All | Yes |
| Cost (gp) | All | No (default 0) |
| Description | All | No |
| Notes | All | No |
| Template dropdown | weapon, armour | No |
| Damage dice (count + sides) | weapon | No |
| Range (short/med/long) | weapon | No |
| Two-handed checkbox | weapon | No |
| Magic checkbox + bonus | weapon, armour | No |
| AC | armour | No |
| Qty | ammunition | No (default 1) |

**On save:**
- Creates the appropriate `CharacterInventoryItem` variant based on kind
- For weapons: if template selected, apply via `applyWeaponTemplateToItem()` (existing function)
- For armour: if template selected, apply via `applyArmourTemplateToItem()` (existing function)
- Adds to inventory at the correct equipped/packed state
- Closes modal

**Implementation approach:**
- Reuse the existing item detail modal's weapon/armour forms (lines 3789-4000+)
- Extract shared form components or just duplicate the pattern in a creation context
- The detail modal already has all the field editing — the Add Item modal is the same fields but with empty defaults

### Item action buttons in detail modal

Enhance the existing item detail modal (line 3770+) with action buttons:

**Drop button:**
- Visible for all item kinds except gold
- Uses `ConfirmModal`: "Drop [item name]? It will be moved to the campaign items list."
- On confirm (via `runTransaction` — reads character inventory, removes item, writes back + creates campaign item atomically):
  1. Remove item from character's `details.inventory[]`
  2. Create a `CampaignItem` in `campaigns/{campaignId}/items` with:
     - `status: 'dropped'`
     - `droppedByCharacterId` / `droppedByCharacterName`
     - Fields mapped from the `CharacterInventoryItem` back to `CampaignItem` shape
  3. Close detail modal
- Needs a `inventoryItemToCampaignItem()` reverse mapping function. Must map:
  - `CharacterWeaponItem` → `type: 'weapon'`, `isMagic`, `weaponStats` (damageDiceCount/Sides, attackBonus, damageBonus, rangeShort/Medium/Long, twoHanded)
  - `CharacterArmourItem` → `type: 'armour'`, `isMagic`, `armourStats` (acBonus, armourType defaults to `'body'` since inventory items lack armourType)
  - `CharacterAmmunitionItem` → `type: 'ammunition'`, `qty` from `item.qty`
  - `CharacterGeneralItem` → `type: 'general'`
  - `CharacterCustomItem` → `type: 'custom'`
  - Common: `name`, `gpValue` from `costGp`, `description`, `specialRule`, `portraitUrl`, `notes`, `subtype: ''`, `qty` from `item.qty ?? '1'`
- **Firestore rules** (deliberate phase override of Plan A's GM-only write): Add a player create rule scoped to dropped items:
  ```
  allow create: if isCampaignMember(campaignId) && request.resource.data.status == 'dropped';
  ```

**Sell button:**
- Visible for all item kinds except gold
- Not restricted to guided creation anymore — works for active characters
- Generalize existing `refundItem()` logic:
  - Currently: deducts from `storeSpent`, recalculates gold from `startingGold - storeSpent`
  - Generalized: simply adds `item.costGp` (or `item.costGp / 2` for half-value sell) as gold to inventory
  - Uses existing `goldChunksForAmount()` to split gold into 100gp slot items
- Uses `ConfirmModal`: "Sell [item name] for [X] gp?"

### Existing functions to reuse

From `CharacterTab.tsx`:
- `makeWeaponItem()` — factory for blank CharacterWeaponItem
- `makeArmourItem()` — factory for blank CharacterArmourItem
- `makeGoldItem(amount)` — factory for gold inventory items
- `applyWeaponTemplateToItem()` — applies weapon catalog template to item
- `applyArmourTemplateToItem()` — applies armour catalog template to item
- `goldChunksForAmount()` — splits gold amount into 100gp-max items
- `refundItem()` — existing sell logic (to be generalized)

---

## Phase 4b: Remove "Weapons, Armour & Spells" Tab

**Do this only after Phase 4 is stable and parity-tested.**

The `activePage === 'asw'` page (accessible via "Weapons, Armour & Spells" tab button) provides:
- List of character's weapons with add/edit/remove
- List of character's armour with add/edit/remove
- (Spells section — check current state)

After Phase 4, all of this is available from the inventory page:
- Create weapon/armour via Add Item modal (kind picker → weapon/armour)
- Edit weapon/armour via item detail modal (already works, lines 3789-4000+)
- Remove via Drop or Sell buttons

### Changes:
- Remove `activePage === 'asw'` tab button from desktop layout (line ~2310) and mobile layout (line ~3539)
- Remove the ASW page section JSX (find the `activePage === 'asw' ?` conditional block)
- **Function audit after ASW removal:**
  - `updateWeaponRow()` / `updateArmourRow()` — **KEEP**: used by item detail modal for editing weapon/armour fields
  - `addWeaponRow()` / `addArmourRow()` — **KEEP**: used by the new Add Item modal when kind=weapon/armour
  - `removeWeaponRow()` / `removeArmourRow()` — **LIKELY DEAD CODE**: Drop button replaces these. Verify no other callers, then remove. If they have special logic beyond inventory removal (e.g., ensuring at least one weapon is equipped), port that logic to the Drop action.
- Remove the `useEffect` that redirects from ASW during guided creation (line ~1575)

### Parity checklist:
- [ ] Create blank weapon from inventory → same as addWeaponRow
- [ ] Select weapon template → applies catalog stats
- [ ] Edit damage, range, magic bonus → works in detail modal
- [ ] Class restrictions on weapon/armour templates → enforced in detail modal
- [ ] Create blank armour → same as addArmourRow
- [ ] Edit AC, magic bonus → works in detail modal
- [ ] Remove weapon/armour → Drop button in detail modal

---

## Verification

### Phase 4:
- Player clicks "+" on empty equipped slot → Add Item modal opens → creates general item → appears equipped
- Player clicks "+" on empty packed slot → creates packed item
- Player selects "weapon" kind → weapon fields appear → saves → proper CharacterWeaponItem created
- Player drops item → ConfirmModal → item removed from inventory → appears in ItemsTab Dropped filter
- Player sells item → ConfirmModal → item removed → gold added to inventory
- Slot counting: one inventory object = 1 slot always, regardless of `qty`. `qty` is units-in-bundle, not slots.
- GM can also use all these actions on any character

### Phase 4b:
- ASW tab button is gone from both desktop and mobile
- All weapon/armour creation and editing works from inventory page
- No TypeScript errors
- Guided creation flow unaffected (ASW was already hidden during guided creation)

## Files Modified

| File | Action |
|------|--------|
| `src/features/character/CharacterTab.tsx` | Replace text inputs with "+" buttons, Add Item modal, drop/sell actions, generalize refundItem, remove ASW tab (4b) |
| `src/features/items/itemConversion.ts` | Add `inventoryItemToCampaignItem()` reverse mapping |
| `firestore.rules` | Add player create rule for dropped items |
