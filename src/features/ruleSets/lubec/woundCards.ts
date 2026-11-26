import type { LubecEffect, LubecEffectStep } from './effects'
import type { LubecWoundTimer } from './woundTables/outcome'
import type { LubecWoundSeverity } from './woundTables/types'

// What a wound's Effect cards carry and how the sheet shows them: the snapshot
// of the wound as it landed, its drop, and its cards gathered under it. A card
// never re-reads the table, so a later change to the table's words leaves every
// saved wound as it landed. When a card's rounds end, and what the fight does
// with them, is the wound lifetime's (`./woundLifetime`).

/** One Check or Save the wound made the target roll when it landed. */
export type LubecWoundRolledCheck = {
  /** What the roll decided: "Severe Concussion", "Keep hold". */
  purpose: string
  kind: 'stat-check' | 'save'
  against: string
  mode: 'advantage' | 'normal' | 'disadvantage'
  target: number
  dice: number[]
  result: number
  success: boolean
  stress: number
}

/** The wound as it landed: where it came from, every die and roll that made it, and what it charged. */
export type LubecWoundSource = {
  /** Every card one wound made shares this; it is the wound's delivery identity once on the sheet. */
  groupId: string
  table: string
  tableName: string
  /** The table location that was read ("forearm"); `part` is the struck part, with its side. */
  location: string
  part: string
  impact: number
  severity: LubecWoundSeverity
  row: string
  /** The row's words as the final file prints them, or the version its Save or d2 picked. */
  prose: string
  /** The d2 a two-wound row rolled; null when it has none. */
  branch: number | null
  contentVersion: string
  /** Every die rolled for the wound, by what it was for. */
  dice: Record<string, number[]>
  checks: LubecWoundRolledCheck[]
  trauma: number
  stress: number
  minimumStress: number
  /** The struck hand's drop, when the row has one; absent on a wound without a drop or saved before drops were played. */
  drop?: LubecWoundDrop
}

/** A hand a wound can strike: the side of the struck part. */
export type LubecHand = 'left' | 'right'

/**
 * A wound's drop from the struck hand: which hand, the Handle Check that may have kept hold, and what the hand held.
 * `kept` is absent on an automatic drop; `held` is null for an empty hand and absent until the sheet has been read.
 */
export type LubecWoundDrop = { hand: LubecHand; kept?: boolean; held?: string | null }

/** The drop as the Results and the wound detail say it. */
export function lubecDropWords(drop: LubecWoundDrop): string {
  if (drop.held === null) return `The ${drop.hand} hand held nothing to drop`
  if (drop.kept === true) return `Kept hold of the ${drop.held ?? 'item'} in the ${drop.hand} hand`
  if (drop.held === undefined) return `Whatever the ${drop.hand} hand holds drops onto the Floor`
  return `The ${drop.held} drops from the ${drop.hand} hand onto the Floor`
}

/** Whether the drop still has to take something out of the hand: not kept, and not already known to be empty. */
export const lubecDropPending = (drop: LubecWoundDrop | null | undefined): drop is LubecWoundDrop =>
  Boolean(drop) && drop!.kept !== true && drop!.held !== null

/** The amounts the wound rolled once when it landed, which its cards carry from then on. */
export type LubecWoundRolled = {
  dazed?: number
  /** Unconscious minutes: the 2d10 and their sum. */
  minutes?: number[]
  minimumStress?: number
  fingers?: number
  /** Countdowns the prevention Save did not stop, with the d4 each rolled. */
  timers?: { kind: LubecWoundTimer; rounds: number }[]
  /** Losses rolled once, by `card.step.target`. */
  amounts?: Record<string, number>
}

/** Where a rolled loss is kept: the card, the step and the value it lowers. */
export const lubecRolledKey = (card: string, step: number, target: string) => `${card}.${step}.${target}`

/** The struck part's side: "forearm-L" is the left. A part without one reads as the right, as a hit location without a side cannot name an arm. */
const struckSide = (part: string): 'L' | 'R' => (part.endsWith('-L') ? 'L' : 'R')

/** The hand on the struck part's side, as a drop or a hand restriction reads it. */
export const lubecStruckHand = (part: string): LubecHand => (struckSide(part) === 'L' ? 'left' : 'right')

/** The wound snapshot a card carries, when it carries one the sheet can read. */
export function lubecEffectWound(effect: LubecEffect): LubecWoundSource | null {
  const wound = effect.wound as Partial<LubecWoundSource> | undefined
  if (!wound || typeof wound !== 'object' || typeof wound.row !== 'string' || typeof wound.table !== 'string') return null
  return wound as LubecWoundSource
}

const UNTIL_WORDS = {
  'next-round-end': 'Until the end of the next round',
  rounds: 'Counts down by round',
  'combat-end': 'Ends with combat',
  'long-rest': 'Step down after 1 Long Rest',
  treated: 'Step down after First Aid',
  'put-back': 'Step down once put back in place',
  'by-hand': 'Clear by hand',
  lasting: 'Lasting',
} as const

/** What ends a card's current step, as the card says it; null on a hand-made step that does not say. */
export function lubecStepTrigger(step: LubecEffectStep | undefined): string | null {
  const until = step?.until
  return typeof until === 'string' && Object.hasOwn(UNTIL_WORDS, until) ? UNTIL_WORDS[until as keyof typeof UNTIL_WORDS] : null
}

/** A final row's prose as the sheet shows it: the table's `amounts`, *names* and line breaks without their marks. */
export const lubecPlainProse = (text: string): string => text.replace(/<br>/g, ' ').replace(/[`*]/g, '').replace(/\s+/g, ' ').trim()

type EffectGroup = { key: string; wound: LubecWoundSource | null; effects: LubecEffect[] }
const existingGroup = (groups: EffectGroup[], wound: LubecWoundSource | null) =>
  wound?.groupId ? groups.find((group) => group.wound?.groupId === wound.groupId) : undefined

/** The effects in their order, with each wound's linked cards gathered under the first of them. */
export function lubecEffectGroups(effects: readonly LubecEffect[]): { key: string; wound: LubecWoundSource | null; effects: LubecEffect[] }[] {
  const groups: { key: string; wound: LubecWoundSource | null; effects: LubecEffect[] }[] = []
  for (const effect of effects) {
    const wound = lubecEffectWound(effect)
    const existing = existingGroup(groups, wound)
    if (existing) existing.effects.push(effect)
    else groups.push({ key: wound?.groupId || effect.id, wound, effects: [effect] })
  }
  return groups
}
