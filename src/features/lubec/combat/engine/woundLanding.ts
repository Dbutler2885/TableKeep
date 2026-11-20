import type { LubecEffect, LubecEffectStep } from '../../../ruleSets/lubec/effects'
import { describeLubecEffectStep } from '../../../ruleSets/lubec/effects'
import { lubecDropWords, lubecRolledKey, lubecStepByHand, lubecStepTrigger, type LubecWoundDrop, type LubecWoundRolled } from '../../../ruleSets/lubec/woundCards'
import { lubecConcussionOutcome, lubecConcussionTraumaRelief } from '../../../ruleSets/lubec/woundTables/concussion'
import type { LubecWoundNow, LubecWoundOutcome } from '../../../ruleSets/lubec/woundTables/outcome'
import type { LubecWoundTableRow } from '../../../ruleSets/lubec/woundTables/types'
import type { CombatEntropy } from './commandEntropy'
import type { CombatCheckRoll, CombatLandingRollSpec, CombatWoundSection } from './types'

// A final row landing: which Saves and Checks it asks the target for, what
// their results give, the amounts it rolls once (1d4 Dazed, 2d10 minutes, 1d5
// Minimum Stress, fingers, each countdown's d4), and the Results it shows, by
// when each consequence happens. Pure: the caller rolls the target's dice and
// queues the wound.

/** A row's outcome with its d2 branch's added to it. */
export function lubecRowOutcome(row: LubecWoundTableRow, pick: number | null): LubecWoundOutcome {
  const base = row.outcome ?? { cards: [] }
  const branch = pick === null ? undefined : row.choices?.[pick - 1]?.outcome
  return branch ? mergeOutcomes(base, branch) : base
}

export function mergeOutcomes(a: LubecWoundOutcome, b: LubecWoundOutcome): LubecWoundOutcome {
  const timers = mergedTimers(a, b)
  const fingers = b.fingers ?? a.fingers
  return {
    now: [...(a.now ?? []), ...(b.now ?? [])],
    cards: [...a.cards, ...b.cards],
    ...(timers.length ? { timers } : {}),
    ...(fingers ? { fingers } : {}),
  }
}

const mergedTimers = (a: LubecWoundOutcome, b: LubecWoundOutcome) => [...new Set([...(a.timers ?? []), ...(b.timers ?? [])])]
const needsRetention = (outcome: LubecWoundOutcome) => outcome.now?.some((now) => now.kind === 'drop' && now.check)

function concussionRolls(row: LubecWoundTableRow): CombatLandingRollSpec[] {
  if (!row.concussion) return []
  return [{ purpose: 'concussion', kind: 'save', against: 'Body', advantage: row.concussion.mode ?? 'normal' }]
}

/** The Saves and Checks a final row asks for, in the order they are rolled. */
export function lubecLandingRolls(row: LubecWoundTableRow, pick: number | null): CombatLandingRollSpec[] {
  const rolls: CombatLandingRollSpec[] = []
  if (row.fistCatch) rolls.push({ purpose: 'fist-catch', kind: 'stat-check', against: 'Handle', advantage: 'normal' })
  rolls.push(...concussionRolls(row))
  const outcome = lubecRowOutcome(row, pick)
  if (outcome.timers?.length) rolls.push({ purpose: 'prevention', kind: 'save', against: 'Body', advantage: 'normal' })
  // "Dropped unless a Handle Check succeeds": the target rolls it now, against the sheet as it stood before this wound.
  if (needsRetention(outcome)) rolls.push({ purpose: 'retention', kind: 'stat-check', against: 'Handle', advantage: 'normal' })
  return rolls
}

/** What the landing rolls decided: no wound at all for a missed fist catch, or the outcome, its Trauma and its Stress. */
export type LubecLanded =
  | { wound: false }
  | { wound: true; outcome: LubecWoundOutcome; trauma: number; stress: number; prevented: boolean }

const resultOf = (checks: readonly CombatCheckRoll[], purpose: CombatCheckRoll['purpose']) => checks.find((check) => check.purpose === purpose)

