// The gear a Lubec character keeps on their own record, under `lubec.gear`.
// Only what a player chose or a roll decided is stored: every item and where
// it is, the personal carriers, the switched-off Speed losses, the supplies a
// player made and the backpack picture. The backpack itself, what is on you,
// and every loss and total are worked out when read, never stored.
//
// Items, carriers, overrides and supplies are arrays, never maps: a merge save
// replaces an array whole, but never removes a map's key, so an item taken off
// a map would stay stored. Every stored field the sheet does not model, at
// gear, item, carrier, pocket and supply level, is kept as stored. A modelled
// field that is missing or unreadable reads as its null case, never a made-up
// value.

type Fields = Record<string, unknown>

export type LubecItemKind = 'thing' | 'weapon' | 'armor' | 'consumable' | 'holder'
export type LubecItemSize = 0 | 1 | 2 | 4 | 8
export type LubecItemWeight = 'normal' | 'heavy' | 'extra'
export type LubecWoundKind = 'cut' | 'pierce' | 'blunt' | 'gun'

export type LubecItem = Fields & {
  id: string
  kind: LubecItemKind
  name: string
  /** The description, on every card and form. */
  note: string
  /** Slots; 0 is small stuff. */
  size: LubecItemSize
  weight: LubecItemWeight
  qty: number
  /** How many fit in one slot. */
  per?: number
  /** Stacks added together share one. */
  batch?: string
  /** 'backpack', 'hands', 'body', 'worn' or a carrier's id. */
  carrier: string
  /** Index into the carrier's pockets; null for small stuff. */
  pocket?: number | null
  /** 0 or 1, for hands and body. */
  slot?: number
  /** The main pocket's boxes the player arranged. */
  cells?: number[]
  /** The recorded Strength roll of a heavy or extra heavy item on you. */
  check?: 'pass' | 'fail'
  mode?: 'melee' | 'firearm' | 'thrown'
  impact?: number
  /** An optional override; the wound table follows the wound kind. */
  table?: string
  reach?: 'long' | 'short'
  wounds?: LubecWoundKind[]
  /** The weapon's handling threshold. */
  minStrength?: number
  /** Overrides the hands rule for a 1-slot thing that takes two hands. */
  hands?: 1 | 2
  handlePenaltyOverride?: number | null
  capacity?: number
  loaded?: number
  /** A supply's id. */
  takes?: string
  hold?: 'load' | 'fill' | 'box'
  /** 'head', 'torso', 'hand-L', 'hand-R' ... */
  locs?: string[]
  exclusive?: boolean
  armor?: Record<LubecWoundKind, number>
  /** The supply it is, when it is ammo or batteries. */
  fits?: string
  /** A drawing's key, or a kind icon's. */
  art?: string
  /** A Storage path; never a URL. */
  picturePath?: string
  shape?: 'tall' | 'wide' | 'square'
  /** The stock entry it was copied from. */
  stock?: string
}

/** A pocket: its name, how many slots it has, and the largest thing it takes. */
export type LubecPocket = Fields & { name: string; slots: number; max: number }

/** A personal carrier. Which kind a carrier is follows from where it is stored, so there is no flag for it. */
export type LubecCarrier = Fields & {
  id: string
  name: string
  /** A preset id, for the card's label. */
  type: string
  pockets: LubecPocket[]
  /** Carried by special dispensation. */
  carried?: boolean
}

/** A supply: what a firearm or holder takes. `loose` is [size, how many fit in one slot], or null when it cannot be loose. */
export type LubecSupply = Fields & { id: string; name: string; loose?: [size: number, per: number] | null }

export type LubecGear = Fields & {
  /** Every item on the character's own record: on you, and in personal carriers. */
  items: LubecItem[]
  /** The personal carriers. The backpack, hands, body and worn armor are built in and never stored. */
  carriers: LubecCarrier[]
  /** Keys of Speed losses the player switched off. */
  overrides: string[]
  /** Supplies a player made, beyond the game's list. */
  supplies: LubecSupply[]
  /** The backpack picture's short name. Missing or unknown means the default. Cleared by writing '', never by leaving it out. */
  backpackArt?: string
}

