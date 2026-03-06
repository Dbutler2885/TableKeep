export type OseArmourTemplate = {
  id: string
  name: string
  ac: string
  costGp: number
  weightCoins: number
}

export const OSE_ARMOUR_CATALOG: OseArmourTemplate[] = [
  { id: 'leather', name: 'Leather', ac: '7 [12]', costGp: 20, weightCoins: 200 },
  { id: 'chainmail', name: 'Chainmail', ac: '5 [14]', costGp: 40, weightCoins: 400 },
  { id: 'plate-mail', name: 'Plate mail', ac: '3 [16]', costGp: 60, weightCoins: 500 },
  { id: 'shield', name: 'Shield', ac: '+1 bonus', costGp: 10, weightCoins: 100 },
]

export const armourCatalogById = Object.fromEntries(
  OSE_ARMOUR_CATALOG.map((armour) => [armour.id, armour]),
) as Record<string, OseArmourTemplate>
