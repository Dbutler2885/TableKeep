/**
 * OSE's 0 to 1 step, run on the checked-in fixtures. Its items are compared
 * with what the app's hydration made of the same document before the step
 * owned the conversion: the legacy conversion (`migrateToInventory`, kept
 * below as that reference once the app stopped reading old-format sheets) and
 * the spell-book heal (`ensureSpellBookInInventory`). Only the ids differ,
 * because the step gives a row without an id a stable one where that code
 * made a random one.
 */
import { Timestamp } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterInventoryItem } from '../../../types/app'
import {
  ensureSpellBookInInventory,
  makeArmourItem,
  makeId,
  makeSpellBookItem,
  makeWeaponItem,
} from '../../character/characterFactories'
import { makeGoldItem } from '../../character/inventoryOverflow'
import { DEFAULT_STACK_POLICY } from '../../items/itemDefaults'
import { markTimestamps, reviveTimestamps, type CharacterFixture } from '../characterFixtures'
import type { StoredCharacter } from '../storedCharacter'
import demoCleric from './fixtures/demo-cleric.json'
import demoFighter from './fixtures/demo-fighter.json'
import demoMagicUser from './fixtures/demo-magic-user.json'
import demoThief from './fixtures/demo-thief.json'
import legacy from './fixtures/legacy.json'
import { oseCharacterV0ToV1 } from './characterMigrations'

type Fields = Record<string, unknown>

const revive = (fixture: unknown) =>
  reviveTimestamps(fixture, (iso) => Timestamp.fromDate(new Date(iso))) as CharacterFixture

const asFixtureJson = (document: StoredCharacter) =>
  `${JSON.stringify(markTimestamps(document, (value) => value instanceof Timestamp ? value.toDate().toISOString() : null), null, 2)}\n`

const legacyCases = Object.entries(legacy).map(([name, fixture]) => [name, revive(fixture)] as const)
const demoCases = Object.entries({
  'demo-magic-user': demoMagicUser,
  'demo-fighter': demoFighter,
  'demo-thief': demoThief,
  'demo-cleric': demoCleric,
}).map(([name, fixture]) => [name, revive(fixture)] as const)
const allCases = [...legacyCases, ...demoCases]

const legacyCase = (name: keyof typeof legacy) => revive(legacy[name])

const migrate = ({ id, data }: CharacterFixture) => oseCharacterV0ToV1(data, id)
const detailsOf = (document: StoredCharacter) => document.details as Fields
const inventoryOf = (document: StoredCharacter) => detailsOf(document).inventory as Fields[]

type LegacyWeaponRow = {
  id: string; weaponId: string; isMagic: boolean; name: string; damageDiceCount: string; damageDiceSides: string
  bonus: string; rangeShort: string; rangeMedium: string; rangeLong: string; twoHanded: boolean; equipped: boolean; notes: string
}
type LegacyArmourRow = { id: string; armourId: string; isMagic: boolean; name: string; ac: string; bonus: string; equipped: boolean; notes: string }
type LegacyDetails = {
  inventory?: CharacterInventoryItem[]
  weapons?: LegacyWeaponRow[]
  armour?: LegacyArmourRow[]
  packedItems?: string[]
  equippedItems?: string[]
  storeGoldSlotIndices?: number[]
}

const legacyTextItem = (text: string, equipped: boolean): CharacterInventoryItem => ({
  id: makeId(), kind: 'general', typeId: 'custom', typeName: text, name: text, costGp: 0, equipped, notes: '', qty: 1,
  stack: DEFAULT_STACK_POLICY.general,
})

