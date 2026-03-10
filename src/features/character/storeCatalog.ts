export type StoreCategoryId = 'adventuring' | 'consumables' | 'weapons' | 'ammunition' | 'armour' | 'other'

export type StoreItem = {
  id: string
  category: StoreCategoryId
  name: string
  costGp: number
  description: string
  kind: 'general' | 'weapon' | 'ammunition' | 'armour' | 'consumable'
  weaponId?: string
  armourId?: string
  armourType?: 'body' | 'shield'
}

export const STORE_CATEGORY_LABELS: Record<StoreCategoryId, string> = {
  adventuring: 'Adventuring Gear',
  consumables: 'Consumables',
  weapons: 'Weapons',
  ammunition: 'Ammunition',
  armour: 'Armour',
  other: 'Other',
}

export const OSE_STORE_ITEMS: StoreItem[] = [
  { id: 'gear-crowbar', category: 'adventuring', name: 'Crowbar', costGp: 10, description: '2-3 ft iron bar for prying doors/chests.', kind: 'general' },
  { id: 'gear-garlic', category: 'consumables', name: 'Garlic', costGp: 5, description: 'A bunch of garlic.', kind: 'consumable' },
  { id: 'gear-grappling-hook', category: 'adventuring', name: 'Grappling hook', costGp: 25, description: 'Iron 3-4 hook anchor ring for rope.', kind: 'general' },
  { id: 'gear-hammer', category: 'adventuring', name: 'Hammer (small)', costGp: 2, description: 'Useful for spikes and tapping stonework.', kind: 'general' },
  { id: 'gear-holy-symbol', category: 'adventuring', name: 'Holy symbol', costGp: 25, description: 'Required for divine powers and rituals.', kind: 'general' },
  { id: 'gear-holy-water', category: 'consumables', name: 'Holy water (vial)', costGp: 25, description: 'Blessed vial; harms undead.', kind: 'consumable' },
  { id: 'gear-iron-spikes', category: 'adventuring', name: 'Iron spikes (12)', costGp: 1, description: 'Wedge doors, anchor ropes, etc.', kind: 'general' },
  { id: 'gear-lantern', category: 'adventuring', name: 'Lantern', costGp: 10, description: '30 ft light radius. Burns 1 oil flask / 4 hours.', kind: 'general' },
  { id: 'gear-mirror', category: 'adventuring', name: 'Mirror (steel)', costGp: 5, description: 'Hand-sized steel mirror for peeking and gaze attacks.', kind: 'general' },
  { id: 'gear-oil', category: 'consumables', name: 'Oil (1 flask)', costGp: 2, description: 'Lantern fuel; also throwable burning oil weapon.', kind: 'consumable' },
  { id: 'gear-pole', category: 'adventuring', name: 'Pole (10 ft)', costGp: 1, description: '2-inch wooden pole for poking/prodding.', kind: 'general' },
  { id: 'gear-rations-iron', category: 'consumables', name: 'Rations (iron, 7 days)', costGp: 15, description: 'Preserved travel food.', kind: 'consumable' },
  { id: 'gear-rations-standard', category: 'consumables', name: 'Rations (standard, 7 days)', costGp: 5, description: 'Fresh, unpreserved food.', kind: 'consumable' },
  { id: 'gear-rope', category: 'adventuring', name: 'Rope (50 ft)', costGp: 1, description: 'Holds up to three people + equipment.', kind: 'general' },
  { id: 'gear-stakes-mallet', category: 'adventuring', name: 'Stakes (3) + mallet', costGp: 3, description: 'Useful against vampires.', kind: 'general' },
  { id: 'gear-thieves-tools', category: 'adventuring', name: "Thieves' tools", costGp: 25, description: 'Lockpicking kit in compact case.', kind: 'general' },
  { id: 'gear-tinderbox', category: 'adventuring', name: 'Tinder box', costGp: 3, description: 'Flint/steel/tinder; 2-in-6 chance per round to light.', kind: 'general' },
  { id: 'gear-torches', category: 'consumables', name: 'Torches (6)', costGp: 1, description: '30 ft light radius; 1 hour burn each.', kind: 'consumable' },
  { id: 'gear-waterskin', category: 'adventuring', name: 'Waterskin', costGp: 1, description: 'Holds 2 pints (1 quart).', kind: 'general' },
  { id: 'gear-wine', category: 'consumables', name: 'Wine (2 pints)', costGp: 1, description: 'Two pints of wine.', kind: 'consumable' },
  { id: 'gear-wolfsbane', category: 'consumables', name: 'Wolfsbane', costGp: 10, description: 'Herb used to repel lycanthropes.', kind: 'consumable' },

  { id: 'wpn-battle-axe', category: 'weapons', name: 'Battle axe', costGp: 7, description: '1d8. Melee, Slow, Two-handed.', kind: 'weapon', weaponId: 'battle-axe' },
  { id: 'wpn-club', category: 'weapons', name: 'Club', costGp: 3, description: '1d4. Blunt, Melee.', kind: 'weapon', weaponId: 'club' },
  { id: 'wpn-crossbow', category: 'weapons', name: 'Crossbow', costGp: 30, description: '1d6. Missile, Reload, Slow, Two-handed.', kind: 'weapon', weaponId: 'crossbow' },
  { id: 'wpn-dagger', category: 'weapons', name: 'Dagger', costGp: 3, description: '1d4. Melee, Missile.', kind: 'weapon', weaponId: 'dagger' },
  { id: 'wpn-hand-axe', category: 'weapons', name: 'Hand axe', costGp: 4, description: '1d6. Melee, Missile.', kind: 'weapon', weaponId: 'hand-axe' },
  { id: 'wpn-holy-water', category: 'weapons', name: 'Holy water (vial)', costGp: 25, description: '1d8. Missile, Splash weapon.', kind: 'weapon', weaponId: 'holy-water-vial' },
  { id: 'wpn-javelin', category: 'weapons', name: 'Javelin', costGp: 1, description: '1d4. Missile.', kind: 'weapon', weaponId: 'javelin' },
  { id: 'wpn-lance', category: 'weapons', name: 'Lance', costGp: 5, description: '1d6. Charge, Melee.', kind: 'weapon', weaponId: 'lance' },
  { id: 'wpn-long-bow', category: 'weapons', name: 'Long bow', costGp: 40, description: '1d6. Missile, Two-handed.', kind: 'weapon', weaponId: 'long-bow' },
  { id: 'wpn-mace', category: 'weapons', name: 'Mace', costGp: 5, description: '1d6. Blunt, Melee.', kind: 'weapon', weaponId: 'mace' },
  { id: 'wpn-oil', category: 'weapons', name: 'Oil (flask), burning', costGp: 2, description: '1d8. Missile, Splash weapon.', kind: 'weapon', weaponId: 'oil-flask' },
  { id: 'wpn-pole-arm', category: 'weapons', name: 'Pole arm', costGp: 7, description: '1d10. Brace, Melee, Slow, Two-handed.', kind: 'weapon', weaponId: 'pole-arm' },
  { id: 'wpn-short-bow', category: 'weapons', name: 'Short bow', costGp: 25, description: '1d6. Missile, Two-handed.', kind: 'weapon', weaponId: 'short-bow' },
  { id: 'wpn-short-sword', category: 'weapons', name: 'Short sword', costGp: 7, description: '1d6. Melee.', kind: 'weapon', weaponId: 'short-sword' },
  { id: 'wpn-silver-dagger', category: 'weapons', name: 'Silver dagger', costGp: 30, description: '1d4. Melee, Missile.', kind: 'weapon', weaponId: 'silver-dagger' },
  { id: 'wpn-sling', category: 'weapons', name: 'Sling', costGp: 2, description: '1d4. Blunt, Missile.', kind: 'weapon', weaponId: 'sling' },
  { id: 'wpn-spear', category: 'weapons', name: 'Spear', costGp: 3, description: '1d6. Brace, Melee, Missile.', kind: 'weapon', weaponId: 'spear' },
  { id: 'wpn-staff', category: 'weapons', name: 'Staff', costGp: 2, description: '1d4. Blunt, Melee, Slow, Two-handed.', kind: 'weapon', weaponId: 'staff' },
  { id: 'wpn-sword', category: 'weapons', name: 'Sword', costGp: 10, description: '1d8. Melee.', kind: 'weapon', weaponId: 'sword' },
  { id: 'wpn-torch', category: 'weapons', name: 'Torch', costGp: 1, description: '1d4. Melee. (Price is for 6.)', kind: 'weapon', weaponId: 'torch' },
  { id: 'wpn-two-handed-sword', category: 'weapons', name: 'Two-handed sword', costGp: 15, description: '1d10. Melee, Slow, Two-handed.', kind: 'weapon', weaponId: 'two-handed-sword' },
  { id: 'wpn-war-hammer', category: 'weapons', name: 'War hammer', costGp: 5, description: '1d6. Blunt, Melee.', kind: 'weapon', weaponId: 'war-hammer' },

  { id: 'ammo-arrows', category: 'ammunition', name: 'Arrows (20)', costGp: 5, description: 'Quiver of 20 arrows.', kind: 'ammunition' },
  { id: 'ammo-bolts', category: 'ammunition', name: 'Crossbow bolts (30)', costGp: 10, description: 'Case of 30 bolts.', kind: 'ammunition' },
  { id: 'ammo-silver-arrow', category: 'ammunition', name: 'Silver tipped arrow (1)', costGp: 5, description: 'Single silver-tipped arrow.', kind: 'ammunition' },
  { id: 'ammo-sling-stones', category: 'ammunition', name: 'Sling stones', costGp: 0, description: 'Common stones, free.', kind: 'ammunition' },

  { id: 'arm-leather', category: 'armour', name: 'Leather', costGp: 20, description: 'AC 7 [12].', kind: 'armour', armourId: 'leather', armourType: 'body' },
  { id: 'arm-chainmail', category: 'armour', name: 'Chainmail', costGp: 40, description: 'AC 5 [14].', kind: 'armour', armourId: 'chainmail', armourType: 'body' },
  { id: 'arm-plate', category: 'armour', name: 'Plate mail', costGp: 60, description: 'AC 3 [16].', kind: 'armour', armourId: 'plate-mail', armourType: 'body' },
  { id: 'arm-shield', category: 'armour', name: 'Shield', costGp: 10, description: '+1 AC bonus.', kind: 'armour', armourId: 'shield', armourType: 'shield' },

  {
    id: 'other-custom',
    category: 'other',
    name: 'Custom equipment',
    costGp: 0,
    description: 'For items not listed. Referee sets final price/characteristics.',
    kind: 'general',
  },
]
