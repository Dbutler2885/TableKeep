// Pure factory functions for character-related entities.
// No React, no Firebase.

import type {
  CharacterWeaponItem,
  CharacterArmourItem,
  CharacterGeneralItem,
} from '../../types/app'
import { DEFAULT_STACK_POLICY } from '../items/itemDefaults'
import { SPELL_BOOK_TYPE_ID, SPELL_BOOK_ITEM_NAME } from './spellCatalog'

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
