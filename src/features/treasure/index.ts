export type {
  CoinDenomination,
  GemValueEntry,
  JewelleryFormula,
  OseMagicCategoryRow,
  OseMagicCategoryTable,
  OseMagicCategoryTableId,
  OseMagicItemCategory,
  OseMagicItemCategoryTableId,
  OseMagicScrollMapMainRow,
  OseMagicScrollsMapsTable,
  OseRandomScrollSpellLevelRow,
  OseTreasureMapRow,
  OseMagicItemTypeRow,
  OseMagicItemTypeTable,
  MagicItemConstraint,
  OseMagicArmourResultKind,
  OseMagicArmourRow,
  OseMagicArmourTable,
  OseMagicArmourTypeRow,
  OseTreasureTypeEntry,
  OseTreasureTypeGroup,
  OseTreasureTypeRecord,
  RollRange,
  TreasureDice,
  TreasureQuantity,
  TreasureReward,
} from './types'

export { OSE_TREASURE_TYPES } from './generatedOseTreasureTypes'
export { OSE_MAGIC_ARMOUR_TABLE } from './oseMagicArmour'
export { OSE_MAGIC_ITEM_TYPE_TABLE } from './oseMagicItemsGeneral'
export { OSE_MAGIC_MISC_TABLE } from './oseMagicMisc'
export { OSE_MAGIC_POTIONS_TABLE } from './oseMagicPotions'
export { OSE_MAGIC_RINGS_TABLE } from './oseMagicRings'
export { OSE_MAGIC_RODS_STAVES_WANDS_TABLE } from './oseMagicRodsStavesWands'
export { OSE_MAGIC_SCROLLS_MAPS_TABLE } from './oseMagicScrollsMaps'
export { OSE_MAGIC_SWORDS_TABLE } from './oseMagicSwords'
export { OSE_MAGIC_WEAPONS_TABLE } from './oseMagicWeapons'

import { OSE_TREASURE_TYPES } from './generatedOseTreasureTypes'
import type { GemValueEntry, JewelleryFormula } from './types'

export const oseTreasureTypeByCode = OSE_TREASURE_TYPES.reduce<Record<string, (typeof OSE_TREASURE_TYPES)[number]>>((acc, record) => {
  acc[record.code] = record
  return acc
}, {})

// --- Gem value table (OSE SRD: Gems and Jewellery) ---
// Roll 1d20 per gem to determine GP value.

export const OSE_GEM_VALUE_TABLE: GemValueEntry[] = [
  { minRoll: 1, maxRoll: 4, gpValue: 10 },
  { minRoll: 5, maxRoll: 9, gpValue: 50 },
  { minRoll: 10, maxRoll: 15, gpValue: 100 },
  { minRoll: 16, maxRoll: 19, gpValue: 500 },
  { minRoll: 20, maxRoll: 20, gpValue: 1000 },
]

// --- Jewellery value formula (OSE SRD: Gems and Jewellery) ---
// Each piece of jewellery is worth 3d6 × 100gp.

export const OSE_JEWELLERY_FORMULA: JewelleryFormula = {
  dice: { count: 3, sides: 6 },
  multiplier: 100,
}
