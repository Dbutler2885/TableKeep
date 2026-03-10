# Unified Item System — Master Plan

## Context

The app has three item models that grew independently: `ItemRecord` (GM item editor, **local state only — no Firestore**), `CharacterInventoryItem` (character-owned items, persisted), and `StoreItem` (hardcoded PHB catalog). The core problems:

- **ItemsTab is a dead end** — GM creates items that vanish on reload and can't be given to players
- **Players can't create ad-hoc items** outside of character creation store or weapon/armour tabs
- **No item transfer** — no drop, sell (outside creation), trade, or GM grant
- **Items are permanently bound** to one character's inventory array with no movement operations

**Goal:** One unified item lifecycle where all roads end in `CharacterInventoryItem` instances. Multiple creation sources (GM, store, player ad-hoc). Items are transferable between characters.

## Architecture Decisions

**Items stay embedded in `details.inventory[]`** — the existing sync (debounced writes, clobbering guards, bidirectional seed/persist) works well. No need for a campaign-level item-instance collection.

**GM-authored items get Firestore persistence** as templates at `campaigns/{id}/items/{itemId}`. These are blueprints that get stamped into `CharacterInventoryItem` instances when granted/found.

**Store catalog stays hardcoded** — it's PHB reference data, not GM content.

**Use `runTransaction` for read-modify-write inventory operations** (grant, drop, accept transfer). These operations read a character's current inventory, modify it, and write back — `writeBatch` alone can't prevent lost updates if two writes race. `runTransaction` retries on conflict.

**Dropped items go to the campaign items collection** with a `status: 'dropped'` field. They appear in a "Dropped" filter tab in the ItemsTab sidebar alongside GM-authored items. This keeps dropped items visible and recoverable without a new Firestore collection.

**CampaignItem types match inventory kinds** — `CampaignItemType` is `'weapon' | 'armour' | 'ammunition' | 'general' | 'custom'` (no `'consumable'`/`'misc'`/`'armor'`). Fields are structured to match `CharacterInventoryItem` directly: `weaponStats` has `damageDiceCount`, `damageDiceSides`, `attackBonus`, `damageBonus`, `rangeShort/Medium/Long`, `twoHanded`; `armourStats` has `acBonus` and `armourType: 'body' | 'shield'`. Top-level `isMagic: boolean` and `qty: string` fields. Direct field copy on grant, no parsing needed.

**armourType modeling gap** — `CampaignItem.armourStats.armourType` exists (`'body' | 'shield'`) but `CharacterArmourItem` currently has no `armourType` field. On grant, `armourType` is intentionally dropped — it can be inferred from the armour catalog or added to inventory items later if combat needs it.

**Ammo-weapon auto-association deferred** — Players manually manage ammo for now. The `CharacterAmmunitionItem` type already exists with `qty`. Future ammo linking should not require a model refactor — just add an optional `compatibleWeaponIds` field to ammunition items when ready. The low-overhead selection UX (quick-pick compatible ammo when equipping ranged weapon) is not specified yet — to be designed when combat mechanics are built.

**Bundling/quantity policy:**
- **Slot counting rule**: one inventory object = 1 slot, always. `qty` means "how many units are in this bundle," not "how many slots." Capacity checks throughout (Add Item, accept transfer, equip) count objects, not units.
- Ammunition: one item object with `qty` (e.g., "Arrows, qty: 20" = 1 slot)
- General/custom items: optional `qty` field for bundling small consumables (e.g., 6 torches = 1 slot)
- Weapons and armour: always 1 per slot, no stacking
- Gold: 100gp per slot (existing model, `CharacterGoldItem.amount`)
- Stack split/merge: not implemented yet. Players create separate item objects to split. Merging is manual (delete one, update qty on other).
- Tiny items (rings, necklaces): ignored per "Unencumbering Items" section (already in UI, referee judgment)

**Firestore rules are phased** — Plan A sets GM-only write on `/items`. Plan C deliberately adds a player create rule scoped to `status === 'dropped'`. This is an intentional phase override, not an oversight.

**Granting is snapshot-based** — copying template data into a character inventory instance once. No live sync to template updates. GM can edit granted instances afterward.

**Transfer uses accept/decline** — Sender initiates, receiver gets a global notification (visible from any tab). Receiver can accept or decline. Accepted items land in packed inventory. Uses `pendingTransfers` Firestore collection. Transfer docs are deleted on resolution (accept or decline) — no status lifecycle, only `'pending'` exists as a stored state.

**Provenance for future loot** — `CampaignItem` dropped items carry `droppedByCharacterId`/`droppedByCharacterName`. When map-based loot is implemented, consider adding `droppedAt: { mapId, x, y }` and `pickedUpByCharacterId` fields. Not needed now but the model accommodates extension.

## Implementation Phases

Each phase has its own detailed plan:

| Plan | Phase | Summary | Depends on |
|------|-------|---------|------------|
| [Plan A](./01-plan-a-foundation.md) | 1+2 | Persist ItemsTab to Firestore + extend inventory types | — |
| [Plan B](./02-plan-b-gm-grant.md) | 3 | GM grant item to character flow | Plan A |
| [Plan C](./03-plan-c-player-items-ui.md) | 4+4b | Player ad-hoc item creation, drop/sell, ASW tab removal | Plan A |
| [Plan D](./04-plan-d-transfers.md) | 5 | Item transfer between characters with accept/decline | Plans A + C |

Plans B and C can be worked in parallel after Plan A lands.

## Critical Files (all phases)

| File | Changes |
|------|---------|
| `src/types/app.ts` | Add `CampaignItem`, `PendingTransfer` types; extend `CharacterInventoryItemBase` |
| `src/features/items/useItems.ts` | **New** — Firestore hook for campaign items |
| `src/features/items/ItemsTab.tsx` | Firestore persistence, Grant button, Dropped filter tab |
| `src/features/character/CharacterTab.tsx` | Add Item modal, drop/sell/give actions, remove ASW tab |
| `src/features/character/useCharacters.ts` | Pattern reference; expose character list for pickers |
| `src/features/transfers/usePendingTransfers.ts` | **New** — Firestore hook for pending transfers |
| `src/features/transfers/TransferNotification.tsx` | **New** — Global notification component |
| `src/App.tsx` | Pass `campaignId` to ItemsTab, mount TransferNotification |
| `firestore.rules` | Add `items` and `pendingTransfers` collection rules |

## Patterns to Reuse
- `useCharacters.ts` debounced write + onSnapshot + clobbering guard pattern → `useItems.ts`
- `ConfirmModal` for destructive actions (drop/sell)
- `EntityMediaEditor` already used in ItemsTab for portraits
- Existing weapon/armour edit forms in item detail modal → reuse as creation forms
- `applyWeaponTemplateToItem` / `applyArmourTemplateToItem` → reuse in `campaignItemToInventoryItem`
- `makeWeaponItem()` / `makeArmourItem()` factory functions → reuse in Add Item modal