function concussionLanding(row: LubecWoundTableRow, pick: number | null, checks: readonly CombatCheckRoll[]) {
  const base = lubecRowOutcome(row, pick)
  const concussion = resultOf(checks, 'concussion')
  if (!row.concussion || !concussion) return { outcome: base, relief: 0 }
  return {
    outcome: mergeOutcomes(lubecConcussionOutcome(row.concussion, concussion.success), base),
    relief: lubecConcussionTraumaRelief(row.concussion, concussion.success),
  }
}

export function lubecLanded(row: LubecWoundTableRow, pick: number | null, checks: readonly CombatCheckRoll[]): LubecLanded {
  const caught = resultOf(checks, 'fist-catch')
  if (caught && !caught.success) return { wound: false }
  const landed = concussionLanding(row, pick, checks)
  const prevention = resultOf(checks, 'prevention')
  const prevented = prevention?.success === true
  const outcome = prevented ? { ...landed.outcome, timers: [] } : landed.outcome
  const stress = checks.filter((check) => check.purpose !== 'fist-catch').reduce((sum, check) => sum + check.stress, 0)
  return { wound: true, outcome, trauma: row.trauma - landed.relief, stress, prevented }
}

type WoundAmounts = { rolled: LubecWoundRolled; dice: Record<string, number[]> }

function rollStageAmounts(now: readonly LubecWoundNow[], entropy: CombatEntropy, { rolled, dice }: WoundAmounts) {
  if (now.some((item) => item.kind === 'dazed' && item.turns === '1d4')) dice['Dazed 1d4'] = [rolled.dazed = entropy.die('dazed', 4)]
  if (now.some((item) => item.kind === 'unconscious')) {
    rolled.minutes = dice['Unconscious 2d10 minutes'] = [entropy.die('unconscious', 10), entropy.die('unconscious', 10)]
    dice['Minimum Stress 1d5'] = [rolled.minimumStress = entropy.die('minimum-stress', 5)]
  }
}

function rollFingerAmounts(outcome: LubecWoundOutcome, entropy: CombatEntropy, { rolled, dice }: WoundAmounts) {
  if (outcome.fingers) {
    rolled.fingers = 'count' in outcome.fingers ? outcome.fingers.count : entropy.die('fingers', outcome.fingers.sides)
    if ('sides' in outcome.fingers) dice[`Fingers 1d${outcome.fingers.sides}`] = [rolled.fingers]
  }
}

function rollLastingAmounts(outcome: LubecWoundOutcome, entropy: CombatEntropy, { rolled, dice }: WoundAmounts) {
  for (const card of outcome.cards) {
    card.steps.forEach((step, index) => {
      for (const loss of step.rolled ?? []) {
        const amount = entropy.die(`amount-${card.key}-${index}-${loss.target}`, loss.sides)
        rolled.amounts = { ...rolled.amounts, [lubecRolledKey(card.key, index, loss.target)]: amount }
        dice[`${loss.what} 1d${loss.sides}`] = [amount]
      }
    })
  }
}

function rollTimerAmounts(outcome: LubecWoundOutcome, entropy: CombatEntropy, { rolled, dice }: WoundAmounts) {
  const timers = (outcome.timers ?? []).map((kind) => ({ kind, rounds: entropy.die(`timer-${kind}`, 4) }))
  if (timers.length) {
    rolled.timers = timers
    for (const timer of timers) dice[`${timer.kind === 'bleed' ? 'Bleeding' : 'Critical'} d4`] = [timer.rounds]
  }
}

/** Each independent source of rolled amounts is resolved once, in landing order. */
export function lubecRollAmounts(outcome: LubecWoundOutcome, entropy: CombatEntropy): WoundAmounts {
  const amounts: WoundAmounts = { rolled: {}, dice: {} }
  rollStageAmounts(outcome.now ?? [], entropy, amounts)
  rollFingerAmounts(outcome, entropy, amounts)
  rollLastingAmounts(outcome, entropy, amounts)
  rollTimerAmounts(outcome, entropy, amounts)
  return amounts
}

