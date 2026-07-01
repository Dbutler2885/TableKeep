import { describe, expect, it } from 'vitest'
import { ensureSpellBookInInventory, makeSpellBookItem } from './characterFactories'
import { SPELL_BOOK_TYPE_ID, SPELL_BOOK_ITEM_NAME } from './spellCatalog'
import type { CharacterGeneralItem, CharacterInventoryItem } from '../../types/app'

const generalItem = (over: Partial<CharacterGeneralItem>): CharacterGeneralItem => ({
  id: over.id ?? 'x',
  kind: 'general',
  typeId: over.typeId ?? 'misc',
  typeName: over.typeName ?? 'Misc',
  name: over.name ?? 'Misc',
  costGp: 0,
  equipped: false,
  notes: '',
  qty: 1,
  stack: 'none',
  ...over,
})

const bookCount = (items: CharacterInventoryItem[]) =>
  items.filter((it) => it.kind === 'general' && it.typeId === SPELL_BOOK_TYPE_ID).length

describe('ensureSpellBookInInventory', () => {
  it('adds a spell book for a stranded elf that has none', () => {
    const result = ensureSpellBookInInventory('Elf', [generalItem({ name: 'Dagger', typeId: 'dagger' })])
    expect(bookCount(result)).toBe(1)
  })

  it('adds a spell book for a magic-user that has none', () => {
    expect(bookCount(ensureSpellBookInInventory('Magic-User', []))).toBe(1)
  })

  it('is idempotent when a proper spell book already exists', () => {
    const items: CharacterInventoryItem[] = [makeSpellBookItem()]
    const result = ensureSpellBookInInventory('Elf', items)
    expect(result).toBe(items) // unchanged reference
    expect(bookCount(result)).toBe(1)
  })

  it('normalizes a legacy "Spell Book" item in place instead of duplicating', () => {
    const legacy = generalItem({ id: 'legacy', name: SPELL_BOOK_ITEM_NAME, typeId: 'misc' })
    const result = ensureSpellBookInInventory('Elf', [legacy])
    expect(bookCount(result)).toBe(1)
    const book = result.find((it) => it.kind === 'general' && it.typeId === SPELL_BOOK_TYPE_ID)
    expect(book?.id).toBe('legacy') // same item, retyped
  })

  it('never gives a cleric (or other non-arcane class) a spell book', () => {
    expect(bookCount(ensureSpellBookInInventory('Cleric', []))).toBe(0)
    expect(bookCount(ensureSpellBookInInventory('Fighter', []))).toBe(0)
  })
})
