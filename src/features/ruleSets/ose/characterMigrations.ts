// OSE's character migration steps. The 0 to 1 step is the app's former legacy
// conversion (`migrateToInventory`) and hydration spell-book heal
// (`ensureSpellBookInInventory`), frozen here so the step does not change when
// the app's item factories do. It imports no app module: the item shapes and
// stack policies below are copies.
import type { CharacterMigrationStep, StoredCharacter } from '../storedCharacter.ts'

type Fields = Record<string, unknown>

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Classes that carry a spell book, as `characterFactories.ts` has them.
export const ARCANE_SPELLBOOK_CLASSES = new Set(['Magic-User', 'Elf'])
export const SPELL_BOOK_TYPE_ID = 'spell-book'
const SPELL_BOOK_ITEM_NAME = 'Spell Book'

// The old lists, which the app read only while a character had no inventory.
export const LEGACY_LIST_FIELDS = ['weapons', 'armour', 'packedItems', 'equippedItems', 'storeGoldSlotIndices']
// Everything version 1 no longer stores: the old lists and the retired manual-AC flag.
export const RETIRED_DETAIL_FIELDS = [...LEGACY_LIST_FIELDS, 'acManualOverride']

// The fields an old weapon or armour row was converted from. Any other field on
// the row is kept on the item it becomes.
const WEAPON_ROW_FIELDS = [
  'id', 'weaponId', 'isMagic', 'name', 'damageDiceCount', 'damageDiceSides', 'bonus',
  'rangeShort', 'rangeMedium', 'rangeLong', 'twoHanded', 'equipped', 'notes',
]
const ARMOUR_ROW_FIELDS = ['id', 'armourId', 'isMagic', 'name', 'ac', 'bonus', 'equipped', 'notes']

export const GOLD_TEXT = /^Gold:\s*(\d+)\s*gp$/i

/** The id a row without one gets: the same on every run, for the app and the migration script alike. */
const stableItemId = (characterId: string, list: string, position: number) =>
  `legacy-${characterId}-${list}-${position}`

const withoutFields = (fields: Fields, names: readonly string[]): Fields => {
  const copy = { ...fields }
  for (const name of names) delete copy[name]
  return copy
}

// Today's conversion leaves a field undefined when the old row lacked it, and
// the save drops it; leaving it out here stores the same document.
const definedFields = (fields: Fields): Fields =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))

/** One of the old list fields as rows; an absent list is empty. */
function legacyList(details: Fields, name: string): readonly unknown[] {
  const list = details[name]
  if (!list) return []
  if (!Array.isArray(list)) throw new Error(`details.${name} is not a list`)
  return list
}

/** An old text row, trimmed; an absent row is empty text. */
function legacyText(row: unknown): string {
  if (row === null || row === undefined) return ''
  if (typeof row !== 'string') throw new Error('an old item row is not text')
  return row.trim()
}

const generalItem = (id: string, text: string, equipped: boolean): Fields => ({
  id,
  kind: 'general',
  typeId: 'custom',
  typeName: text,
  name: text,
  costGp: 0,
  equipped,
  notes: '',
  qty: 1,
  stack: { stackable: false },
})

const spellBookItem = (id: string): Fields => ({
  ...generalItem(id, SPELL_BOOK_ITEM_NAME, false),
  typeId: SPELL_BOOK_TYPE_ID,
})

const goldItem = (id: string, amount: number): Fields => ({
  id,
  kind: 'gold',
  typeId: 'gold',
  typeName: 'Gold',
  costGp: 0,
  equipped: false,
  notes: '',
  qty: amount,
  stack: { stackable: true, maxStack: 100 },
})

function weaponItem(row: Fields, id: unknown): Fields {
  return definedFields({
    ...withoutFields(row, WEAPON_ROW_FIELDS),
    kind: 'weapon',
    costGp: 0,
    qty: 1,
    stack: { stackable: false },
    slow: false,
    weaponEffects: [],
    weaponRollTables: [],
    id,
    name: row.name,
    typeId: row.weaponId || 'custom',
    typeName: '',
    isMagic: row.isMagic,
    damageDiceCount: row.damageDiceCount,
    damageDiceSides: row.damageDiceSides,
    attackBonus: row.bonus,
    damageBonus: '',
    rangeShort: row.rangeShort,
    rangeMedium: row.rangeMedium,
    rangeLong: row.rangeLong,
    twoHanded: row.twoHanded,
    equipped: row.equipped,
    notes: row.notes,
  })
}

function armourItem(row: Fields, id: unknown): Fields {
  return definedFields({
    ...withoutFields(row, ARMOUR_ROW_FIELDS),
    kind: 'armour',
    costGp: 0,
    qty: 1,
    stack: { stackable: false },
    armourType: 'body',
    id,
    name: row.name,
    typeId: row.armourId || 'custom',
    typeName: '',
    isMagic: row.isMagic,
    armourClass: row.ac,
    shieldMod: row.armourId === 'shield' ? '-1' : '',
    magicMod: row.bonus,
    equipped: row.equipped,
    notes: row.notes,
  })
}

