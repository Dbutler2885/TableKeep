import type { LubecModifier } from './derivations'
import { lubecStepRestrictions, lubecStepRolls, lubecStepTaskModifiers, type LubecEffect, type LubecEffectStep, type LubecRestriction } from './effects'
import type { LubecRestrictionSpec, LubecWoundCardSpec, LubecWoundNow, LubecWoundOutcome, LubecWoundStepSpec, LubecWoundTimer } from './woundTables/outcome'
import type { LubecWoundSeverity } from './woundTables/types'

// A landed final wound as Effect cards on the target's sheet: one card per
// consequence that recovers on its own schedule, every card carrying the same
// snapshot of the wound that made it. A card never re-reads the table, so a
// later change to the table's words leaves every saved wound as it landed.

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
}

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

/** What the card builder needs beyond the row: the snapshot, the one-line cause, and the rolled amounts. */
export type LubecWoundCardContext = { source: Omit<LubecWoundSource, 'groupId'>; cause: string; rolled?: LubecWoundRolled; fingers?: number }

type FlatModifier = { target: LubecModifier['target']; amount: number }

function mergedModifiers(list: readonly FlatModifier[]): FlatModifier[] {
  const sums = new Map<string, FlatModifier>()
  for (const modifier of list) {
    const before = sums.get(modifier.target)?.amount ?? 0
    sums.set(modifier.target, { target: modifier.target, amount: before + modifier.amount })
  }
  return [...sums.values()]
}

/** The struck part's side: "forearm-L" is the left. A part without one reads as the right, as a hit location without a side cannot name an arm. */
const struckSide = (part: string): 'L' | 'R' => (part.endsWith('-L') ? 'L' : 'R')

const restrictionOf = (spec: LubecRestrictionSpec, part: string): LubecRestriction =>
  ('side' in spec && spec.side === 'struck' ? { kind: spec.kind, side: struckSide(part) } : spec as LubecRestriction)

const SIDES = { L: 'left', R: 'right' } as const

function labelsOf(spec: LubecWoundStepSpec, context: LubecWoundCardContext): string[] {
  const fingers = context.rolled?.fingers ?? context.fingers ?? 0
  return (spec.labels ?? []).map((label) => label
    .replace('{fingers}', `${fingers} finger${fingers === 1 ? '' : 's'}`)
    .replace('{side}', SIDES[struckSide(context.source.part)]))
}

function stepOf(spec: LubecWoundStepSpec, context: LubecWoundCardContext, at: { card: string; step: number }): LubecEffectStep {
  const fingerCount = context.rolled?.fingers ?? context.fingers ?? 0
  const fingers = spec.perFinger && fingerCount ? [{ target: 'Handle' as const, amount: spec.perFinger * fingerCount }] : []
  const rolled = (spec.rolled ?? []).map(({ target }) => ({ target, amount: -(context.rolled?.amounts?.[lubecRolledKey(at.card, at.step, target)] ?? 0) }))
  return {
    modifiers: mergedModifiers([...(spec.modifiers ?? []), ...fingers, ...rolled]).filter((modifier) => modifier.amount !== 0),
    labels: labelsOf(spec, context),
    until: spec.until,
    ...(spec.fractions?.length ? { fractions: spec.fractions } : {}),
    ...(spec.setTo?.length ? { setTo: spec.setTo } : {}),
    ...(spec.rolls?.length ? { rolls: spec.rolls } : {}),
    ...(spec.restrictions?.length ? { restrictions: spec.restrictions.map((restriction) => restrictionOf(restriction, context.source.part)) } : {}),
    ...(spec.taskModifiers?.length ? { taskModifiers: spec.taskModifiers } : {}),
    ...(spec.charmReminder ? { charmReminder: true } : {}),
    ...(spec.minimumStress ? { minimumStress: spec.minimumStress } : {}),
    ...(spec.onReach ? { onReach: spec.onReach } : {}),
  }
}