export const emptyLubecGear = (): LubecGear => ({ items: [], carriers: [], overrides: [], supplies: [] })

/** The places on you that every character has, and that are never stored as carriers. */
export const LUBEC_ON_YOU = ['backpack', 'hands', 'body', 'worn'] as const

const P = (name: string, slots: number, max: number): LubecPocket => ({ name, slots, max })

/** The backpack is the same for everyone: a main pocket of 5 up to size 4, and two front pockets of 1. */
export const LUBEC_BACKPACK_POCKETS: readonly LubecPocket[] = [
  P('Main pocket', 5, 4),
  P('Front pocket, left', 1, 1),
  P('Front pocket, right', 1, 1),
]

export const LUBEC_DEFAULT_BACKPACK_ART = 'navy-stripe'

type Check = (raw: unknown) => boolean

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const listOf = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : [])

const isText = (raw: unknown): raw is string => typeof raw === 'string'

const textOf = (raw: unknown): string => (isText(raw) ? raw : '')

const isWhole: Check = (raw) => Number.isInteger(raw)

const isCount: Check = (raw) => isWhole(raw) && (raw as number) >= 0

const isBoolean: Check = (raw) => typeof raw === 'boolean'

const oneOf = (values: readonly unknown[]): Check => (raw) => values.includes(raw)

const orNull = (check: Check): Check => (raw) => raw === null || check(raw)

const listOfAll = (check: Check): Check => (raw) => Array.isArray(raw) && raw.every(check)

const readOr = <T>(raw: unknown, check: Check, nullCase: T): T => (check(raw) ? raw as T : nullCase)

const WOUND_KINDS: readonly LubecWoundKind[] = ['cut', 'pierce', 'blunt', 'gun']

const isArmorValues: Check = (raw) => isRecord(raw) && WOUND_KINDS.every((kind) => isWhole(raw[kind]))

const isLoose: Check = (raw) => raw === null || (Array.isArray(raw) && raw.length === 2 && raw.every(isCount))

// The optional fields the record models, each with the test a stored value
// must pass to be read. One that fails reads as missing, its null case.
const ITEM_FIELD_CHECKS = new Map<string, Check>([
  ['per', (raw) => isCount(raw) && (raw as number) > 0],
  ['batch', isText],
  ['pocket', orNull(isCount)],
  ['slot', isCount],
  ['cells', listOfAll(isCount)],
  ['check', oneOf(['pass', 'fail'])],
  ['mode', oneOf(['melee', 'firearm', 'thrown'])],
  ['impact', isWhole],
  ['table', isText],
  ['reach', oneOf(['long', 'short'])],
  ['wounds', listOfAll(oneOf(WOUND_KINDS))],
  ['minStrength', isWhole],
  ['hands', oneOf([1, 2])],
  ['handlePenaltyOverride', orNull(isWhole)],
  ['capacity', isCount],
  ['loaded', isCount],
  ['takes', isText],
  ['hold', oneOf(['load', 'fill', 'box'])],
  ['locs', listOfAll(isText)],
  ['exclusive', isBoolean],
  ['armor', isArmorValues],
  ['fits', isText],
  ['art', isText],
  ['picturePath', isText],
  ['shape', oneOf(['tall', 'wide', 'square'])],
  ['stock', isText],
])

const CARRIER_FIELD_CHECKS = new Map<string, Check>([['carried', isBoolean]])

const SUPPLY_FIELD_CHECKS = new Map<string, Check>([['loose', isLoose]])

const GEAR_FIELD_CHECKS = new Map<string, Check>([['backpackArt', isText]])

/** The stored fields, less any modelled one whose value cannot be read. */
const readableFields = (stored: Fields, checks: ReadonlyMap<string, Check>): Fields =>
  Object.fromEntries(Object.entries(stored).filter(([key, value]) => checks.get(key)?.(value) ?? true))

const recordsOf = (raw: unknown): Fields[] => listOf(raw).filter(isRecord)

