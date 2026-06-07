import type { ResolvedBlock } from '../../types/app'
import type {
  CoinDenomination,
  MagicItemConstraint,
  OseMagicArmourRow,
  OseMagicArmourTable,
  OseMagicCategoryRow,
  OseMagicCategoryTable,
  OseMagicItemCategoryTableId,
  OseMagicItemTypeRow,
  OseMagicScrollMapMainRow,
  OseMagicScrollsMapsTable,
  OseTreasureTypeRecord,
  RollRange,
  TreasureDice,
  TreasureQuantity,
  TreasureReward,
} from './types'
import { OSE_GEM_VALUE_TABLE, OSE_JEWELLERY_FORMULA } from './index'
import { OSE_MAGIC_ITEM_TYPE_TABLE } from './oseMagicItemsGeneral'
import { OSE_MAGIC_ARMOUR_TABLE } from './oseMagicArmour'
import { OSE_MAGIC_MISC_TABLE } from './oseMagicMisc'
import { OSE_MAGIC_POTIONS_TABLE } from './oseMagicPotions'
import { OSE_MAGIC_RINGS_TABLE } from './oseMagicRings'
import { OSE_MAGIC_RODS_STAVES_WANDS_TABLE } from './oseMagicRodsStavesWands'
import { OSE_MAGIC_SCROLLS_MAPS_TABLE } from './oseMagicScrollsMaps'
import { OSE_MAGIC_SWORDS_TABLE } from './oseMagicSwords'
import { OSE_MAGIC_WEAPONS_TABLE } from './oseMagicWeapons'

// --- RNG abstraction ---

export type RNG = () => number // returns [0, 1)

export const defaultRng: RNG = () => Math.random()

/** Roll a die: 1 to sides inclusive */
export function rollDie(sides: number, rng: RNG = defaultRng): number {
  return Math.floor(rng() * sides) + 1
}

/** Roll count dice of given sides, return total */
export function rollDice(dice: TreasureDice, rng: RNG = defaultRng): number {
  let total = 0
  for (let i = 0; i < dice.count; i++) {
    total += rollDie(dice.sides, rng)
  }
  return total
}

/** Resolve a TreasureQuantity to a concrete number */
export function resolveQuantity(qty: TreasureQuantity, rng: RNG = defaultRng): number {
  if (qty.type === 'fixed') return qty.value
  return rollDice(qty.dice, rng) * (qty.multiplier ?? 1)
}

/** Check if a percentage chance succeeds (1-100 roll) */
function checkChance(chance: number | null, rng: RNG): boolean {
  if (chance === null) return true // guaranteed (individual treasure types)
  return rollDie(100, rng) <= chance
}

// --- Gem & Jewellery resolution ---

function resolveGemValue(rng: RNG): number {
  const roll = rollDie(20, rng)
  for (const entry of OSE_GEM_VALUE_TABLE) {
    if (roll >= entry.minRoll && roll <= entry.maxRoll) return entry.gpValue
  }
  return 100 // fallback
}

function resolveJewelleryValue(rng: RNG): number {
  return rollDice(OSE_JEWELLERY_FORMULA.dice, rng) * OSE_JEWELLERY_FORMULA.multiplier
}

// --- Magic item resolution ---

const CATEGORY_TABLE_MAP: Record<string, OseMagicCategoryTable | OseMagicArmourTable | OseMagicScrollsMapsTable> = {
  'ose-magic-armour': OSE_MAGIC_ARMOUR_TABLE,
  'ose-magic-misc': OSE_MAGIC_MISC_TABLE,
  'ose-magic-potions': OSE_MAGIC_POTIONS_TABLE,
  'ose-magic-rings': OSE_MAGIC_RINGS_TABLE,
  'ose-magic-rods-staves-wands': OSE_MAGIC_RODS_STAVES_WANDS_TABLE,
  'ose-magic-scrolls-maps': OSE_MAGIC_SCROLLS_MAPS_TABLE,
  'ose-magic-swords': OSE_MAGIC_SWORDS_TABLE,
  'ose-magic-weapons': OSE_MAGIC_WEAPONS_TABLE,
}

function rollInRange(roll: number, range: RollRange): boolean {
  return roll >= range.min && roll <= range.max
}

