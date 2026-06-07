export type ConsumableCatalogEntry = {
  id: string
  name: string
  costGp: number
  description: string
  qty: number
  effectText: string
  duration?: number
  fuelCapacity?: number
}

export const OSE_CONSUMABLE_CATALOG: ConsumableCatalogEntry[] = [
  { id: 'con-garlic', name: 'Garlic', costGp: 5, description: 'A bunch of garlic.', qty: 1, effectText: 'Repels vampires.' },
  { id: 'con-holy-water', name: 'Holy water', costGp: 25, description: 'Blessed vial; harms undead.', qty: 1, effectText: '1d8 damage to undead (splash).' },
  { id: 'con-iron-spikes', name: 'Iron spikes', costGp: 1, description: 'Wedge doors, anchor ropes, etc.', qty: 12, effectText: '' },
  { id: 'con-oil', name: 'Oil flask', costGp: 2, description: 'Lantern fuel; also throwable burning oil weapon.', qty: 1, effectText: '', fuelCapacity: 24 },
  { id: 'con-rations-iron', name: 'Iron rations', costGp: 15, description: 'Preserved travel food.', qty: 7, effectText: '' },
  { id: 'con-rations-standard', name: 'Standard rations', costGp: 5, description: 'Fresh, unpreserved food.', qty: 7, effectText: '' },
  { id: 'con-torches', name: 'Torches', costGp: 1, description: '30 ft light radius; 1 hour burn each.', qty: 6, effectText: '', duration: 6 },
  { id: 'con-wine', name: 'Wine', costGp: 1, description: 'Two pints of wine.', qty: 2, effectText: '' },
  { id: 'con-wolfsbane', name: 'Wolfsbane', costGp: 10, description: 'Herb used to repel lycanthropes.', qty: 1, effectText: 'Repels lycanthropes.' },
]

export const consumableCatalogById = Object.fromEntries(
  OSE_CONSUMABLE_CATALOG.map((entry) => [entry.id, entry]),
) as Record<string, ConsumableCatalogEntry>
