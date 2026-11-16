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
  /** The rounds each stage-losing consequence takes, worked out when the wound lands. */
  lost?: Partial<Record<'movement' | 'action' | 'dazed', { movement: number[]; action: number[] }>>
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

/** The hand on the struck part's side, as a drop or a hand restriction reads it. */
export const lubecStruckHand = (part: string): LubecHand => (struckSide(part) === 'L' ? 'left' : 'right')

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

const roundsWords = (rounds: readonly number[]) => `round${rounds.length === 1 ? '' : 's'} ${rounds.join(', ')}`

/** "Action + Defense lost in round 3; Movement lost in round 4". */
function lostWords(lost: { movement: number[]; action: number[] }): string {
  const parts = [
    ...(lost.action.length ? [`Action + Defense lost in ${roundsWords(lost.action)}`] : []),
    ...(lost.movement.length ? [`Movement lost in ${roundsWords(lost.movement)}`] : []),
  ]
  return parts.join('; ')
}

/** The words for a loss whose rounds were not worked out (a wound outside a fight's rounds). */
function fallbackWords(kind: 'lose-movement' | 'lose-action' | 'dazed', turns: number): string {
  if (kind === 'lose-movement') return 'Lose the next Movement Stage'
  if (kind === 'lose-action') return 'Lose the next Action Stage, Defense with it'
  return turns === 1 ? 'Lose the next Movement and Action Stages' : `Lose the next ${turns} Movement and ${turns} Action Stages`
}

/** The card a stage-losing or downing consequence makes, carrying how many stages it takes. */
function nowCard(now: LubecWoundNow, rolled: LubecWoundRolled): LubecWoundCardSpec | null {
  switch (now.kind) {
    case 'lose-movement':
    case 'lose-action':
    case 'dazed': {
      const key = now.kind === 'lose-movement' ? 'movement' : now.kind === 'lose-action' ? 'action' : 'dazed'
      const part = { movement: 'Movement lost', action: 'Action lost', dazed: 'Dazed' }[key]
      const lost = rolled.lost?.[key]
      const turns = now.kind === 'dazed' ? (now.turns === 1 ? 1 : rolled.dazed ?? 1) : 1
      const rolledWords = now.kind === 'dazed' && now.turns !== 1 ? ` (1d4 = ${turns})` : ''
      return { key, part, steps: [{ until: 'rounds', labels: [(lost ? lostWords(lost) : fallbackWords(now.kind, turns)) + rolledWords] }] }
    }
    case 'knocked-down':
      return { key: 'down', part: 'Knocked down', steps: [{ until: 'combat-end', restrictions: [{ kind: 'down' }], labels: ['Standing uses Movement and Action unless a Speed Check succeeds'] }] }
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
    if (spec.key === 'unconscious' && outcome.now?.some((now) => now.kind === 'unconscious' && now.aftermath === 'severe-concussion')) card.wakeSave = 'severe-concussion'
    const timer = rolled.timers?.find((entry) => entry.kind === spec.key)
    const lost = rolled.lost?.[spec.key as 'movement' | 'action' | 'dazed']
    if (timer) return { ...card, countdown: { kind: timer.kind, rounds: timer.rounds } }
    return lost ? { ...card, lost } : card
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
  stages: true,
  /** "Until the end of the next round": the round tick ends it. */
  windows: true,
  /** Round countdowns and stage counts: "in d4 rounds", Dazed. */
  rounds: false,
  /** Rest-of-combat steps ending when the fight ends. */
  closing: true,
  /** A delayed speech-recovery Body Save offered by the Step down that reaches its step. */
  speechSave: false,
}

const STAGE_CARDS = ['movement', 'action', 'dazed', 'down', 'unconscious']

/** Restrictions the app already plays while the rest still wait on `LUBEC_AUTOMATED.restrictions`: stages, and the hands. */
const PLAYED_RESTRICTIONS: readonly string[] = ['down', 'unconscious', 'arm-unusable', 'no-grip', 'no-two-handed']

/** Whether any part of a card's current step is still resolved by hand. */
export function lubecStepByHand(effect: LubecEffect, step: LubecEffectStep | undefined = effect.steps[0]): boolean {
  if (!step || !lubecEffectWound(effect)) return false
  const until = step.until
  return (!LUBEC_AUTOMATED.rolls && lubecStepRolls(step).length > 0)
    || (!LUBEC_AUTOMATED.restrictions && lubecStepRestrictions(step).some((restriction) => !PLAYED_RESTRICTIONS.includes(restriction.kind)))
    || (!LUBEC_AUTOMATED.taskModifiers && lubecStepTaskModifiers(step).length > 0)
    || (!LUBEC_AUTOMATED.stages && STAGE_CARDS.includes(String(effect.cardKey)))
    || (!LUBEC_AUTOMATED.rounds && until === 'rounds' && !effect.countdown && !effect.lost)
    || (!LUBEC_AUTOMATED.windows && until === 'next-round-end')
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

/** What ends a card's current step, naming the round a fight's window ends with ("Ends with round 3"). */
export function lubecEffectTrigger(effect: LubecEffect): string | null {
  const step = effect.steps[0]
  const origin = effect.combatOrigin as { originatingRound?: unknown } | undefined
  if (step?.until === 'next-round-end' && Number.isInteger(origin?.originatingRound)) return `Ends with round ${(origin!.originatingRound as number) + 1}`
  const lost = effect.lost as { movement?: unknown; action?: unknown } | undefined
  if (step?.until === 'rounds' && lost && Array.isArray(lost.movement) && Array.isArray(lost.action)) {
    return `Ends after round ${Math.max(...(lost.movement as number[]), ...(lost.action as number[]))}`
  }
  const countdown = effect.countdown as { rounds?: unknown; fired?: unknown } | undefined
  if (step?.until === 'rounds' && countdown && !countdown.fired && Number.isInteger(countdown.rounds) && Number.isInteger(origin?.originatingRound)) {
    return `Due at the end of round ${(origin!.originatingRound as number) + (countdown.rounds as number)}`
  }
  return lubecStepTrigger(step)
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
