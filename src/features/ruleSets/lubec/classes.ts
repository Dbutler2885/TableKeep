import type { LubecClassChoices, LubecStat, LubecValueName } from './sheet'

// Transcribed from the standalone Lubec sheet
// (combined-character-sheet-prototype.html); Table Keep owns this copy.

export type LubecClassKey = 'working' | 'nerd' | 'tough' | 'scout' | 'popular'

/** A class's own choice: one Stat, from a fixed list, takes the amount. */
export type LubecClassChoice = {
  field: keyof LubecClassChoices
  label: string
  amount: number
  options: readonly LubecStat[]
}

/** One way a class's picks may add up, beside the free class skill. */
export type LubecPackageShape = { trained: number; expert: number }

/** A free class skill from `free`, then picks that match one shape exactly. */
export type LubecSkillPackage = { free: readonly string[]; shapes: readonly LubecPackageShape[] }

export type LubecClass = {
  key: LubecClassKey
  name: string
  /** Who the kid is, in the prototype's words, shown at the head of the class record. */
  description: string
  modifiers: Partial<Record<LubecValueName, number>>
  choice: LubecClassChoice | null
  traumaResponse: { name: string; text: string }
  classRule: string | null
  /** The Trauma at which a Death Save is called for. */
  deathSaveTrauma: number
  /** The Stress a failed Stat Check adds. */
  failedStatCheckStress: number
  skillPackage: LubecSkillPackage
}

const ONE_EXPERT_OR_TWO_TRAINED = [{ trained: 0, expert: 1 }, { trained: 2, expert: 0 }]

const allStats = (amount: number) =>
  ({ Strength: amount, Speed: amount, Intellect: amount, Handle: amount, Charm: amount })

export const LUBEC_CLASSES: Readonly<Record<LubecClassKey, LubecClass>> = {
  working: {
    key: 'working',
    name: 'Working Kid',
    description:
      "Your family's work is your work. You play a major role in the family business or family labor, especially all summer, but also evenings and weekends. You have had to grow up a little faster than most kids.",
    modifiers: { ...allStats(5), Sanity: 10, Fear: 10, Body: 10 },
    choice: null,
    traumaResponse: {
      name: 'Steady Under Pressure',
      text: 'Once per session, you may take Advantage on a Panic Check.',
    },
    classRule: null,
    deathSaveTrauma: 4,
    failedStatCheckStress: 1,
    skillPackage: { free: ['Boatwork', 'Jury-Rigging', 'Tides & Flats'], shapes: [{ trained: 1, expert: 1 }] },
  },
  nerd: {
    key: 'nerd',
    name: 'Nerd',
    description:
      'Tape on your glasses, adenoids, wall-eyed, and mental math. Maybe you live in the library, run the projector, build radios, do science experiments, know history, or all of the above.',
    modifiers: { Intellect: 20, Sanity: 30 },
    choice: { field: 'statPenalty', label: 'Stat taking -10', amount: -10, options: ['Strength', 'Speed', 'Handle', 'Charm'] },
    traumaResponse: {
      name: 'Failed Sanity Spreads Stress',
      text: 'Whenever you fail a Sanity Save, every Close Group friend who witnesses it gains 1 Stress.',
    },
    classRule: null,
    deathSaveTrauma: 4,
    failedStatCheckStress: 1,
    skillPackage: {
      free: ['Electronics & Radio', 'Science', 'History & Geography'],
      // Changed from the standalone sheet's 2 Expert: one more Trained skill of
      // the player's choice, so the Experts need not all hang off the free skill.
      shapes: [{ trained: 1, expert: 2 }],
    },
  },
  tough: {
    key: 'tough',
    name: 'Tough',
    description:
      'For whatever reason, it was advantageous for you to look tough, act tough, and become tough. Maybe you learned to scrap, stare somebody down, hide pain, and never let anyone see you flinch.',
    modifiers: { Strength: 10, Body: 10, Fear: 20 },
    choice: null,
    traumaResponse: {
      name: 'Your Panic Triggers Fear',
      text: 'Whenever you Panic, every Close Group friend who witnesses it must make a Fear Save.',
    },
    classRule: null,
    deathSaveTrauma: 5,
    failedStatCheckStress: 1,
    skillPackage: { free: ['Scrapping', 'Athletics', 'Tough Talk'], shapes: ONE_EXPERT_OR_TWO_TRAINED },
  },
  scout: {
    key: 'scout',
    name: 'Overachiever',
    description:
      'You are prepared, capable, and used to being right. Maybe you are a Scout, honor-roll kid, student leader, church volunteer, athlete, or the one adults always trust.',
    modifiers: { Intellect: 10, Fear: 60 },
    choice: { field: 'statBonus', label: 'Stat gaining +5', amount: 5, options: ['Strength', 'Speed', 'Handle', 'Charm'] },
    traumaResponse: {
      name: 'Your Success Raises the Stakes',
      text: 'When you and Close Group friends make Fear Saves against the same threat, each friend who fails gains 2 Stress instead of 1 if you succeed.',
    },
    classRule: 'Failed Stat Checks give +2 Stress instead of +1.',
    deathSaveTrauma: 4,
    failedStatCheckStress: 2,
    skillPackage: { free: ['Campcraft', 'First Aid', "Teacher's Pet"], shapes: ONE_EXPERT_OR_TWO_TRAINED },
  },
  popular: {
    key: 'popular',
    name: 'Popular Kid',
    description:
      "Everybody knows your name. Maybe you're good-looking, the star of the team, the funniest kid in class, or you just have a way with people. Kids want to be around you, and adults let you get away with things.",
    modifiers: { Charm: 20, Fear: 20 },
    choice: { field: 'statPenalty', label: 'Stat taking -10', amount: -10, options: ['Strength', 'Speed', 'Intellect', 'Handle'] },
    traumaResponse: {
      name: 'Everyone Looks to You',
      text: 'Whenever you fail a Fear Save, every Close Group friend who witnesses it gains 1 Stress.',
    },
    classRule: null,
    deathSaveTrauma: 4,
    failedStatCheckStress: 1,
    skillPackage: { free: ['Athletics', 'Art', 'Music', 'Class Clown', "Teacher's Pet"], shapes: ONE_EXPERT_OR_TWO_TRAINED },
  },
}

/** The class a stored key names, or null for a missing or unknown key. */
export function lubecClass(key: string | null): LubecClass | null {
  return key !== null && Object.hasOwn(LUBEC_CLASSES, key) ? LUBEC_CLASSES[key as LubecClassKey] : null
}

/** The Stat a class's choice names, or null when it is missing or not on the class's list. */
export function chosenStat(choice: LubecClassChoice, choices: LubecClassChoices): LubecStat | null {
  const value = choices[choice.field]
  return choice.options.find((option) => option === value) ?? null
}
