export type OseArmourTemplate = {
  id: string
  name: string
  ac: string
  costGp: number
  weightCoins: number
  armourType: 'body' | 'shield'
}

export const OSE_ARMOUR_CATALOG: OseArmourTemplate[] = [
  { id: 'leather', name: 'Leather', ac: '7', costGp: 20, weightCoins: 200, armourType: 'body' },
  { id: 'chainmail', name: 'Chainmail', ac: '5', costGp: 40, weightCoins: 400, armourType: 'body' },
  { id: 'plate-mail', name: 'Plate mail', ac: '3', costGp: 60, weightCoins: 500, armourType: 'body' },
  { id: 'shield', name: 'Shield', ac: '+1 bonus', costGp: 10, weightCoins: 100, armourType: 'shield' },
]

export const armourCatalogById = Object.fromEntries(
  OSE_ARMOUR_CATALOG.map((armour) => [armour.id, armour]),
) as Record<string, OseArmourTemplate>