/** A stored item as the sheet reads it. A stored item without an id is given `fallbackId`, and keeps it from its next save. */
export function parseLubecItem(raw: unknown, fallbackId: string): LubecItem {
  const stored = isRecord(raw) ? raw : {}
  return {
    ...readableFields(stored, ITEM_FIELD_CHECKS),
    id: textOf(stored.id) || fallbackId,
    kind: readOr(stored.kind, oneOf(['thing', 'weapon', 'armor', 'consumable', 'holder']), 'thing'),
    name: textOf(stored.name),
    note: textOf(stored.note),
    size: readOr(stored.size, oneOf([0, 1, 2, 4, 8]), 1),
    weight: readOr(stored.weight, oneOf(['normal', 'heavy', 'extra']), 'normal'),
    qty: readOr(stored.qty, isCount, 1),
    carrier: textOf(stored.carrier),
  } as LubecItem
}

/** A stored list of items, skipping any entry that is not a record. An item stored without an id is named by its place in the list. */
export const parseLubecItems = (raw: unknown): LubecItem[] =>
  recordsOf(raw).map((item, index) => parseLubecItem(item, `item-${index + 1}`))

const parsePocket = (stored: Fields): LubecPocket => ({
  ...stored,
  name: textOf(stored.name),
  slots: readOr(stored.slots, isCount, 0),
  max: readOr(stored.max, isCount, 0),
})

/** A stored list of pockets, skipping any entry that is not a record. */
export const parseLubecPockets = (raw: unknown): LubecPocket[] => recordsOf(raw).map(parsePocket)

const parseCarrier = (stored: Fields, index: number): LubecCarrier => ({
  ...readableFields(stored, CARRIER_FIELD_CHECKS),
  id: textOf(stored.id) || `carrier-${index + 1}`,
  name: textOf(stored.name),
  type: textOf(stored.type),
  pockets: parseLubecPockets(stored.pockets),
})

const parseSupply = (stored: Fields, index: number): LubecSupply => ({
  ...readableFields(stored, SUPPLY_FIELD_CHECKS),
  id: textOf(stored.id) || `supply-${index + 1}`,
  name: textOf(stored.name),
})

/** A stored `gear` field as the sheet reads it; a missing one, or one that is not a record, reads as empty. */
export function parseLubecGear(raw: unknown): LubecGear {
  const stored = readableFields(isRecord(raw) ? raw : {}, GEAR_FIELD_CHECKS)
  return {
    ...stored,
    items: parseLubecItems(stored.items),
    carriers: recordsOf(stored.carriers).map(parseCarrier),
    overrides: listOf(stored.overrides).filter(isText),
    supplies: recordsOf(stored.supplies).map(parseSupply),
  }
}

/** The backpack picture to show: the stored pick when it is one of `known`, else the default. */
export const lubecBackpackArt = (gear: LubecGear, known: readonly string[]): string =>
  gear.backpackArt !== undefined && known.includes(gear.backpackArt) ? gear.backpackArt : LUBEC_DEFAULT_BACKPACK_ART

const HAND_AND_BODY_SLOTS: readonly unknown[] = [0, 1]

const pocketsOf = (gear: LubecGear, carrierId: string): readonly LubecPocket[] | undefined =>
  carrierId === 'backpack' ? LUBEC_BACKPACK_POCKETS : gear.carriers.find((carrier) => carrier.id === carrierId)?.pockets

// Small stuff sits in a carrier with no pocket; anything else needs one of its pockets.
function hasPlace(gear: LubecGear, item: LubecItem): boolean {
  if (item.carrier === 'worn') return true
  if (item.carrier === 'hands' || item.carrier === 'body') return HAND_AND_BODY_SLOTS.includes(item.slot)
  const pockets = pocketsOf(gear, item.carrier)
  if (!pockets) return false
  return item.pocket == null ? item.size === 0 : item.pocket < pockets.length
}

/** The items whose place cannot be read: no such carrier, or a slot or pocket out of range. They count for nothing on you, and are never dropped or placed for the player. */
export const lubecItemsNeedingAPlace = (gear: LubecGear): LubecItem[] =>
  gear.items.filter((item) => !hasPlace(gear, item))