const BY_HAND = ' (resolved by hand)'

const NOW_WORDS: Partial<Record<LubecWoundNow['kind'], (rolled: LubecWoundRolled, drop: LubecWoundDrop | null) => string | null>> = {
  drop: (_, drop) => drop ? lubecDropWords(drop) : 'Whatever the struck hand holds drops onto the Floor',
  'immediate-death-save': () => 'Immediate Death Save',
  'out-of-reach': () => 'Knocked out of striking reach',
  unconscious: (rolled) => rolled.minimumStress ? `Minimum Stress +${rolled.minimumStress} (1d5)` : null,
}

function nowWords(now: LubecWoundNow, rolled: LubecWoundRolled, drop: LubecWoundDrop | null): string | null {
  return NOW_WORDS[now.kind]?.(rolled, drop) ?? null
}

const NEXT_ROUND_KEYS = ['movement', 'bleed', 'critical']

/** A step that counts down by round already names its rounds, and a lasting one needs no end. */
const ENDS_IN_WORDS = ['rounds', 'lasting']

/** A lost Stage's own words name the loss: "Movement lost in round 2", "Action + Defense lost in round 3". */
function stageWords(card: LubecEffect, words: string): string | null {
  if (card.cardKey === 'movement') return `Movement lost in ${words.charAt(0).toLowerCase()}${words.slice(1)}`
  return card.cardKey === 'action' ? words : null
}

function cardLine(card: LubecEffect, stepIndex: number): string {
  const step = card.steps[stepIndex]
  const part = typeof card.part === 'string' ? card.part : card.name
  const trigger = ENDS_IN_WORDS.includes(String(step.until)) ? null : lubecStepTrigger(step)
  const words = describeLubecEffectStep(step)
  const line = (stepIndex === 0 ? stageWords(card, words) : null) ?? `${part}: ${words}`
  return `${line}${trigger ? `, ${trigger.charAt(0).toLowerCase()}${trigger.slice(1)}` : ''}${lubecStepByHand(card, step) ? BY_HAND : ''}`
}

/** A landed wound's Results, by when each consequence happens: Now, Next round, Recovery and Lasting. */
type SectionLines = { now: string[]; next: string[]; recovery: string[]; lasting: string[] }

function currentSection(card: LubecEffect): keyof SectionLines {
  if (NEXT_ROUND_KEYS.includes(String(card.cardKey)) || card.steps[0]?.until === 'next-round-end') return 'next'
  if (['dazed', 'action', 'down', 'unconscious'].includes(String(card.cardKey))) return 'now'
  return card.steps[0]?.until === 'lasting' ? 'lasting' : 'recovery'
}

/** A later step waits for recovery, unless it is the lasting one. */
const laterSection = (step: LubecEffectStep): keyof SectionLines => (step.until === 'lasting' ? 'lasting' : 'recovery')

/** Each card's current step goes where it acts now; every later step follows under Recovery or Lasting. */
function cardSections(cards: readonly LubecEffect[]): SectionLines {
  const lines: SectionLines = { now: [], next: [], recovery: [], lasting: [] }
  for (const card of cards) {
    card.steps.forEach((step, index) => {
      if (index === 0) lines[currentSection(card)].push(cardLine(card, 0))
      else lines[laterSection(step)].push(`then ${cardLine(card, index)}`)
    })
  }
  return lines
}

export function lubecWoundSections(outcome: LubecWoundOutcome, cards: readonly LubecEffect[], rolled: LubecWoundRolled, prevented: boolean, drop: LubecWoundDrop | null = null): CombatWoundSection[] {
  const { now, next, recovery, lasting } = cardSections(cards)
  for (const item of outcome.now ?? []) {
    const words = nowWords(item, rolled, drop)
    if (words) now.push(words)
  }
  if (prevented) now.push('Countdown prevented')
  const sections = [
    { label: 'Now', items: now }, { label: 'Next round', items: next },
    { label: 'Recovery', items: recovery }, { label: 'Lasting', items: lasting },
  ]
  return sections.filter((section) => section.items.length)
}