/** The app's legacy conversion, as it stood when the step was made from it. */
const migrateToInventory = (details: LegacyDetails): CharacterInventoryItem[] => {
  const items: CharacterInventoryItem[] = []
  for (const w of details.weapons ?? []) {
    items.push(makeWeaponItem({
      id: w.id || makeId(), name: w.name, typeId: w.weaponId || 'custom', typeName: '', isMagic: w.isMagic,
      damageDiceCount: w.damageDiceCount, damageDiceSides: w.damageDiceSides, attackBonus: w.bonus, damageBonus: '',
      rangeShort: w.rangeShort, rangeMedium: w.rangeMedium, rangeLong: w.rangeLong, twoHanded: w.twoHanded,
      equipped: w.equipped, notes: w.notes,
    }))
  }
  for (const a of details.armour ?? []) {
    items.push(makeArmourItem({
      id: a.id || makeId(), name: a.name, typeId: a.armourId || 'custom', typeName: '', isMagic: a.isMagic,
      armourClass: a.ac, shieldMod: a.armourId === 'shield' ? '-1' : '', magicMod: a.bonus, equipped: a.equipped, notes: a.notes,
    }))
  }
  const goldSlotSet = new Set(details.storeGoldSlotIndices ?? [])
  ;(details.packedItems ?? []).forEach((row, i) => {
    const text = (row ?? '').trim()
    if (!text) return
    const goldMatch = text.match(/^Gold:\s*(\d+)\s*gp$/i)
    if (!goldMatch && !goldSlotSet.has(i)) items.push(legacyTextItem(text, false))
    else if (goldMatch && Number.parseInt(goldMatch[1], 10) > 0) items.push(makeGoldItem(Number.parseInt(goldMatch[1], 10)))
  })
  for (const row of details.equippedItems ?? []) {
    const text = (row ?? '').trim()
    if (text && !/^Gold:\s*\d+\s*gp$/i.test(text)) items.push(legacyTextItem(text, true))
  }
  return items
}

/** What the app's hydration showed for a stored document: converted from the old lists if needed, then healed. */
const formerInventory = ({ data }: CharacterFixture): CharacterInventoryItem[] => {
  if (typeof data.details !== 'object' || data.details === null) return []
  const details = data.details as LegacyDetails
  const stored = details.inventory ? details.inventory : migrateToInventory(details)
  return ensureSpellBookInInventory((data.class ?? '-') as string, stored)
}

// The former code made a random id for a row that had none; the mock below
// makes those recognisable. The step's stable ids all start with `legacy-<character id>-`.
const isGeneratedToday = (id: unknown) => !id || String(id).startsWith('generated-')

const knownFields = (item: Fields, keys: string[]) => Object.fromEntries(keys.map((key) => [key, item[key]]))

const definedKeys = (item: Fields) => Object.keys(item).filter((key) => item[key] !== undefined)

/** The source rows a converted inventory came from that carry an unknown field. */
const unknownRowValues = (rows: unknown[]) =>
  rows.flatMap((row) => (row as Fields | null)?.unknownRowField ?? [])

beforeEach(() => {
  let generated = 0
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(
    () => `generated-${++generated}` as ReturnType<typeof crypto.randomUUID>,
  )
})
afterEach(() => vi.restoreAllMocks())

describe('OSE step 0 to 1', () => {
  it.each(legacyCases)('%s gives its recorded output', async (name, fixture) => {
    await expect(asFixtureJson(migrate(fixture))).toMatchFileSnapshot(`./fixtures/recorded/${name}.json`)
  })

  it.each(allCases)('%s gives the same items, in the same order, as the app\'s former hydration', (_name, fixture) => {
    const today = formerInventory(fixture)
    const migrated = inventoryOf(migrate(fixture))
    expect(migrated).toHaveLength(today.length)
    today.forEach((todayItem, position) => {
      const item = todayItem as unknown as Fields
      const keys = definedKeys(item).filter((key) => key !== 'id')
      expect(knownFields(migrated[position], keys)).toEqual(knownFields(item, keys))
      if (isGeneratedToday(item.id)) expect(String(migrated[position].id)).toMatch(new RegExp(`^legacy-${fixture.id}-`))
      else expect(migrated[position].id).toBe(item.id)
      const extraKeys = Object.keys(migrated[position]).filter((key) => key !== 'id' && !keys.includes(key))
      expect(extraKeys.every((key) => key === 'unknownRowField')).toBe(true)
    })
  })

  it.each(allCases)('%s keeps the unknown fields of rows, details and the document', (_name, fixture) => {
    const migrated = migrate(fixture)
    const stored = detailsOf(fixture.data)
    const sourceRows = stored.inventory
      ? stored.inventory as unknown[]
      : [...(stored.weapons as unknown[] ?? []), ...(stored.armour as unknown[] ?? [])]
    expect(unknownRowValues(inventoryOf(migrated))).toEqual(unknownRowValues(sourceRows))
    expect(detailsOf(migrated).storeCart).toEqual(stored.storeCart)
    expect(detailsOf(migrated).unknownNested).toEqual({ kept: true, deeper: { value: 7 } })
    expect(migrated.unknownTopLevel).toEqual({ note: 'kept as stored', list: [1, 'two', { three: 3 }] })
  })

  it.each(allCases)('%s passes its timestamps through as the same values', (_name, fixture) => {
    const migrated = migrate(fixture)
    expect(fixture.data.createdAt).toBeInstanceOf(Timestamp)
    expect(migrated.createdAt).toBe(fixture.data.createdAt)
    expect(migrated.updatedAt).toBe(fixture.data.updatedAt)
  })

  it.each(allCases)('%s removes the old lists and the manual-AC flag and nothing else', (_name, fixture) => {
    const { inventory: _inventory, ...migratedDetails } = detailsOf(migrate(fixture))
    const {
      inventory: _storedInventory, weapons: _w, armour: _a, packedItems: _p, equippedItems: _e,
      storeGoldSlotIndices: _g, acManualOverride: _ac, ...keptDetails
    } = detailsOf(fixture.data)
    expect(migratedDetails).toEqual(keptDetails)
    const { details: _details, schemaVersion, ...migratedTop } = migrate(fixture)
    const { details: _storedDetails, ...storedTop } = fixture.data
    expect(migratedTop).toEqual(storedTop)
    expect(schemaVersion).toBe(1)
  })

  it.each(allCases)('%s gives the same ids every run, and a second run changes nothing', (_name, fixture) => {
    const once = migrate(fixture)
    expect(migrate(fixture)).toEqual(once)
    expect(oseCharacterV0ToV1(once, fixture.id)).toEqual(once)
  })

  it.each(demoCases)('%s comes out as stored apart from the version', (_name, fixture) => {
    expect(migrate(fixture)).toEqual({ ...fixture.data, schemaVersion: 1 })
  })
})

