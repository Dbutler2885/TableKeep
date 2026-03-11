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
  4: [1, 2],
  5: [1, 2, 3],
  6: [1, 2, 3],
  7: [1, 2, 3, 4],
  8: [1, 2, 3, 4],
  9: [1, 2, 3, 4, 5],
  10: [1, 2, 3, 4, 5],
  11: [1, 2, 3, 4, 5, 6],
  12: [1, 2, 3, 4, 5, 6],
  13: [1, 2, 3, 4, 5, 6],
  14: [1, 2, 3, 4, 5, 6],
}

export const getAccessibleArcaneSpellLevels = (characterLevel: number): number[] => {
  const normalizedLevel = Math.max(1, Math.floor(characterLevel || 1))
  if (accessibleArcaneSpellLevelsByCharacterLevel[normalizedLevel]) {
    return accessibleArcaneSpellLevelsByCharacterLevel[normalizedLevel]
  }
  if (normalizedLevel >= 14) return accessibleArcaneSpellLevelsByCharacterLevel[14]
  return [1]
}

export const arcaneSpellsPerDayByCharacterLevel: Record<number, [number, number, number, number, number, number]> = {
  1: [1, 0, 0, 0, 0, 0],
  2: [2, 0, 0, 0, 0, 0],
  3: [2, 1, 0, 0, 0, 0],
  4: [2, 2, 0, 0, 0, 0],
  5: [2, 2, 1, 0, 0, 0],
  6: [2, 2, 2, 0, 0, 0],
  7: [3, 2, 2, 1, 0, 0],
  8: [3, 3, 2, 2, 0, 0],
  9: [3, 3, 3, 2, 1, 0],
  10: [3, 3, 3, 3, 2, 0],
  11: [4, 3, 3, 3, 2, 1],
  12: [4, 4, 3, 3, 3, 2],
  13: [4, 4, 4, 3, 3, 3],
  14: [4, 4, 4, 4, 3, 3],
}

export const getArcaneSpellsPerDay = (characterLevel: number): [number, number, number, number, number, number] => {
  const normalizedLevel = Math.max(1, Math.floor(characterLevel || 1))
  if (arcaneSpellsPerDayByCharacterLevel[normalizedLevel]) {
    return arcaneSpellsPerDayByCharacterLevel[normalizedLevel]
  }
  if (normalizedLevel >= 14) return arcaneSpellsPerDayByCharacterLevel[14]
  return arcaneSpellsPerDayByCharacterLevel[1]
}