/** Roll on the magic item type table to get a category, then roll on that category table */
function resolveMagicItemCategory(constraint: MagicItemConstraint, rng: RNG): OseMagicItemCategoryTableId {
  // Specific constraints bypass the type table
  if (constraint === 'potion-only') return 'ose-magic-potions'
  if (constraint === 'scroll-only') return 'ose-magic-scrolls-maps'

  // Roll on the type table (using expert probabilities)
  const roll = rollDie(100, rng)
  let matchedRow: OseMagicItemTypeRow | undefined

  for (const row of OSE_MAGIC_ITEM_TYPE_TABLE.rows) {
    if (rollInRange(roll, row.expertRoll)) {
      matchedRow = row
      break
    }
  }

  if (!matchedRow) {
    // Fallback to potions
    return 'ose-magic-potions'
  }

  const catId = matchedRow.categoryTableId

  // Apply constraint filtering
  if (constraint === 'excluding-weapons') {
    if (catId === 'ose-magic-swords' || catId === 'ose-magic-weapons') {
      // Re-roll excluding weapons — try up to 10 times then fallback
      return resolveMagicItemCategory(constraint, rng)
    }
  }

  if (constraint === 'weapon-armour-or-sword') {
    if (catId === 'ose-magic-swords' || catId === 'ose-magic-weapons' || catId === 'ose-magic-armour') {
      return catId
    }
    // Not a valid category for this constraint — re-roll
    return resolveMagicItemCategory(constraint, rng)
  }

  return catId
}

function resolveFromArmourTable(table: OseMagicArmourTable, rng: RNG): { name: string; category: string } {
  const roll = rollDie(100, rng)
  let row: OseMagicArmourRow | undefined
  for (const r of table.rows) {
    if (rollInRange(roll, r.expertRoll)) { row = r; break }
  }
  if (!row) return { name: 'Armour +1', category: 'Armour or Shield' }

  // If it's armour (not just shield), also roll armour type
  let name = row.name
  if (row.resultKind === 'armour' || row.resultKind === 'armour-and-shield') {
    const typeRoll = rollDie(8, rng)
    for (const t of table.armourTypeTable) {
      if (rollInRange(typeRoll, t.range)) {
        name = `${t.armourType} ${name}`
        break
      }
    }
  }

  return { name, category: 'Armour or Shield' }
}

function resolveFromScrollsTable(table: OseMagicScrollsMapsTable, rng: RNG): { name: string; category: string } {
  const roll = rollDie(100, rng)
  let row: OseMagicScrollMapMainRow | undefined
  for (const r of table.mainRows) {
    if (rollInRange(roll, r.expertRoll)) { row = r; break }
  }
  if (!row) return { name: 'Scroll (1 Spell)', category: 'Scroll or Map' }
  return { name: row.name, category: 'Scroll or Map' }
}

function resolveFromCategoryTable(table: OseMagicCategoryTable, rng: RNG): { name: string; category: string } {
  const roll = rollDie(100, rng)
  let row: OseMagicCategoryRow | undefined
  for (const r of table.rows) {
    if (rollInRange(roll, r.expertRoll)) { row = r; break }
  }
  if (!row) return { name: table.name, category: table.name }
  return { name: row.name, category: table.name }
}

function resolveMagicItem(constraint: MagicItemConstraint, rng: RNG): ResolvedBlock & { type: 'magicItem' } {
  const categoryId = resolveMagicItemCategory(constraint, rng)
  const table = CATEGORY_TABLE_MAP[categoryId]

  let result: { name: string; category: string }

  if (categoryId === 'ose-magic-armour') {
    result = resolveFromArmourTable(table as OseMagicArmourTable, rng)
  } else if (categoryId === 'ose-magic-scrolls-maps') {
    result = resolveFromScrollsTable(table as OseMagicScrollsMapsTable, rng)
  } else {
    result = resolveFromCategoryTable(table as OseMagicCategoryTable, rng)
  }

  return {
    type: 'magicItem',
    category: result.category,
    name: result.name,
    catalogRef: categoryId,
  }
}

// --- Reward resolution ---

function resolveReward(reward: TreasureReward, rng: RNG): ResolvedBlock[] {
  const results: ResolvedBlock[] = []

  switch (reward.kind) {
    case 'coins': {
      const amount = resolveQuantity(reward.quantity, rng)
      if (amount > 0) {
        results.push({ type: 'coins', denomination: reward.denomination, amount })
      }
      break
    }

    case 'gems': {
      const count = resolveQuantity(reward.quantity, rng)
      for (let i = 0; i < count; i++) {
        const gpValue = resolveGemValue(rng)
        results.push({ type: 'treasure', subtype: 'gem', gpValue })
      }
      break
    }

    case 'jewellery': {
      const count = resolveQuantity(reward.quantity, rng)
      for (let i = 0; i < count; i++) {
        const gpValue = resolveJewelleryValue(rng)
        results.push({ type: 'treasure', subtype: 'jewellery', gpValue })
      }
      break
    }

    case 'magic-items': {
      const count = resolveQuantity(reward.quantity, rng)
      for (let i = 0; i < count; i++) {
        results.push(resolveMagicItem(reward.constraint, rng))
      }
      break
    }

    case 'potions': {
      const count = resolveQuantity(reward.quantity, rng)
      for (let i = 0; i < count; i++) {
        results.push(resolveMagicItem('potion-only', rng))
      }
      break
    }

    case 'scrolls': {
      const count = resolveQuantity(reward.quantity, rng)
      for (let i = 0; i < count; i++) {
        results.push(resolveMagicItem('scroll-only', rng))
      }
      break
    }
  }

  return results
}

