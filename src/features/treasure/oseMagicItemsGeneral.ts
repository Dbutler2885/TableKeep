import type { OseMagicItemTypeTable } from './types'

export const OSE_MAGIC_ITEM_TYPE_TABLE: OseMagicItemTypeTable = {
  id: 'ose-magic-item-type',
  name: 'Magic Item Type',
  sourceUrl: 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Magic_Items_(General)',
  categories: [
    {
      id: 'ose-magic-armour',
      label: 'Armour or Shield',
      description: 'Grant protective benefits to the user.',
    },
    {
      id: 'ose-magic-misc',
      label: 'Miscellaneous Item',
      description: 'Enchanted items that do not fit into any other category.',
    },
    {
      id: 'ose-magic-potions',
      label: 'Potion',
      description: 'Magical liquids stored in glass vials.',
    },
    {
      id: 'ose-magic-rings',
      label: 'Ring',
      description: 'Plain or bejewelled rings that place an enchantment about the wearer.',
    },
    {
      id: 'ose-magic-rods-staves-wands',
      label: 'Rod / Staff / Wand',
      description: 'Magical lengths used by spell casters to unleash magical effects.',
    },
    {
      id: 'ose-magic-scrolls-maps',
      label: 'Scroll or Map',
      description: 'Magical scrolls or treasure maps.',
    },
    {
      id: 'ose-magic-swords',
      label: 'Sword',
      description: 'Enchanted swords that grant combat bonuses and may have added powers.',
    },
    {
      id: 'ose-magic-weapons',
      label: 'Weapon',
      description: 'All enchanted weapons other than swords.',
    },
  ],
  rollNotes: [
    'If treasure specifies a type of magic item, roll directly on that category table.',
    'If the type is not specified, first roll on this Magic Item Type table, then roll on the resulting category table.',
  ],
  levelNotes: [
    'Basic probabilities are intended for characters of levels 1-3.',
    'Expert probabilities are intended for characters of level 4 or higher.',
    'The referee may always use Expert probabilities for an even distribution of magic items.',
  ],
  usageNotes: [
    'A magic item must be used, held, or worn after the normal fashion for that type of object.',
    'To activate most magic items, the user must concentrate and may take no other actions that round.',
    'Magic swords, weapons, armour, and protective items are always active and do not require concentration.',
    'A magic item effect can normally be used only once per round unless its description says otherwise.',
  ],
  rows: [
    {
      basicRoll: { min: 1, max: 10 },
      expertRoll: { min: 1, max: 10 },
      label: 'Armour or Shield',
      categoryTableId: 'ose-magic-armour',
    },
    {
      basicRoll: { min: 11, max: 15 },
      expertRoll: { min: 11, max: 15 },
      label: 'Miscellaneous Item',
      categoryTableId: 'ose-magic-misc',
    },
    {
      basicRoll: { min: 16, max: 40 },
      expertRoll: { min: 16, max: 35 },
      label: 'Potion',
      categoryTableId: 'ose-magic-potions',
    },
    {
      basicRoll: { min: 41, max: 45 },
      expertRoll: { min: 36, max: 40 },
      label: 'Ring',
      categoryTableId: 'ose-magic-rings',
    },
    {
      basicRoll: { min: 46, max: 50 },
      expertRoll: { min: 41, max: 45 },
      label: 'Rod / Staff / Wand',
      categoryTableId: 'ose-magic-rods-staves-wands',
    },
    {
      basicRoll: { min: 51, max: 70 },
      expertRoll: { min: 46, max: 75 },
      label: 'Scroll or Map',
      categoryTableId: 'ose-magic-scrolls-maps',
    },
    {
      basicRoll: { min: 71, max: 90 },
      expertRoll: { min: 76, max: 95 },
      label: 'Sword',
      categoryTableId: 'ose-magic-swords',
    },
    {
      basicRoll: { min: 91, max: 100 },
      expertRoll: { min: 96, max: 100 },
      label: 'Weapon',
      categoryTableId: 'ose-magic-weapons',
    },
  ],
}
