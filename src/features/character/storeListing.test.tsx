// @vitest-environment jsdom
/**
 * The OSE store's list as a player sees it: every item each category shows,
 * with its id, name, cost in gp and kind. Recorded from the store as it stood
 * while it still imported its list from storeCatalog.ts, so a difference here
 * is a change to what the store sells, not a refactor.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useSelectedCharacterDerivations } from './hooks/useSelectedCharacterDerivations'
import { STORE_CATEGORY_LABELS, type StoreCategoryId } from './storeCatalog'

type RecordedItem = [id: string, name: string, costGp: number, kind: string]

const recordedStore: [StoreCategoryId, RecordedItem[]][] = [
  ['adventuring', [
    ['gear-crowbar', 'Crowbar', 10, 'general'],
    ['gear-grappling-hook', 'Grappling hook', 25, 'general'],
    ['gear-hammer', 'Hammer (small)', 2, 'general'],
    ['gear-holy-symbol', 'Holy symbol', 25, 'general'],
    ['gear-iron-spikes', 'Iron spikes (12)', 1, 'consumable'],
    ['gear-lantern', 'Lantern', 10, 'general'],
    ['gear-mirror', 'Mirror (steel)', 5, 'general'],
    ['gear-pole', 'Pole (10 ft)', 1, 'general'],
    ['gear-rope', 'Rope (50 ft)', 1, 'general'],
    ['gear-stakes-mallet', 'Stakes (3) + mallet', 3, 'general'],
    ['gear-thieves-tools', "Thieves' tools", 25, 'general'],
    ['gear-tinderbox', 'Tinder box', 3, 'general'],
    ['gear-waterskin', 'Waterskin', 1, 'general'],
  ]],
  ['consumables', [
    ['gear-garlic', 'Garlic', 5, 'consumable'],
    ['gear-holy-water', 'Holy water (vial)', 25, 'consumable'],
    ['gear-oil', 'Oil (1 flask)', 2, 'consumable'],
    ['gear-rations-iron', 'Rations (iron, 7 days)', 15, 'consumable'],
    ['gear-rations-standard', 'Rations (standard, 7 days)', 5, 'consumable'],
    ['gear-torches', 'Torches (6)', 1, 'consumable'],
    ['gear-wine', 'Wine (2 pints)', 1, 'consumable'],
    ['gear-wolfsbane', 'Wolfsbane', 10, 'consumable'],
  ]],
  ['weapons', [
    ['wpn-battle-axe', 'Battle axe', 7, 'weapon'],
    ['wpn-club', 'Club', 3, 'weapon'],
    ['wpn-crossbow', 'Crossbow', 30, 'weapon'],
    ['wpn-dagger', 'Dagger', 3, 'weapon'],
    ['wpn-hand-axe', 'Hand axe', 4, 'weapon'],
    ['wpn-holy-water', 'Holy water (vial)', 25, 'weapon'],
    ['wpn-javelin', 'Javelin', 1, 'weapon'],
    ['wpn-lance', 'Lance', 5, 'weapon'],
    ['wpn-long-bow', 'Long bow', 40, 'weapon'],
    ['wpn-mace', 'Mace', 5, 'weapon'],
    ['wpn-oil', 'Oil (flask), burning', 2, 'weapon'],
    ['wpn-pole-arm', 'Pole arm', 7, 'weapon'],
    ['wpn-short-bow', 'Short bow', 25, 'weapon'],
    ['wpn-short-sword', 'Short sword', 7, 'weapon'],
    ['wpn-silver-dagger', 'Silver dagger', 30, 'weapon'],
    ['wpn-sling', 'Sling', 2, 'weapon'],
    ['wpn-spear', 'Spear', 3, 'weapon'],
    ['wpn-staff', 'Staff', 2, 'weapon'],
    ['wpn-sword', 'Sword', 10, 'weapon'],
    ['wpn-torch', 'Torch', 1, 'weapon'],
    ['wpn-two-handed-sword', 'Two-handed sword', 15, 'weapon'],
    ['wpn-war-hammer', 'War hammer', 5, 'weapon'],
  ]],
  ['ammunition', [
    ['ammo-arrows', 'Arrows (20)', 5, 'ammunition'],
    ['ammo-bolts', 'Crossbow bolts (30)', 10, 'ammunition'],
    ['ammo-silver-arrow', 'Silver tipped arrow (1)', 5, 'ammunition'],
    ['ammo-sling-stones', 'Sling stones', 0, 'ammunition'],
  ]],
  ['armour', [
    ['arm-leather', 'Leather', 20, 'armour'],
    ['arm-chainmail', 'Chainmail', 40, 'armour'],
    ['arm-plate', 'Plate mail', 60, 'armour'],
    ['arm-shield', 'Shield', 10, 'armour'],
  ]],
  ['other', [
    ['other-custom', 'Custom equipment', 0, 'general'],
  ]],
]

// The items the store lists while the given category is open.
const listedItems = (storeCategory: StoreCategoryId) => {
  const { result } = renderHook(() => useSelectedCharacterDerivations({
    effectiveSelected: null,
    abilityScoresByCharacterId: {},
    rolledAbilityScoresByCharacterId: {},
    abilityScoresRolledByCharacterId: {},
    inventoryByCharacterId: {},
    startingGoldByCharacterId: {},
    storeCartByCharacterId: {},
    storeSpentByCharacterId: {},
    thacoByCharacterId: {},
    saveScoresByCharacterId: {},
    adventureScoresByCharacterId: {},
    thiefSkillsByCharacterId: {},
    outgoingTransfers: [],
    goldSpendAmount: '',
    storeCategory,
    isInFinalizationFlow: false,
  }))
  return result.current.visibleStoreItems
}

afterEach(() => {
  cleanup()
})

describe('the OSE store list', () => {
  it('offers the recorded categories, in order', () => {
    expect(Object.keys(STORE_CATEGORY_LABELS)).toEqual(recordedStore.map(([category]) => category))
  })

  it.each(recordedStore)('lists the recorded %s items, with their prices', (category, items) => {
    expect(listedItems(category).map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      costGp: item.costGp,
      kind: item.kind,
    }))).toEqual(items.map(([id, name, costGp, kind]) => ({ id, name, category, costGp, kind })))
  })
})