// --- Main entry point ---

/**
 * Roll a complete treasure type (A-V), resolving all entries and nested sub-rolls.
 * Returns an array of ResolvedBlocks for display and history storage.
 */
export function rollTreasureType(
  record: OseTreasureTypeRecord,
  rng: RNG = defaultRng,
): ResolvedBlock[] {
  const results: ResolvedBlock[] = []

  for (const entry of record.entries) {
    if (!checkChance(entry.chance, rng)) continue

    for (const reward of entry.rewards) {
      results.push(...resolveReward(reward, rng))
    }
  }

  // If nothing was found (all chances failed), add a text block
  if (results.length === 0) {
    results.push({ type: 'text', content: 'No treasure found.' })
  }

  return results
}

// --- Coin denomination helpers ---

const DENOMINATION_ORDER: CoinDenomination[] = ['pp', 'gp', 'ep', 'sp', 'cp']

/** OSE exchange rates: 1pp=5gp, 1gp=1gp, 1ep=0.5gp, 1sp=0.1gp, 1cp=0.01gp */
const GP_EXCHANGE_RATE: Record<CoinDenomination, number> = {
  pp: 5,
  gp: 1,
  ep: 0.5,
  sp: 0.1,
  cp: 0.01,
}

/** Convert a coin amount to its GP equivalent */
export function coinsToGp(denomination: CoinDenomination, amount: number): number {
  return amount * GP_EXCHANGE_RATE[denomination]
}

/** Group coin blocks by denomination, summing amounts */
export function consolidateCoins(blocks: ResolvedBlock[]): ResolvedBlock[] {
  const coinTotals = new Map<CoinDenomination, number>()
  const nonCoins: ResolvedBlock[] = []

  for (const block of blocks) {
    if (block.type === 'coins') {
      coinTotals.set(block.denomination, (coinTotals.get(block.denomination) ?? 0) + block.amount)
    } else {
      nonCoins.push(block)
    }
  }

  const consolidatedCoins: ResolvedBlock[] = []
  for (const denom of DENOMINATION_ORDER) {
    const amount = coinTotals.get(denom)
    if (amount && amount > 0) {
      consolidatedCoins.push({ type: 'coins', denomination: denom, amount })
    }
  }

  return [...consolidatedCoins, ...nonCoins]
}

/** Group gems by value and jewellery by value, returning summary blocks */
export function summarizeTreasureBlocks(blocks: ResolvedBlock[]): {
  coins: Array<ResolvedBlock & { type: 'coins' }>
  gems: Array<{ gpValue: number; count: number }>
  jewellery: Array<{ gpValue: number; count: number }>
  magicItems: Array<ResolvedBlock & { type: 'magicItem' }>
  other: ResolvedBlock[]
} {
  const coins: Array<ResolvedBlock & { type: 'coins' }> = []
  const gemMap = new Map<number, number>()
  const jewelleryMap = new Map<number, number>()
  const magicItems: Array<ResolvedBlock & { type: 'magicItem' }> = []
  const other: ResolvedBlock[] = []

  for (const block of blocks) {
    switch (block.type) {
      case 'coins':
        coins.push(block)
        break
      case 'treasure':
        if (block.subtype === 'gem') {
          gemMap.set(block.gpValue, (gemMap.get(block.gpValue) ?? 0) + 1)
        } else {
          jewelleryMap.set(block.gpValue, (jewelleryMap.get(block.gpValue) ?? 0) + 1)
        }
        break
      case 'magicItem':
        magicItems.push(block)
        break
      default:
        other.push(block)
    }
  }

  const gems = Array.from(gemMap.entries())
    .sort(([a], [b]) => b - a)
    .map(([gpValue, count]) => ({ gpValue, count }))

  const jewellery = Array.from(jewelleryMap.entries())
    .sort(([a], [b]) => b - a)
    .map(([gpValue, count]) => ({ gpValue, count }))

  return { coins, gems, jewellery, magicItems, other }
}
