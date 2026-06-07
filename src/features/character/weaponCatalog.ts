export type WeaponCatalogEntry = {
  id: string
  name: string
  costGp: string
  weightCoins: string
  damage: string
  range: string
  qualities: string[]
  twoHanded: boolean
}

export const OSE_WEAPON_CATALOG: WeaponCatalogEntry[] = [
  { id: 'battle-axe', name: 'Battle axe', costGp: '7', weightCoins: '50', damage: '1d8', range: '', qualities: ['Melee', 'Slow', 'Two-handed'], twoHanded: true },
  { id: 'club', name: 'Club', costGp: '3', weightCoins: '50', damage: '1d4', range: '', qualities: ['Blunt', 'Melee'], twoHanded: false },
  { id: 'crossbow', name: 'Crossbow', costGp: '30', weightCoins: '50', damage: '1d6', range: '5-80 / 81-160 / 161-240', qualities: ['Missile', 'Reload', 'Slow', 'Two-handed'], twoHanded: true },
  { id: 'dagger', name: 'Dagger', costGp: '3', weightCoins: '10', damage: '1d4', range: '5-10 / 11-20 / 21-30', qualities: ['Melee', 'Missile'], twoHanded: false },
  { id: 'hand-axe', name: 'Hand axe', costGp: '4', weightCoins: '30', damage: '1d6', range: '5-10 / 11-20 / 21-30', qualities: ['Melee', 'Missile'], twoHanded: false },
  { id: 'holy-water-vial', name: 'Holy water (vial)', costGp: '25', weightCoins: '-', damage: '1d8', range: '5-10 / 11-30 / 31-50', qualities: ['Missile', 'Splash weapon'], twoHanded: false },
  { id: 'javelin', name: 'Javelin', costGp: '1', weightCoins: '20', damage: '1d4', range: '5-30 / 31-60 / 61-90', qualities: ['Missile'], twoHanded: false },
  { id: 'lance', name: 'Lance', costGp: '5', weightCoins: '120', damage: '1d6', range: '', qualities: ['Charge', 'Melee'], twoHanded: false },
  { id: 'long-bow', name: 'Long bow', costGp: '40', weightCoins: '30', damage: '1d6', range: '5-70 / 71-140 / 141-210', qualities: ['Missile', 'Two-handed'], twoHanded: true },
  { id: 'mace', name: 'Mace', costGp: '5', weightCoins: '30', damage: '1d6', range: '', qualities: ['Blunt', 'Melee'], twoHanded: false },
  { id: 'oil-flask', name: 'Oil (flask), burning', costGp: '2', weightCoins: '-', damage: '1d8', range: '5-10 / 11-30 / 31-50', qualities: ['Missile', 'Splash weapon'], twoHanded: false },
  { id: 'pole-arm', name: 'Pole arm', costGp: '7', weightCoins: '150', damage: '1d10', range: '', qualities: ['Brace', 'Melee', 'Slow', 'Two-handed'], twoHanded: true },
  { id: 'short-bow', name: 'Short bow', costGp: '25', weightCoins: '30', damage: '1d6', range: '5-50 / 51-100 / 101-150', qualities: ['Missile', 'Two-handed'], twoHanded: true },
  { id: 'short-sword', name: 'Short sword', costGp: '7', weightCoins: '30', damage: '1d6', range: '', qualities: ['Melee'], twoHanded: false },
  { id: 'silver-dagger', name: 'Silver dagger', costGp: '30', weightCoins: '10', damage: '1d4', range: '5-10 / 11-20 / 21-30', qualities: ['Melee', 'Missile'], twoHanded: false },
  { id: 'sling', name: 'Sling', costGp: '2', weightCoins: '20', damage: '1d4', range: '5-40 / 41-80 / 81-160', qualities: ['Blunt', 'Missile'], twoHanded: false },
  { id: 'spear', name: 'Spear', costGp: '3', weightCoins: '30', damage: '1d6', range: '5-20 / 21-40 / 41-60', qualities: ['Brace', 'Melee', 'Missile'], twoHanded: false },
  { id: 'staff', name: 'Staff', costGp: '2', weightCoins: '40', damage: '1d4', range: '', qualities: ['Blunt', 'Melee', 'Slow', 'Two-handed'], twoHanded: true },
  { id: 'sword', name: 'Sword', costGp: '10', weightCoins: '60', damage: '1d8', range: '', qualities: ['Melee'], twoHanded: false },
  { id: 'torch', name: 'Torch', costGp: '1 (for 6)', weightCoins: '-', damage: '1d4', range: '', qualities: ['Melee'], twoHanded: false },
  { id: 'two-handed-sword', name: 'Two-handed sword', costGp: '15', weightCoins: '150', damage: '1d10', range: '', qualities: ['Melee', 'Slow', 'Two-handed'], twoHanded: true },
  { id: 'war-hammer', name: 'War hammer', costGp: '5', weightCoins: '30', damage: '1d6', range: '', qualities: ['Blunt', 'Melee'], twoHanded: false },
]

export const weaponCatalogById = Object.fromEntries(
  OSE_WEAPON_CATALOG.map((entry) => [entry.id, entry]),
) as Record<string, WeaponCatalogEntry>
