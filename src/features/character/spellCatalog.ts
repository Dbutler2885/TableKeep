import { ARCANE_SPELL_CATALOG } from './generatedArcaneSpellCatalog'
import { DIVINE_SPELL_CATALOG } from './generatedDivineSpellCatalog'

export const SPELL_BOOK_TYPE_ID = 'spell-book'
export const SPELL_BOOK_ITEM_NAME = 'Spell Book'

// OSE per-class arcane caps. Magic-users advance to level 14 and eventually gain
// 6th-level spells; elves stop at level 10 and never learn spells above 5th level.
// The arcane spells-per-day / accessible-level tables are shared, so these caps are
// applied on top of them per class.
export type ArcaneCasterCaps = { maxCasterLevel: number; maxSpellLevel: number }

export const ARCANE_CASTER_CAPS_BY_CLASS: Record<string, ArcaneCasterCaps> = {
  'Magic-User': { maxCasterLevel: 14, maxSpellLevel: 6 },
  Elf: { maxCasterLevel: 10, maxSpellLevel: 5 },
}

export const getArcaneCasterCaps = (className: string): ArcaneCasterCaps =>
  ARCANE_CASTER_CAPS_BY_CLASS[className] ?? { maxCasterLevel: 14, maxSpellLevel: 6 }

// Accessible arcane spell levels for a class, with per-class caps applied on top of the
// shared magic-user table (elves clamp to level 10 and never see spells above 5th level).
export const getCappedAccessibleArcaneSpellLevels = (className: string, characterLevel: number): number[] => {
  const caps = getArcaneCasterCaps(className)
  return getAccessibleArcaneSpellLevels(Math.min(characterLevel, caps.maxCasterLevel))
    .filter((level) => level <= caps.maxSpellLevel)
}

// Arcane spells-per-day for a class, with per-class caps applied: the caster level is
// clamped to the class maximum and any spell level above the class cap is zeroed out.
export const getCappedArcaneSpellsPerDay = (
  className: string,
  characterLevel: number,
): ReturnType<typeof getArcaneSpellsPerDay> => {
  const caps = getArcaneCasterCaps(className)
  return getArcaneSpellsPerDay(Math.min(characterLevel, caps.maxCasterLevel))
    .map((slots, index) => (index + 1 <= caps.maxSpellLevel ? slots : 0)) as ReturnType<typeof getArcaneSpellsPerDay>
}

export { ARCANE_SPELL_CATALOG }
export { DIVINE_SPELL_CATALOG }

export const arcaneSpellById = ARCANE_SPELL_CATALOG.reduce<Record<string, (typeof ARCANE_SPELL_CATALOG)[number]>>((acc, spell) => {
  acc[spell.id] = spell
  return acc
}, {})

export const divineSpellById = DIVINE_SPELL_CATALOG.reduce<Record<string, (typeof DIVINE_SPELL_CATALOG)[number]>>((acc, spell) => {
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

export const divineSpellsPerDayByCharacterLevel: Record<number, [number, number, number, number, number]> = {
  1: [0, 0, 0, 0, 0],
  2: [1, 0, 0, 0, 0],
  3: [2, 0, 0, 0, 0],
  4: [2, 1, 0, 0, 0],
  5: [2, 2, 0, 0, 0],
  6: [2, 2, 1, 1, 0],
  7: [2, 2, 2, 1, 1],
  8: [3, 3, 2, 2, 1],
  9: [3, 3, 3, 2, 2],
  10: [4, 4, 3, 3, 2],
  11: [4, 4, 4, 3, 3],
  12: [5, 5, 4, 4, 3],
  13: [5, 5, 5, 4, 4],
  14: [6, 5, 5, 5, 4],
}

export const getDivineSpellsPerDay = (characterLevel: number): [number, number, number, number, number] => {
  const normalizedLevel = Math.max(1, Math.floor(characterLevel || 1))
  if (divineSpellsPerDayByCharacterLevel[normalizedLevel]) {
    return divineSpellsPerDayByCharacterLevel[normalizedLevel]
  }
  if (normalizedLevel >= 14) return divineSpellsPerDayByCharacterLevel[14]
  return divineSpellsPerDayByCharacterLevel[1]
}

export const getAccessibleDivineSpellLevels = (characterLevel: number): number[] => {
  const slots = getDivineSpellsPerDay(characterLevel)
  return slots
    .map((count, index) => (count > 0 ? index + 1 : 0))
    .filter((level) => level > 0)
}
