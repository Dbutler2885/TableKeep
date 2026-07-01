// Pure factory functions for character-related entities.
// No React, no Firebase.

import type {
  CharacterWeaponItem,
  CharacterArmourItem,
  CharacterGeneralItem,
  CharacterInventoryItem,
} from '../../types/app'
import { DEFAULT_STACK_POLICY } from '../items/itemDefaults'
import { SPELL_BOOK_TYPE_ID, SPELL_BOOK_ITEM_NAME } from './spellCatalog'

// Arcane spellbook classes carry a spell book (with its shop-like transcribe/memorize UI).
const ARCANE_SPELLBOOK_CLASSES = new Set(['Magic-User', 'Elf'])

export const isArcaneSpellbookClass = (className: string): boolean =>
  ARCANE_SPELLBOOK_CLASSES.has(className)

// Ensure an arcane spellcaster's inventory contains a properly-typed spell book, so the
// character sheet's spell book UI is available. Idempotent, and legacy-aware: an existing
// "Spell Book" general item that predates the canonical typeId is adopted in place rather
// than duplicated. Non-arcane classes (and inventories that already have one) are unchanged.
export const ensureSpellBookInInventory = (
  className: string,
  items: CharacterInventoryItem[],
): CharacterInventoryItem[] => {
  if (!isArcaneSpellbookClass(className)) return items
  if (items.some((item) => item.kind === 'general' && item.typeId === SPELL_BOOK_TYPE_ID)) return items
  const legacyIndex = items.findIndex(
    (item) =>
      item.kind === 'general' &&
      item.typeId !== SPELL_BOOK_TYPE_ID &&
      (item.typeName === SPELL_BOOK_ITEM_NAME || item.name === SPELL_BOOK_ITEM_NAME),
  )
  if (legacyIndex >= 0) {
    const next = items.slice()
    next[legacyIndex] = {
      ...(next[legacyIndex] as CharacterGeneralItem),
      typeId: SPELL_BOOK_TYPE_ID,
      typeName: SPELL_BOOK_ITEM_NAME,
    }
    return next
  }
  return [...items, makeSpellBookItem()]
}

export const makeId = () => {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// Key-order-independent JSON for comparing Firestore round-tripped objects
export const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (v as Record<string, unknown>)[k]
        return acc
      }, {})
    }
    return v
  })

export const makeSpellBookItem = (): CharacterGeneralItem => ({
  id: makeId(),
  kind: 'general',
  typeId: SPELL_BOOK_TYPE_ID,
  typeName: SPELL_BOOK_ITEM_NAME,
  name: SPELL_BOOK_ITEM_NAME,
  costGp: 0,
  equipped: false,
  notes: '',
  qty: 1,
  stack: DEFAULT_STACK_POLICY.general,
})

export const makeWeaponItem = (overrides?: Partial<CharacterWeaponItem>): CharacterWeaponItem => ({
  id: makeId(),
  kind: 'weapon',
  costGp: 0,
  equipped: false,
  notes: '',
  typeId: 'custom',
  typeName: '',
  qty: 1,
  stack: DEFAULT_STACK_POLICY.weapon,
  isMagic: false,
  damageDiceCount: '',
  damageDiceSides: '',
  attackBonus: '',
  damageBonus: '',
  rangeShort: '',
  rangeMedium: '',
  rangeLong: '',
  slow: false,
  twoHanded: false,
  weaponEffects: [],
  weaponRollTables: [],
  ...overrides,
})

export const makeArmourItem = (overrides?: Partial<CharacterArmourItem>): CharacterArmourItem => ({
  id: makeId(),
  kind: 'armour',
  costGp: 0,
  equipped: false,
  notes: '',
  typeId: 'custom',
  typeName: '',
  qty: 1,
  stack: DEFAULT_STACK_POLICY.armour,
  isMagic: false,
  armourClass: '',
  shieldMod: '',
  magicMod: '',
  armourType: 'body',
  ...overrides,
})
