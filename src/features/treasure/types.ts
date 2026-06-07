export type OseTreasureTypeGroup = 'hoard' | 'individual' | 'group'

export type TreasureDice = {
  count: number
  sides: number
}

export type TreasureQuantity =
  | { type: 'fixed'; value: number }
  | { type: 'dice'; dice: TreasureDice; multiplier?: number }

export type MagicItemConstraint =
  | 'any'
  | 'excluding-weapons'
  | 'weapon-armour-or-sword'
  | 'potion-only'
  | 'scroll-only'

export type CoinDenomination = 'cp' | 'sp' | 'ep' | 'gp' | 'pp'

export type TreasureReward =
  | {
      kind: 'coins'
      denomination: CoinDenomination
      quantity: TreasureQuantity
    }
  | {
      kind: 'gems'
      quantity: TreasureQuantity
    }
  | {
      kind: 'jewellery'
      quantity: TreasureQuantity
    }
  | {
      kind: 'magic-items'
      quantity: TreasureQuantity
      constraint: MagicItemConstraint
    }
  | {
      kind: 'potions'
      quantity: TreasureQuantity
    }
  | {
      kind: 'scrolls'
      quantity: TreasureQuantity
    }

export type OseTreasureTypeEntry = {
  chance: number | null
  rewards: TreasureReward[]
  rawText: string
}

export type OseTreasureTypeRecord = {
  id: string
  code: string
  name: string
  group: OseTreasureTypeGroup
  averageValueGp: number
  entries: OseTreasureTypeEntry[]
  sourceUrl: string
}

// --- Gem & Jewellery value resolution ---

export type GemValueEntry = {
  minRoll: number
  maxRoll: number
  gpValue: number
}

export type JewelleryFormula = {
  dice: TreasureDice
  multiplier: number
}

export type RollRange = {
  min: number
  max: number
}

export type OseMagicArmourResultKind = 'armour' | 'shield' | 'armour-and-shield'

export type OseMagicArmourRow = {
  basicRoll: number | null
  expertRoll: RollRange
  resultKind: OseMagicArmourResultKind
  name: string
  rawText: string
  bonus?: number
  shieldBonus?: number
  cursed?: boolean
  baseAcOverride?: string
}

export type OseMagicArmourTypeRow = {
  range: RollRange
  armourType: 'Leather' | 'Chainmail' | 'Plate mail'
}

export type OseMagicArmourTable = {
  id: string
  name: string
  sourceUrl: string
  usage: string
  notes: string[]
  rows: OseMagicArmourRow[]
  armourTypeTable: OseMagicArmourTypeRow[]
}

export type OseMagicItemCategoryTableId =
  | 'ose-magic-armour'
  | 'ose-magic-misc'
  | 'ose-magic-potions'
  | 'ose-magic-rings'
  | 'ose-magic-rods-staves-wands'
  | 'ose-magic-scrolls-maps'
  | 'ose-magic-swords'
  | 'ose-magic-weapons'

export type OseMagicItemCategory = {
  id: OseMagicItemCategoryTableId
  label: string
  description: string
}

export type OseMagicItemTypeRow = {
  basicRoll: RollRange
  expertRoll: RollRange
  label: string
  categoryTableId: OseMagicItemCategoryTableId
}

export type OseMagicItemTypeTable = {
  id: string
  name: string
  sourceUrl: string
  categories: OseMagicItemCategory[]
  rollNotes: string[]
  levelNotes: string[]
  usageNotes: string[]
  rows: OseMagicItemTypeRow[]
}

export type OseMagicCategoryTableId =
  | 'ose-magic-misc'
  | 'ose-magic-potions'
  | 'ose-magic-rings'
  | 'ose-magic-rods-staves-wands'
  | 'ose-magic-scrolls-maps'
  | 'ose-magic-swords'
  | 'ose-magic-weapons'

export type OseMagicCategoryRow = {
  basicRoll: number | null
  expertRoll: RollRange
  name: string
  rawText: string
  bonus?: number
  variant?: string
  rangeText?: string
  element?: 'Air' | 'Earth' | 'Fire' | 'Water'
  harmful?: boolean
  cursed?: boolean
  charges?: string
  quantityText?: string
  usageFrequency?: string
  specialVs?: string
}

export type OseMagicCategoryTable = {
  id: OseMagicCategoryTableId
  name: string
  sourceUrl: string
  usage: string
  notes: string[]
  rows: OseMagicCategoryRow[]
}

export type OseMagicScrollMapMainRow = {
  basicRoll: number | null
  expertRoll: RollRange
  name: string
  rawText: string
  harmful?: boolean
}

export type OseRandomScrollSpellLevelRow = {
  basicRoll: RollRange | null
  expertRoll: RollRange
  arcaneLevel: number
  divineLevel: number
}

export type OseTreasureMapRow = {
  mapCode: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII' | 'VIII' | 'IX' | 'X' | 'XI' | 'XII'
  result: string
}

export type OseMagicScrollsMapsTable = {
  id: 'ose-magic-scrolls-maps'
  name: string
  sourceUrl: string
  usage: string
  notes: string[]
  cursedScrollNotes: string[]
  protectionScrollNotes: string[]
  spellScrollNotes: string[]
  treasureMapNotes: string[]
  mainRows: OseMagicScrollMapMainRow[]
  randomSpellLevelRows: OseRandomScrollSpellLevelRow[]
  treasureMapRows: OseTreasureMapRow[]
}
