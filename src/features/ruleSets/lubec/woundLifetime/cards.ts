import type { LubecModifier } from '../derivations'
import type { LubecEffect, LubecEffectStep, LubecRestriction } from '../effects'
import { lubecRolledKey, lubecStruckHand, type LubecWoundRolled } from '../woundCards'
import type { LubecRestrictionSpec, LubecWoundCardSpec, LubecWoundNow, LubecWoundOutcome, LubecWoundStepSpec, LubecWoundTimer } from '../woundTables/outcome'
import type { LandingInput, Lost } from './types'

// A landed final wound as Effect cards on the target's sheet: one card per
// consequence that recovers on its own schedule, every card carrying the same
// snapshot of the wound that made it. A card never re-reads the table, so a
// later change to the table's words leaves every saved wound as it landed.

/** The rounds each stage-losing consequence takes, by the card that carries them. */
export type LostByCard = Partial<Record<'movement' | 'action' | 'dazed', Lost>>

type Context = LandingInput['context']

type FlatModifier = { target: LubecModifier['target']; amount: number }

function mergedModifiers(list: readonly FlatModifier[]): FlatModifier[] {
  const sums = new Map<string, FlatModifier>()
  for (const modifier of list) {
    const before = sums.get(modifier.target)?.amount ?? 0
    sums.set(modifier.target, { target: modifier.target, amount: before + modifier.amount })
  }
  return [...sums.values()]
}

/** The struck part's side: "forearm-L" is the left. */
const struckSide = (part: string): 'L' | 'R' => (lubecStruckHand(part) === 'left' ? 'L' : 'R')

const restrictionOf = (spec: LubecRestrictionSpec, part: string): LubecRestriction =>
  ('side' in spec && spec.side === 'struck' ? { kind: spec.kind, side: struckSide(part) } : spec as LubecRestriction)

function labelsOf(spec: LubecWoundStepSpec, context: Context): string[] {
  const fingers = context.rolled.fingers ?? 0
  return (spec.labels ?? []).map((label) => label
    .replace('{fingers}', `${fingers} finger${fingers === 1 ? '' : 's'}`)
    .replace('{side}', lubecStruckHand(context.source.part)))
}

function fingerModifiers(spec: LubecWoundStepSpec, context: Context): FlatModifier[] {
  const fingerCount = context.rolled.fingers ?? 0
  return spec.perFinger && fingerCount ? [{ target: 'Handle', amount: spec.perFinger * fingerCount }] : []
}

function rolledModifiers(spec: LubecWoundStepSpec, context: Context, at: { card: string; step: number }): FlatModifier[] {
  const amounts = context.rolled.amounts ?? {}
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

function stepOf(spec: LubecWoundStepSpec, context: Context, at: { card: string; step: number }): LubecEffectStep {
  const modifiers = [...(spec.modifiers ?? []), ...fingerModifiers(spec, context), ...rolledModifiers(spec, context, at)]
  return {
    ...stepRules(spec),
    modifiers: mergedModifiers(modifiers).filter((modifier) => modifier.amount !== 0),
    labels: labelsOf(spec, context),
    until: spec.until,
    ...(spec.restrictions?.length ? { restrictions: spec.restrictions.map((restriction) => restrictionOf(restriction, context.source.part)) } : {}),
  }
}

function cardOf(spec: LubecWoundCardSpec, context: Context): LubecEffect {
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
function lostWords(lost: Lost): string {
  if (!lost.action.length) return capitalised(roundsWords(lost.movement))
  const parts = [
    `Action + Defense lost in ${roundsWords(lost.action)}`,
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

export type StageLoss = Extract<LubecWoundNow, { kind: 'lose-movement' | 'lose-action' | 'dazed' }>

/** The card each stage-losing consequence makes, which also carries the rounds it takes. */
export const STAGE_KEYS = { 'lose-movement': 'movement', 'lose-action': 'action', dazed: 'dazed' } as const

/** How many turns a daze takes: one, or the 1d4 it rolled. */
export const dazedTurns = (now: StageLoss, rolled: LubecWoundRolled): number =>
  (now.kind !== 'dazed' || now.turns === 1 ? 1 : rolled.dazed ?? 1)

function stageCard(now: StageLoss, rolled: LubecWoundRolled, lostByCard: LostByCard | null): LubecWoundCardSpec {
  const key = STAGE_KEYS[now.kind]
  const part = { movement: 'Movement lost', action: 'Action lost', dazed: 'Dazed' }[key]
  const lost = lostByCard?.[key]
  const turns = dazedTurns(now, rolled)
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
function nowCard(now: LubecWoundNow, rolled: LubecWoundRolled, lostByCard: LostByCard | null): LubecWoundCardSpec | null {
  if (now.kind in STAGE_KEYS) return stageCard(now as StageLoss, rolled, lostByCard)
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

const hasWakingSave = (outcome: LubecWoundOutcome) =>
  outcome.now?.some((now) => now.kind === 'unconscious' && now.aftermath === 'severe-concussion')

function cardRoundMetadata(card: LubecEffect, rolled: LubecWoundRolled, lostByCard: LostByCard | null): LubecEffect {
  const timer = rolled.timers?.find((entry) => entry.kind === card.cardKey)
  const lost = lostByCard?.[card.cardKey as keyof LostByCard]
  if (timer) return { ...card, countdown: { kind: timer.kind, rounds: timer.rounds } }
  return lost ? { ...card, lost } : card
}

/**
 * The outcome's cards, each with its rolled amounts filled in and the wound's snapshot; ids are the card keys until
 * delivery names them. Snapshot, waking procedure and round metadata travel together on each independently recovering card.
 */
export function woundCards(outcome: LubecWoundOutcome, context: Context, lostByCard: LostByCard | null): LubecEffect[] {
  const { rolled } = context
  const specs = [
    ...(outcome.now ?? []).flatMap((now) => nowCard(now, rolled, lostByCard) ?? []),
    ...(rolled.timers ?? []).map(timerCard),
    ...outcome.cards,
  ]
  return specs.map((spec) => {
    const card = cardOf(spec, context)
    if (spec.key === 'unconscious' && hasWakingSave(outcome)) card.wakeSave = 'severe-concussion'
    return cardRoundMetadata(card, rolled, lostByCard)
  })
}