/** Old weapon or armour rows as items, each keeping its id or getting a stable one. */
function convertRows(details: Fields, list: string, convert: (row: Fields, id: unknown) => Fields, characterId: string) {
  return legacyList(details, list).map((row, position) => {
    if (!isRecord(row)) throw new Error(`an old ${list} row is not a record`)
    return convert(row, row.id || stableItemId(characterId, list, position))
  })
}

/** Old packed rows as items: gold by "Gold: N gp" text or by a gold slot index, anything else as gear. */
function packedItems(details: Fields, characterId: string): Fields[] {
  const goldSlots = new Set(legacyList(details, 'storeGoldSlotIndices'))
  return legacyList(details, 'packedItems').flatMap((row, position) => {
    const text = legacyText(row)
    if (!text) return []
    const id = stableItemId(characterId, 'packedItems', position)
    const goldMatch = text.match(GOLD_TEXT)
    if (!goldMatch && !goldSlots.has(position)) return [generalItem(id, text, false)]
    const amount = goldMatch ? Number.parseInt(goldMatch[1], 10) : 0
    return amount > 0 ? [goldItem(id, amount)] : []
  })
}

/** Old equipped rows as equipped gear; gold written there was never carried and is skipped. */
function equippedItems(details: Fields, characterId: string): Fields[] {
  return legacyList(details, 'equippedItems').flatMap((row, position) => {
    const text = legacyText(row)
    if (!text || GOLD_TEXT.test(text)) return []
    return [generalItem(stableItemId(characterId, 'equippedItems', position), text, true)]
  })
}

/** An inventory built from the old lists, in the app's former order: weapons, armour, packed, then equipped. */
const inventoryFromLegacyLists = (details: Fields, characterId: string): unknown[] => [
  ...convertRows(details, 'weapons', weaponItem, characterId),
  ...convertRows(details, 'armour', armourItem, characterId),
  ...packedItems(details, characterId),
  ...equippedItems(details, characterId),
]

/** A present inventory, with a stable id on every row that has none. */
function storedInventory(inventory: unknown, characterId: string): unknown[] {
  if (!Array.isArray(inventory)) throw new Error('details.inventory is not a list')
  return inventory.map((row: unknown, position) =>
    isRecord(row) && !row.id ? { ...row, id: stableItemId(characterId, 'inventory', position) } : row,
  )
}

const isGeneralItem = (item: unknown): item is Fields => isRecord(item) && item.kind === 'general'

const isOldSpellBookRow = (item: unknown): item is Fields =>
  isGeneralItem(item)
  && item.typeId !== SPELL_BOOK_TYPE_ID
  && (item.typeName === SPELL_BOOK_ITEM_NAME || item.name === SPELL_BOOK_ITEM_NAME)

/**
 * An arcane caster's inventory with a typed spell book: an old "Spell Book" row
 * is adopted in place, otherwise a book with a stable id is added. Any other
 * class, and an inventory that already has one, is returned as it is.
 */
function withSpellBook(className: unknown, inventory: unknown[], characterId: string): unknown[] {
  if (!ARCANE_SPELLBOOK_CLASSES.has(className as string)) return inventory
  if (inventory.some((item) => isGeneralItem(item) && item.typeId === SPELL_BOOK_TYPE_ID)) return inventory
  const oldBook = inventory.findIndex(isOldSpellBookRow)
  if (oldBook < 0) return [...inventory, spellBookItem(`legacy-${characterId}-spell-book`)]
  const adopted = inventory.slice()
  adopted[oldBook] = { ...(inventory[oldBook] as Fields), typeId: SPELL_BOOK_TYPE_ID, typeName: SPELL_BOOK_ITEM_NAME }
  return adopted
}

/**
 * Version 0 to 1. A present inventory, even an empty one, wins over the old
 * lists; with none, one is built from them. An arcane caster then gets a spell
 * book. The old lists and the manual-AC flag are removed, and every other field
 * is kept as stored. Reader defaults are not filled in.
 */
export const oseCharacterV0ToV1: CharacterMigrationStep = (document, characterId): StoredCharacter => {
  const details = document.details
  if (!isRecord(details)) return { ...document, schemaVersion: 1 }
  const inventory = details.inventory
    ? storedInventory(details.inventory, characterId)
    : inventoryFromLegacyLists(details, characterId)
  return {
    ...document,
    details: { ...withoutFields(details, RETIRED_DETAIL_FIELDS), inventory: withSpellBook(document.class, inventory, characterId) },
    schemaVersion: 1,
  }
}

export const oseCharacterSteps: readonly CharacterMigrationStep[] = [oseCharacterV0ToV1]
