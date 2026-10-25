import { LUBEC_STARTING_COUNTERS, type LubecCharacterSheet } from './characterRecord'
import { emptyLubecGear } from './gear/gearRecord'
import type { LubecSheet } from './sheet'

// Tommy Eves, a Working Kid saved by the standalone sheet
// (Lubec-Mothership-Character-Sheets/PCs/lubec-Tommy-Eves.json), as the rules read him.
export const tommyEves = (): LubecSheet => ({
  age: null,
  class: { key: 'working', choices: {} },
  base: { Strength: 24, Speed: 51, Intellect: 38, Handle: 50, Charm: 48, Sanity: 20, Fear: 24, Body: 21 },
  skills: { free: 'Boatwork', picked: ['Swimming', 'Diving'] },
})

/** Tommy's base values under another class and skills. */
export const lubecSheet = (overrides: Partial<LubecSheet>): LubecSheet => ({ ...tommyEves(), ...overrides })

/** Tommy as the Core page holds him: the rules' starting counters, no effects, no last roll and no gear. */
export const lubecCharacterSheet = (overrides: Partial<LubecCharacterSheet> = {}): LubecCharacterSheet => ({
  ...tommyEves(),
  door: null,
  rollUp: null,
  counters: LUBEC_STARTING_COUNTERS,
  effects: [],
  lastRoll: null,
  importNotes: [],
  gear: emptyLubecGear(),
  ...overrides,
})
