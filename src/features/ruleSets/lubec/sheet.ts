// The parts of a stored character's `lubec` field that the Lubec rules read.
// `null` is a hole: a value nobody has given yet, never a default.

export const LUBEC_STATS = ['Strength', 'Speed', 'Intellect', 'Handle', 'Charm'] as const
export const LUBEC_SAVES = ['Sanity', 'Fear', 'Body'] as const

export type LubecStat = typeof LUBEC_STATS[number]
export type LubecSave = typeof LUBEC_SAVES[number]
export type LubecValueName = LubecStat | LubecSave

export const LUBEC_VALUE_NAMES: readonly LubecValueName[] = [...LUBEC_STATS, ...LUBEC_SAVES]

export type LubecClassChoices = {
  /** The Stat taking -10, for a Nerd or a Popular Kid. */
  statPenalty?: string | null
  /** The Stat gaining +5, for an Overachiever. */
  statBonus?: string | null
}

export type LubecSheet = {
  age: number | null
  /** The class key as stored; a key the rules do not know reads as a hole. */
  class: { key: string | null; choices: LubecClassChoices }
  /** Base values before class modifiers; a value that is not a whole number reads as a hole. */
  base: Record<LubecValueName, number | null>
  /** Skill names as stored; a name the skill data does not know counts for nothing. */
  skills: { free: string | null; picked: readonly string[] }
}

export const isLubecStat = (name: string): name is LubecStat =>
  (LUBEC_STATS as readonly string[]).includes(name)