function cardOf(spec: LubecWoundCardSpec, context: LubecWoundCardContext): LubecEffect {
  return {
    id: spec.key, cardKey: spec.key, name: context.source.row, part: spec.part, cause: context.cause,
    steps: spec.steps.map((step, index) => stepOf(step, context, { card: spec.key, step: index })),
    struckLocation: context.source.part,
    wound: { ...context.source, groupId: '' },
  }
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** The card a stage-losing or downing consequence makes, carrying how many stages it takes. */
function nowCard(now: LubecWoundNow, rolled: LubecWoundRolled): LubecWoundCardSpec | null {
  switch (now.kind) {
    case 'lose-movement':
      return { key: 'movement', part: 'Movement lost', steps: [{ until: 'rounds', labels: ['Lose the next Movement Stage'] }] }
    case 'lose-action':
      return { key: 'action', part: 'Action lost', steps: [{ until: 'rounds', labels: ['Lose the next Action Stage, Defense with it'] }] }
    case 'dazed': {
      const turns = now.turns === 1 ? 1 : rolled.dazed ?? 1
      const stages = turns === 1 ? 'the next Movement and Action Stages' : `the next ${turns} Movement and ${turns} Action Stages`
      const rolledWords = now.turns === 1 ? '' : ` (1d4 = ${turns})`
      return { key: 'dazed', part: 'Dazed', steps: [{ until: 'rounds', labels: [`Lose ${stages}${rolledWords}`] }] }
    }
    case 'knocked-down':
      return { key: 'down', part: 'Knocked down', steps: [{ until: 'by-hand', restrictions: [{ kind: 'down' }], labels: ['Standing uses Movement and Action unless a Speed Check succeeds'] }] }
    case 'unconscious': {
      const minutes = rolled.minutes ?? []
      const sum = minutes.reduce((total, die) => total + die, 0)
      const aftermath = now.aftermath ? ['On waking: Severe Concussion Body Save at Disadvantage'] : []
      return { key: 'unconscious', part: 'Unconscious', steps: [{ until: 'by-hand', restrictions: [{ kind: 'unconscious' }], labels: [`Clear by hand: 2d10 = ${minutes.join(' + ')} = ${sum} minutes`, ...aftermath] }] }
    }
    default:
      return null
  }
}

const TIMER_CARDS: Readonly<Record<LubecWoundTimer, { part: string; words: (rounds: number) => string }>> = {
  bleed: { part: 'Bleeding', words: (rounds) => `+1 Trauma in d4 = ${plural(rounds, 'round')}` },
  critical: { part: 'Critical', words: (rounds) => `Death Save in d4 = ${plural(rounds, 'round')}` },
}

/** A countdown the prevention Save did not stop: its card, with the d4 it rolled. */
function timerCard(timer: { kind: LubecWoundTimer; rounds: number }): LubecWoundCardSpec {
  const { part, words } = TIMER_CARDS[timer.kind]
  return { key: timer.kind, part, steps: [{ until: 'rounds', labels: [words(timer.rounds)] }] }
}

/** The outcome's cards, each with its rolled amounts filled in and the wound's snapshot; ids are the card keys until delivery names them. */
export function lubecWoundCards(outcome: LubecWoundOutcome, context: LubecWoundCardContext): LubecEffect[] {
  const rolled = context.rolled ?? {}
  const specs = [
    ...(outcome.now ?? []).flatMap((now) => nowCard(now, rolled) ?? []),
    ...(rolled.timers ?? []).map(timerCard),
    ...outcome.cards,
  ]
  return specs.map((spec) => {
    const card = cardOf(spec, context)
    const timer = rolled.timers?.find((entry) => entry.kind === spec.key)
    return timer ? { ...card, countdown: { kind: timer.kind, rounds: timer.rounds } } : card
  })
}

/** The wound snapshot a card carries, when it carries one the sheet can read. */
export function lubecEffectWound(effect: LubecEffect): LubecWoundSource | null {
  const wound = effect.wound as Partial<LubecWoundSource> | undefined
  if (!wound || typeof wound !== 'object' || typeof wound.row !== 'string' || typeof wound.table !== 'string') return null
  return wound as LubecWoundSource
}

/**
 * Which kinds of consequence the app plays by itself yet. Anything else on a card is resolved by hand, and the
 * card and the Results say so; as each is automated its switch turns on, for every card old or new.
 */
export const LUBEC_AUTOMATED = {
  rolls: true,
  restrictions: false,
  taskModifiers: true,
  /** Lost stages, Dazed, knocked down, unconscious. */
  stages: false,
  /** Round windows and countdowns: "until the end of the next round", "in d4 rounds". */
  rounds: false,
  /** Rest-of-combat steps ending when the fight ends. */
  closing: false,
  /** A delayed speech-recovery Body Save offered by the Step down that reaches its step. */
  speechSave: false,
}

const STAGE_CARDS = ['movement', 'action', 'dazed', 'down', 'unconscious']

/** Whether any part of a card's current step is still resolved by hand. */
export function lubecStepByHand(effect: LubecEffect, step: LubecEffectStep | undefined = effect.steps[0]): boolean {
  if (!step || !lubecEffectWound(effect)) return false
  const until = step.until
  return (!LUBEC_AUTOMATED.rolls && lubecStepRolls(step).length > 0)
    || (!LUBEC_AUTOMATED.restrictions && lubecStepRestrictions(step).length > 0)
    || (!LUBEC_AUTOMATED.taskModifiers && lubecStepTaskModifiers(step).length > 0)
    || (!LUBEC_AUTOMATED.stages && STAGE_CARDS.includes(String(effect.cardKey)))
    || (!LUBEC_AUTOMATED.rounds && (until === 'rounds' || until === 'next-round-end'))
    || (!LUBEC_AUTOMATED.closing && until === 'combat-end')
    || (!LUBEC_AUTOMATED.speechSave && typeof step.onReach === 'object' && step.onReach !== null)
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

/** The effects in their order, with each wound's linked cards gathered under the first of them. */
export function lubecEffectGroups(effects: readonly LubecEffect[]): { key: string; wound: LubecWoundSource | null; effects: LubecEffect[] }[] {
  const groups: { key: string; wound: LubecWoundSource | null; effects: LubecEffect[] }[] = []
  for (const effect of effects) {
    const wound = lubecEffectWound(effect)
    const existing = wound?.groupId ? groups.find((group) => group.wound?.groupId === wound.groupId) : undefined
    if (existing) existing.effects.push(effect)
    else groups.push({ key: wound?.groupId || effect.id, wound, effects: [effect] })
  }
  return groups
}
