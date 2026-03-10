import type { ConsumableUseMode } from '../../types/app'

export type ConsumableCatalogEntry = {
  id: string
  name: string
  costGp: number
  description: string
  qty: number
  useMode: ConsumableUseMode
  effectText: string
}

export const OSE_CONSUMABLE_CATALOG: ConsumableCatalogEntry[] = [
  { id: 'con-garlic', name: 'Garlic', costGp: 5, description: 'A bunch of garlic.', qty: 1, useMode: 'consume', effectText: 'Repels vampires.' },
  { id: 'con-holy-water', name: 'Holy water (vial)', costGp: 25, description: 'Blessed vial; harms undead.', qty: 1, useMode: 'consume', effectText: '1d8 damage to undead (splash).' },
  { id: 'con-oil', name: 'Oil (1 flask)', costGp: 2, description: 'Lantern fuel; also throwable burning oil weapon.', qty: 1, useMode: 'consume', effectText: '' },
  { id: 'con-rations-iron', name: 'Rations (iron, 7 days)', costGp: 15, description: 'Preserved travel food.', qty: 7, useMode: 'consume', effectText: '' },
  { id: 'con-rations-standard', name: 'Rations (standard, 7 days)', costGp: 5, description: 'Fresh, unpreserved food.', qty: 7, useMode: 'consume', effectText: '' },
  { id: 'con-torches', name: 'Torches (6)', costGp: 1, description: '30 ft light radius; 1 hour burn each.', qty: 6, useMode: 'consume', effectText: '' },
  { id: 'con-wine', name: 'Wine (2 pints)', costGp: 1, description: 'Two pints of wine.', qty: 2, useMode: 'consume', effectText: '' },
  { id: 'con-wolfsbane', name: 'Wolfsbane', costGp: 10, description: 'Herb used to repel lycanthropes.', qty: 1, useMode: 'consume', effectText: 'Repels lycanthropes.' },
]

export const consumableCatalogById = Object.fromEntries(
  OSE_CONSUMABLE_CATALOG.map((entry) => [entry.id, entry]),
) as Record<string, ConsumableCatalogEntry>
