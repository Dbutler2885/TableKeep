import type { LubecEffect } from '../../../ruleSets/lubec/effects'
import { describeLubecEffectStep } from '../../../ruleSets/lubec/effects'
import { lubecStepByHand, lubecStepTrigger, type LubecWoundRolled } from '../../../ruleSets/lubec/woundCards'
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
  const timers = [...new Set([...(a.timers ?? []), ...(b.timers ?? [])])]
  const fingers = b.fingers ?? a.fingers
  return {
    now: [...(a.now ?? []), ...(b.now ?? [])],
    cards: [...a.cards, ...b.cards],
    ...(timers.length ? { timers } : {}),
    ...(fingers ? { fingers } : {}),
  }
}

/** The Saves and Checks a final row asks for, in the order they are rolled. */
export function lubecLandingRolls(row: LubecWoundTableRow, pick: number | null): CombatLandingRollSpec[] {
  const rolls: CombatLandingRollSpec[] = []
  if (row.fistCatch) rolls.push({ purpose: 'fist-catch', kind: 'stat-check', against: 'Handle', advantage: 'normal' })
  if (row.concussion) rolls.push({ purpose: 'concussion', kind: 'save', against: 'Body', advantage: row.concussion.mode ?? 'normal' })
  if (lubecRowOutcome(row, pick).timers?.length) rolls.push({ purpose: 'prevention', kind: 'save', against: 'Body', advantage: 'normal' })
  return rolls
}

/** What the landing rolls decided: no wound at all for a missed fist catch, or the outcome, its Trauma and its Stress. */
export type LubecLanded =
  | { wound: false }
  | { wound: true; outcome: LubecWoundOutcome; trauma: number; stress: number; prevented: boolean }

const resultOf = (checks: readonly CombatCheckRoll[], purpose: CombatCheckRoll['purpose']) => checks.find((check) => check.purpose === purpose)

export function lubecLanded(row: LubecWoundTableRow, pick: number | null, checks: readonly CombatCheckRoll[]): LubecLanded {
  const caught = resultOf(checks, 'fist-catch')
  if (caught && !caught.success) return { wound: false }
  const concussion = resultOf(checks, 'concussion')
  const base = lubecRowOutcome(row, pick)
  const withConcussion = row.concussion && concussion ? mergeOutcomes(lubecConcussionOutcome(row.concussion, concussion.success), base) : base
  const prevention = resultOf(checks, 'prevention')
  const prevented = prevention?.success === true
  const outcome = prevented ? { ...withConcussion, timers: [] } : withConcussion
  const relief = row.concussion && concussion ? lubecConcussionTraumaRelief(row.concussion, concussion.success) : 0
  const stress = checks.filter((check) => check.purpose !== 'fist-catch').reduce((sum, check) => sum + check.stress, 0)
  return { wound: true, outcome, trauma: row.trauma - relief, stress, prevented }
}

/** The amounts the wound rolls once, with every die by what it was for. */
export function lubecRollAmounts(outcome: LubecWoundOutcome, entropy: CombatEntropy): { rolled: LubecWoundRolled; dice: Record<string, number[]> } {
  const rolled: LubecWoundRolled = {}
  const dice: Record<string, number[]> = {}
  const now = outcome.now ?? []
  if (now.some((item) => item.kind === 'dazed' && item.turns === '1d4')) dice['Dazed 1d4'] = [rolled.dazed = entropy.die('dazed', 4)]
  if (now.some((item) => item.kind === 'unconscious')) {
    rolled.minutes = dice['Unconscious 2d10 minutes'] = [entropy.die('unconscious', 10), entropy.die('unconscious', 10)]
    dice['Minimum Stress 1d5'] = [rolled.minimumStress = entropy.die('minimum-stress', 5)]
  }
  if (outcome.fingers) {
    rolled.fingers = 'count' in outcome.fingers ? outcome.fingers.count : entropy.die('fingers', outcome.fingers.sides)
    if ('sides' in outcome.fingers) dice[`Fingers 1d${outcome.fingers.sides}`] = [rolled.fingers]
  }
  const timers = (outcome.timers ?? []).map((kind) => ({ kind, rounds: entropy.die(`timer-${kind}`, 4) }))
  if (timers.length) {
    rolled.timers = timers
    for (const timer of timers) dice[`${timer.kind === 'bleed' ? 'Bleeding' : 'Critical'} d4`] = [timer.rounds]
  }
  return { rolled, dice }
}

const BY_HAND = ' (resolved by hand)'

function nowWords(now: LubecWoundNow, rolled: LubecWoundRolled): string | null {
  switch (now.kind) {
    case 'drop': return `Whatever the struck hand holds is dropped${now.check ? ' unless a Handle Check succeeds' : ''}${BY_HAND}`
    case 'immediate-death-save': return 'Immediate Death Save: the GM resolves it privately'
    case 'out-of-reach': return 'Knocked out of striking reach: the GM rules it, as combat here has no reach'
    case 'unconscious': return rolled.minimumStress ? `Minimum Stress +${rolled.minimumStress} (1d5)` : null
    default: return null
  }
}

const NEXT_ROUND_KEYS = ['movement', 'bleed', 'critical']

function cardLine(card: LubecEffect, stepIndex: number): string {
  const step = card.steps[stepIndex]
  const part = typeof card.part === 'string' ? card.part : card.name
  const trigger = lubecStepTrigger(step)
  const words = describeLubecEffectStep(step)
  return `${part}: ${words}${trigger && step.until !== 'lasting' ? `, ${trigger.charAt(0).toLowerCase()}${trigger.slice(1)}` : ''}${lubecStepByHand(card, step) ? BY_HAND : ''}`
}

/** A landed wound's Results, by when each consequence happens: Now, Next round, Recovery and Lasting. */
export function lubecWoundSections(outcome: LubecWoundOutcome, cards: readonly LubecEffect[], rolled: LubecWoundRolled, prevented: boolean): CombatWoundSection[] {
  const now: string[] = []
  const next: string[] = []
  const recovery: string[] = []
  const lasting: string[] = []
  for (const card of cards) {
    const first = card.steps[0]
    if (NEXT_ROUND_KEYS.includes(String(card.cardKey)) || first?.until === 'next-round-end') next.push(cardLine(card, 0))
    else if (['dazed', 'action', 'down', 'unconscious'].includes(String(card.cardKey))) now.push(cardLine(card, 0))
    else if (first?.until === 'lasting') lasting.push(cardLine(card, 0))
    else if (first) recovery.push(cardLine(card, 0))
    card.steps.slice(1).forEach((step, index) => (step.until === 'lasting' ? lasting : recovery).push(`then ${cardLine(card, index + 1)}`))
  }
  for (const item of outcome.now ?? []) {
    const words = nowWords(item, rolled)
    if (words) now.push(words)
  }
  if (prevented) now.push('Timer prevented: the Body Save stopped every countdown')
  const sections = [
    { label: 'Now', items: now }, { label: 'Next round', items: next },
    { label: 'Recovery', items: recovery }, { label: 'Lasting', items: lasting },
  ]
  return sections.filter((section) => section.items.length)
}
