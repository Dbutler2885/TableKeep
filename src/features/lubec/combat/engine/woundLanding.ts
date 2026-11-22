import { lubecDropWords, lubecRolledKey, type LubecWoundDrop, type LubecWoundRolled } from '../../../ruleSets/lubec/woundCards'
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

/** "Bleeding d4: 3", "Unconscious 2d10 minutes: 7 + 4 = 11": one die the wound rolled, as it fell. */
function rolledLine(what: string, dice: readonly number[]): string {
  const sum = dice.reduce((total, die) => total + die, 0)
  return `${what}: ${dice.join(' + ')}${dice.length > 1 ? ` = ${sum}` : ''}`
}

/**
 * What a landed wound's Results add to the table's own words: only what the table leaves to the moment,
 * the dice it rolled and what the struck hand dropped. The table's sentence says everything else.
 */
export function lubecWoundSections(dice: Readonly<Record<string, number[]>>, drop: LubecWoundDrop | null): CombatWoundSection[] {
  const rolled = Object.entries(dice).filter(([, values]) => values.length).map(([what, values]) => rolledLine(what, values))
  const sections = [{ label: 'Rolled', items: rolled }, { label: 'Struck hand', items: drop ? [lubecDropWords(drop)] : [] }]
  return sections.filter((section) => section.items.length)
}