describe('OSE step 0 to 1 inventory choice and spell-book repair', () => {
  const spellBookShape = (({ id: _id, ...shape }) => shape)(makeSpellBookItem())

  it('leaves an explicitly empty inventory of a non-arcane character empty, ignoring the old lists', () => {
    expect(inventoryOf(migrate(legacyCase('empty-non-arcane-inventory')))).toEqual([])
  })

  it('gives an explicitly empty arcane inventory only the missing spell book, ignoring the old lists', () => {
    expect(inventoryOf(migrate(legacyCase('empty-arcane-inventory')))).toEqual([
      { ...spellBookShape, id: 'legacy-legacy-empty-mage-spell-book' },
    ])
  })

  it('adopts an old "Spell Book" row from the old lists', () => {
    const books = inventoryOf(migrate(legacyCase('caster-old-spell-book-row'))).filter((item) => item.name === 'Spell Book')
    expect(books).toEqual([{ ...spellBookShape, id: 'legacy-legacy-mage-old-book-packedItems-1' }])
  })

  it('adopts an old "Spell Book" row in an inventory, keeping its id and notes', () => {
    const books = inventoryOf(migrate(legacyCase('caster-old-spell-book-in-inventory'))).filter((item) => item.name === 'Spell Book')
    expect(books).toEqual([expect.objectContaining({ id: 'i2', typeId: 'spell-book', typeName: 'Spell Book', notes: 'bound in red leather' })])
  })

  it.each([
    ['caster-inventory-without-book', 'legacy-mage-no-book-inv'],
    ['caster-without-book', 'legacy-elf-no-book'],
  ] as const)('adds a spell book with a stable id to %s', (name, characterId) => {
    const inventory = inventoryOf(migrate(legacyCase(name)))
    expect(inventory.at(-1)).toEqual({ ...spellBookShape, id: `legacy-${characterId}-spell-book` })
    expect(inventory.filter((item) => item.typeId === 'spell-book')).toHaveLength(1)
  })

  it('keeps a present inventory over the old lists beside it', () => {
    expect(inventoryOf(migrate(legacyCase('old-lists-beside-inventory'))).map((item) => item.id)).toEqual(['i1', 'i2'])
  })

  it('gives inventory rows without ids a stable id from the character, the list and the row position', () => {
    expect(inventoryOf(migrate(legacyCase('rows-without-ids'))).map((item) => item.id)).toEqual([
      'legacy-legacy-rows-without-ids-inventory-0',
      'keep-me',
      'legacy-legacy-rows-without-ids-inventory-2',
    ])
  })

  it('gives converted rows ids from their own list and position, keeping stored ids', () => {
    expect(inventoryOf(migrate(legacyCase('old-lists'))).map((item) => item.id)).toEqual([
      'w1', 'legacy-legacy-old-lists-weapons-1', 'w3', 'a1', 'a2', 'legacy-legacy-old-lists-armour-2',
    ])
    expect(inventoryOf(migrate(legacyCase('legacy-gold'))).map((item) => [item.id, item.kind, item.qty])).toEqual([
      ['w1', 'weapon', 1],
      ['legacy-legacy-gold-packedItems-0', 'gold', 17],
      ['legacy-legacy-gold-packedItems-1', 'gold', 3],
      ['legacy-legacy-gold-packedItems-2', 'general', 1],
      ['legacy-legacy-gold-equippedItems-1', 'general', 1],
    ])
  })

  it('leaves a character without details as stored apart from the version', () => {
    expect(oseCharacterV0ToV1({ name: 'Bare', class: 'Magic-User' }, 'bare')).toEqual({ name: 'Bare', class: 'Magic-User', schemaVersion: 1 })
  })

  it.each([
    ['an inventory that is not a list', { inventory: { sword: true } }, 'details.inventory is not a list'],
    ['an old list that is not a list', { weapons: 'Sword' }, 'details.weapons is not a list'],
    ['an old text row that is not text', { packedItems: [7] }, 'an old item row is not text'],
    ['an old weapon row that is not a record', { weapons: ['Sword'] }, 'an old weapons row is not a record'],
    ['an old armour row that is not a record', { armour: [null] }, 'an old armour row is not a record'],
  ])('refuses %s', (_case, details, message) => {
    expect(() => oseCharacterV0ToV1({ class: 'Fighter', details }, 'odd')).toThrow(message)
  })
})

