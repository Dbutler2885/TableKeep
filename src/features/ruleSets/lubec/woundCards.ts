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

function fingerModifiers(spec: LubecWoundStepSpec, context: LubecWoundCardContext): FlatModifier[] {
  const fingerCount = context.rolled?.fingers ?? context.fingers ?? 0
  return spec.perFinger && fingerCount ? [{ target: 'Handle', amount: spec.perFinger * fingerCount }] : []
}

function rolledModifiers(spec: LubecWoundStepSpec, context: LubecWoundCardContext, at: { card: string; step: number }): FlatModifier[] {
  const amounts = context.rolled?.amounts ?? {}
  return (spec.rolled ?? []).map(({ target }) => ({ target, amount: -(amounts[lubecRolledKey(at.card, at.step, target)] ?? 0) }))
}

/** Optional step rules retain their source data; an absent or empty rule is not persisted. */
function stepRules(spec: LubecWoundStepSpec): Partial<LubecEffectStep> {
  const arrays = ['fractions', 'setTo', 'rolls', 'taskModifiers'] as const
  const values = ['charmReminder', 'minimumStress', 'onReach'] as const
  return Object.fromEntries([
    ...arrays.filter((key) => spec[key]?.length).map((key) => [key, spec[key]]),
    ...values.filter((key) => spec[key]).map((key) => [key, spec[key]]),
  ])
}

