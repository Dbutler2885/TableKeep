import { ARCANE_SPELL_CATALOG } from './generatedArcaneSpellCatalog'

export const SPELL_BOOK_TYPE_ID = 'spell-book'
export const SPELL_BOOK_ITEM_NAME = 'Spell Book'

export { ARCANE_SPELL_CATALOG }

export const arcaneSpellById = ARCANE_SPELL_CATALOG.reduce<Record<string, (typeof ARCANE_SPELL_CATALOG)[number]>>((acc, spell) => {
  acc[spell.id] = spell
  return acc
}, {})

export const accessibleArcaneSpellLevelsByCharacterLevel: Record<number, number[]> = {
  1: [1],
  2: [1],
  3: [1, 2],
}

export const spellBookSlotsPerSpellLevel = 1
