import type { VtmCharacterSheet } from './vtmTypes'

// Pure dice + pool helpers for the V:tM sheet roller. The app rolls raw d10s and
// shows the faces; it never computes difficulty, successes, botches, or any
// interpretation. The table reads the dice. Keep this module side-effect free so
// the roll logic stays deterministically testable (inject an RNG).

export type RollRng = () => number

export type StagedAttr = { name: string; rating: number } | null
export type StagedSecond = { kind: 'Ability' | 'Discipline'; name: string; rating: number } | null

/** Roll a single d10 (1-10) using the supplied RNG. */
export function rollDie(rng: RollRng = Math.random): number {
  return Math.floor(rng() * 10) + 1
}

/** Roll `count` d10s. Negative/fractional counts clamp to a non-negative integer. */
export function rollDice(count: number, rng: RollRng = Math.random): number[] {
  const total = Math.max(0, Math.floor(count || 0))
  const dice: number[] = []
  for (let index = 0; index < total; index += 1) dice.push(rollDie(rng))
  return dice
}

/** Dice in a built pool: Attribute rating + optional Ability/Discipline rating. */
export function poolDiceCount(attr: StagedAttr, second: StagedSecond): number {
  return (attr?.rating ?? 0) + (second?.rating ?? 0)
}

/** Human label for a built pool, e.g. "Dexterity + Stealth" or "Stamina". */
export function buildPoolLabel(attr: StagedAttr, second: StagedSecond): string {
  const parts: string[] = []
  if (attr) parts.push(attr.name)
  if (second) parts.push(second.name)
  return parts.join(' + ')
}

/** Attribute rating by name across all three categories (defaults to 1, the V:tM floor). */
export function attributeRating(sheet: VtmCharacterSheet, name: string): number {
  for (const category of Object.values(sheet.attributes)) {
    if (name in category) return category[name]
  }
  return 1
}

/** Ability rating by name across all three categories (defaults to 0). */
export function abilityRating(sheet: VtmCharacterSheet, name: string): number {
  for (const category of Object.values(sheet.abilities)) {
    if (name in category) return category[name]
  }
  return 0
}

/** Discipline rating by name (0 when the character does not have it). */
export function disciplineRating(sheet: VtmCharacterSheet, name: string): number {
  const row = sheet.disciplines.find((entry) => entry.name === name)
  return row ? row.rating : 0
}

export type PresetPool = { attr: StagedAttr; second: StagedSecond }

/** Initiative = Wits + Alertness. */
export function initiativePreset(sheet: VtmCharacterSheet): PresetPool {
  return {
    attr: { name: 'Wits', rating: attributeRating(sheet, 'Wits') },
    second: { kind: 'Ability', name: 'Alertness', rating: abilityRating(sheet, 'Alertness') },
  }
}

/** Soak = Stamina + Fortitude, or Stamina alone when the character has no Fortitude. */
export function soakPreset(sheet: VtmCharacterSheet): PresetPool {
  const fortitude = disciplineRating(sheet, 'Fortitude')
  return {
    attr: { name: 'Stamina', rating: attributeRating(sheet, 'Stamina') },
    second: fortitude > 0 ? { kind: 'Discipline', name: 'Fortitude', rating: fortitude } : null,
  }
}
