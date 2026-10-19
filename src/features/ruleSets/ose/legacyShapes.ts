// The old stored shapes an OSE character can still have before its 0 to 1
// step, as the migration script's dry run counts them. Like the steps, this
// module imports only step modules, so plain Node can load it.
import type { StoredCharacter } from '../storedCharacter.ts'
import { ARCANE_SPELLBOOK_CLASSES, GOLD_TEXT, LEGACY_LIST_FIELDS, SPELL_BOOK_TYPE_ID } from './characterMigrations.ts'

type Fields = Record<string, unknown>

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const rows = (value: unknown): readonly unknown[] => Array.isArray(value) ? value : []

export const OSE_LEGACY_SHAPES = [
  'oldListsWithoutInventory',
  'oldListsBesideInventory',
  'emptyInventory',
  'rowsWithoutIds',
  'legacyGold',
  'manualAcFlag',
  'casterWithoutSpellBook',
  'noDetails',
] as const

export type OseLegacyShape = typeof OSE_LEGACY_SHAPES[number]

const hasOldLists = (details: Fields) => LEGACY_LIST_FIELDS.some((name) => Object.hasOwn(details, name))

// The rows the step converts: a present inventory's, otherwise the old weapon
// and armour records. Old packed and equipped rows are text and never had ids.
const sourceRows = (details: Fields) =>
  details.inventory ? rows(details.inventory) : [...rows(details.weapons), ...rows(details.armour)]

const isGoldText = (row: unknown) => typeof row === 'string' && GOLD_TEXT.test(row.trim())

const hasLegacyGold = (details: Fields) =>
  rows(details.storeGoldSlotIndices).length > 0
  || [...rows(details.packedItems), ...rows(details.equippedItems)].some(isGoldText)

const hasTypedSpellBook = (inventory: unknown) =>
  rows(inventory).some((item) => isRecord(item) && item.kind === 'general' && item.typeId === SPELL_BOOK_TYPE_ID)

const shapeTests: Record<Exclude<OseLegacyShape, 'noDetails'>, (details: Fields, document: StoredCharacter) => boolean> = {
  oldListsWithoutInventory: (details) => hasOldLists(details) && !details.inventory,
  oldListsBesideInventory: (details) => hasOldLists(details) && Boolean(details.inventory),
  emptyInventory: (details) => Array.isArray(details.inventory) && details.inventory.length === 0,
  rowsWithoutIds: (details) => sourceRows(details).some((row) => isRecord(row) && !row.id),
  legacyGold: hasLegacyGold,
  manualAcFlag: (details) => Object.hasOwn(details, 'acManualOverride'),
  casterWithoutSpellBook: (details, document) =>
    ARCANE_SPELLBOOK_CLASSES.has(document.class as string) && !hasTypedSpellBook(details.inventory),
}

/** The old shapes one stored OSE character has, in `OSE_LEGACY_SHAPES` order. */
export function oseLegacyShapes(document: StoredCharacter): OseLegacyShape[] {
  const details = document.details
  if (!isRecord(details)) return ['noDetails']
  return OSE_LEGACY_SHAPES.filter((shape) => shape !== 'noDetails' && shapeTests[shape](details, document))
}