function stepOf(spec: LubecWoundStepSpec, context: LubecWoundCardContext, at: { card: string; step: number }): LubecEffectStep {
  const modifiers = [...(spec.modifiers ?? []), ...fingerModifiers(spec, context), ...rolledModifiers(spec, context, at)]
  return {
    ...stepRules(spec),
    modifiers: mergedModifiers(modifiers).filter((modifier) => modifier.amount !== 0),
    labels: labelsOf(spec, context),
    until: spec.until,
    ...(spec.restrictions?.length ? { restrictions: spec.restrictions.map((restriction) => restrictionOf(restriction, context.source.part)) } : {}),
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

const capitalised = (words: string) => `${words.charAt(0).toUpperCase()}${words.slice(1)}`

const roundsWords = (rounds: readonly number[]) => `round${rounds.length === 1 ? '' : 's'} ${rounds.join(', ')}`

/** "Action + Defense lost in round 3; Movement lost in round 4"; a Movement-only loss just its rounds, as its card already says Movement lost. */
function lostWords(lost: { movement: number[]; action: number[] }): string {
  if (!lost.action.length) return capitalised(roundsWords(lost.movement))
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

type StageLoss = Extract<LubecWoundNow, { kind: 'lose-movement' | 'lose-action' | 'dazed' }>
const STAGE_KEYS = { 'lose-movement': 'movement', 'lose-action': 'action', dazed: 'dazed' } as const

const dazedTurns = (now: Extract<StageLoss, { kind: 'dazed' }>, rolled: LubecWoundRolled) =>
  now.turns === 1 ? 1 : rolled.dazed ?? 1

function stageCard(now: StageLoss, rolled: LubecWoundRolled): LubecWoundCardSpec {
  const key = STAGE_KEYS[now.kind]
  const part = { movement: 'Movement lost', action: 'Action lost', dazed: 'Dazed' }[key]
  const lost = rolled.lost?.[key]
  const turns = now.kind === 'dazed' ? dazedTurns(now, rolled) : 1
  const rolledWords = now.kind === 'dazed' && now.turns !== 1 ? ` (1d4 = ${turns})` : ''
  return { key, part, steps: [{ until: 'rounds', labels: [(lost ? lostWords(lost) : fallbackWords(now.kind, turns)) + rolledWords] }] }
}

function unconsciousCard(now: Extract<LubecWoundNow, { kind: 'unconscious' }>, rolled: LubecWoundRolled): LubecWoundCardSpec {
  const minutes = rolled.minutes ?? []
  const sum = minutes.reduce((total, die) => total + die, 0)
  const aftermath = now.aftermath ? ['On waking: Severe Concussion Body Save at Disadvantage'] : []
  return { key: 'unconscious', part: 'Unconscious', steps: [{ until: 'by-hand', restrictions: [{ kind: 'unconscious' }], labels: [`Clear by hand: 2d10 = ${minutes.join(' + ')} = ${sum} minutes`, ...aftermath] }] }
}

/** Immediate consequences select their own card builder; drops and Death Saves do not create a stage card. */
function nowCard(now: LubecWoundNow, rolled: LubecWoundRolled): LubecWoundCardSpec | null {
  if (now.kind in STAGE_KEYS) return stageCard(now as StageLoss, rolled)
  if (now.kind === 'unconscious') return unconsciousCard(now, rolled)
  if (now.kind !== 'knocked-down') return null
  return { key: 'down', part: 'Knocked down', steps: [{ until: 'combat-end', restrictions: [{ kind: 'down' }], labels: ['Standing uses Movement and Action unless a Speed Check succeeds'] }] }
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
  return specs.map((spec) => contextualCard(spec, context, outcome))
}

const hasWakingSave = (outcome: LubecWoundOutcome) =>
  outcome.now?.some((now) => now.kind === 'unconscious' && now.aftermath === 'severe-concussion')

/** Snapshot, waking procedure and round metadata travel together on each independently recovering card. */
function contextualCard(spec: LubecWoundCardSpec, context: LubecWoundCardContext, outcome: LubecWoundOutcome): LubecEffect {
  const card = cardOf(spec, context)
  if (spec.key === 'unconscious' && hasWakingSave(outcome)) card.wakeSave = 'severe-concussion'
  return cardRoundMetadata(card, context.rolled ?? {})
}

function cardRoundMetadata(card: LubecEffect, rolled: LubecWoundRolled): LubecEffect {
  const timer = rolled.timers?.find((entry) => entry.kind === card.cardKey)
  const lost = rolled.lost?.[card.cardKey as 'movement' | 'action' | 'dazed']
  if (timer) return { ...card, countdown: { kind: timer.kind, rounds: timer.rounds } }
  return lost ? { ...card, lost } : card
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
  /** Hands, two-handed actions, Run, Evasive and crawling; speech is shown as its words, for the table to play. */
  restrictions: true,
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
  speechSave: true,
}

const STAGE_CARDS = ['movement', 'action', 'dazed', 'down', 'unconscious']

type StepFeature = (effect: LubecEffect, step: LubecEffectStep) => boolean
const STEP_FEATURES: Record<keyof typeof LUBEC_AUTOMATED, StepFeature> = {
  rolls: (_, step) => lubecStepRolls(step).length > 0,
  restrictions: (_, step) => lubecStepRestrictions(step).some((restriction) => restriction.kind !== 'down' && restriction.kind !== 'unconscious'),
  taskModifiers: (_, step) => lubecStepTaskModifiers(step).length > 0,
  stages: (effect) => STAGE_CARDS.includes(String(effect.cardKey)),
  rounds: (effect, step) => step.until === 'rounds' && !effect.countdown && !effect.lost,
  windows: (_, step) => step.until === 'next-round-end',
  closing: (_, step) => step.until === 'combat-end',
  speechSave: (_, step) => typeof step.onReach === 'object' && step.onReach !== null,
}

/** Whether any part of a card's current step is still resolved by hand. */
export function lubecStepByHand(effect: LubecEffect, step: LubecEffectStep | undefined = effect.steps[0]): boolean {
  if (!step || !lubecEffectWound(effect)) return false
  return (Object.keys(STEP_FEATURES) as (keyof typeof STEP_FEATURES)[])
    .some((feature) => !LUBEC_AUTOMATED[feature] && STEP_FEATURES[feature](effect, step))
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
function windowTrigger(effect: LubecEffect): string | null {
  const origin = effect.combatOrigin as { originatingRound?: unknown } | undefined
  return Number.isInteger(origin?.originatingRound) ? `Ends with round ${(origin!.originatingRound as number) + 1}` : null
}

/** A card that lists the rounds it takes; its own words already say when it ends. */
function hasLostRounds(effect: LubecEffect): boolean {
  const lost = effect.lost as { movement?: unknown; action?: unknown } | undefined
  return Boolean(lost && Array.isArray(lost.movement) && Array.isArray(lost.action))
}

function countdownTrigger(effect: LubecEffect): string | null {
  const origin = effect.combatOrigin as { originatingRound?: unknown } | undefined
  const countdown = effect.countdown as { rounds?: unknown; fired?: unknown } | undefined
  if (countdown && !countdown.fired && Number.isInteger(countdown.rounds) && Number.isInteger(origin?.originatingRound)) {
    return `Due at the end of round ${(origin!.originatingRound as number) + (countdown.rounds as number)}`
  }
  return null
}

const ROUND_TRIGGERS: Partial<Record<string, (effect: LubecEffect) => string | null>> = {
  'next-round-end': windowTrigger,
  rounds: countdownTrigger,
}

/** Only the round a wound card's step ends with, when the fight set one ("Ends with round 3"); the table's own words say the rest. */
export function lubecWoundRoundTrigger(effect: LubecEffect): string | null {
  if (hasLostRounds(effect)) return null
  return ROUND_TRIGGERS[effect.steps[0]?.until ?? '']?.(effect) ?? null
}

export function lubecEffectTrigger(effect: LubecEffect): string | null {
  if (hasLostRounds(effect)) return null
  const step = effect.steps[0]
  return ROUND_TRIGGERS[step?.until ?? '']?.(effect) ?? lubecStepTrigger(step)
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