// The legacy conversion's own cases, moved here from the sheet's hydration
// when the step became the only owner of the conversion. Each sheet stores no
// inventory, so the step builds one from the old lists.
describe('OSE step 0 to 1 conversion of the old lists', () => {
  const convert = (details: Fields) => inventoryOf(oseCharacterV0ToV1({ class: 'Fighter', details }, 'old'))

  it('converts weapons and armour, including custom fallbacks and shield derivation', () => {
    const items = convert({
      weapons: [
        { id: 'w1', name: 'Sword', weaponId: 'sword', isMagic: false, damageDiceCount: '1', damageDiceSides: '8', bonus: '', rangeShort: '', rangeMedium: '', rangeLong: '', twoHanded: false, equipped: true, notes: '' },
        { id: '', name: 'Odd blade', weaponId: '', isMagic: true, damageDiceCount: '', damageDiceSides: '', bonus: '+1', rangeShort: '', rangeMedium: '', rangeLong: '', twoHanded: false, equipped: false, notes: '' },
      ],
      armour: [
        { id: 'a1', name: 'Shield', armourId: 'shield', isMagic: false, ac: '', bonus: '', equipped: true, notes: '' },
        { id: 'a2', name: 'Plate', armourId: 'plate-mail', isMagic: true, ac: '3', bonus: '+1', equipped: true, notes: '' },
      ],
    })
    expect(items.find((item) => item.id === 'w1')?.typeId).toBe('sword')
    expect(items.find((item) => item.name === 'Odd blade')).toMatchObject({ id: 'legacy-old-weapons-1', typeId: 'custom' })
    expect(items.find((item) => item.id === 'a1')).toMatchObject({ kind: 'armour', shieldMod: '-1' })
    expect(items.find((item) => item.id === 'a2')).toMatchObject({ kind: 'armour', armourClass: '3', magicMod: '+1' })
  })

  it('keeps the former conversion\'s gold and text-row edge cases', () => {
    const items = convert({
      packedItems: ['Gold: 17 gp', 'Rope', 'not gold', '', '   '],
      storeGoldSlotIndices: [2],
      equippedItems: ['Gold: 2 gp', 'Sword belt', '', '  '],
    })
    expect(items.some((item) => item.kind === 'gold' && item.qty === 17)).toBe(true)
    expect(items.some((item) => item.typeName === 'Rope' && !item.equipped)).toBe(true)
    expect(items.some((item) => item.typeName === 'Sword belt' && item.equipped)).toBe(true)
    expect(items.some((item) => item.typeName === 'not gold')).toBe(false)
    expect(items).toHaveLength(3)
  })

  it('accepts entirely absent old lists', () => {
    expect(convert({ thaco: '19' })).toEqual([])
  })
})
