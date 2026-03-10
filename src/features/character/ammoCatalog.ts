export type AmmoCatalogEntry = {
  id: string
  name: string
  costGp: number
  description: string
  qty: number
}

export const OSE_AMMO_CATALOG: AmmoCatalogEntry[] = [
  { id: 'ammo-arrows', name: 'Arrows (20)', costGp: 5, description: 'Quiver of 20 arrows.', qty: 20 },
  { id: 'ammo-bolts', name: 'Crossbow bolts (30)', costGp: 10, description: 'Case of 30 bolts.', qty: 30 },
  { id: 'ammo-silver-arrow', name: 'Silver tipped arrow (1)', costGp: 5, description: 'Single silver-tipped arrow.', qty: 1 },
  { id: 'ammo-sling-stones', name: 'Sling stones', costGp: 0, description: 'Common stones, free.', qty: 20 },
]

export const ammoCatalogById = Object.fromEntries(
  OSE_AMMO_CATALOG.map((entry) => [entry.id, entry]),
) as Record<string, AmmoCatalogEntry>
