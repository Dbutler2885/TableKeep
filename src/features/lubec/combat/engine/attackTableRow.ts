import { valueBreakdownOf } from './rollBreakdown'
import type { LubecEffect } from '../../../ruleSets/lubec/effects'
import { locName } from '../../../ruleSets/lubec/gear/gearRules'
import type { LubecGear } from '../../../ruleSets/lubec/gear/gearRecord'
import { lubecHeldIn } from '../../../ruleSets/lubec/gear/held'
import { lubecDropPending, lubecStruckHand, lubecWoundCards, type LubecWoundDrop, type LubecWoundRolled, type LubecWoundRolledCheck } from '../../../ruleSets/lubec/woundCards'
import type { LubecWoundNow, LubecWoundOutcome } from '../../../ruleSets/lubec/woundTables/outcome'
import { actionResolved, lostRoundsOf, withLostStages } from './stages'
import { lubecWoundTableRow, type LubecLocatedWoundRow, type LubecWoundTableRow } from '../../../ruleSets/lubec/woundTables'
import { lubecBriefWindowEnd, lubecCountdownDue } from '../roundTick'
import type { CombatWound } from '../woundTypes'
import { closeAttack, stepRequest } from './attackFlow'
import { combatantOf, defenderOf } from './attackParty'
import type { CombatLog } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { combatInputModifiers } from './inputModifiers'
import type { CombatAttack, CombatCheckRoll, CombatCommand, CombatFight, CombatPlan, CombatSheet, CombatState, CombatWoundRow } from './types'
import { lubecLanded, lubecLandingRolls, lubecRollAmounts, lubecWoundSections } from './woundLanding'
import { checkLog, checkTarget, landingCheckMode, rollCheck, rollRowCheck } from './woundCheck'
import type { LubecModeSource } from '../../../ruleSets/lubec/rollModes'
import { calledSources } from './combatModes'

// Blunt Force, Gunshot, Piercing, Cutting, Thrown Objects and Fisticuffs: the located tables.
// A final row lands as Effect cards after the Saves and Checks it asks the target for; a
// provisional row still lands as its words, resolved by hand. Dodgeball keeps its own path in attackRow.

const BODY_SAVE = { kind: 'save', against: 'Body', advantage: 'normal' } as const

/** What the hit reads: its table, the struck part's location, and the row its Impact reaches. */
const locatedOf = (attack: CombatAttack): LubecLocatedWoundRow =>
  lubecWoundTableRow(attack.impact!.table, attack.landing!.part!, attack.impact!.total)!

/** The wound a row gives: the one its d2 rolled, or the row itself. */
function woundOf(row: LubecWoundTableRow, pick: number | null) {
  const wound = pick === null ? row : row.choices![pick - 1]
  return { name: wound.name, text: wound.text, injury: wound.injury ?? null }
}

/** The name a final row lands under: a d2 row's shared name, with the branch it rolled when that has one. */
function finalWoundOf(row: LubecWoundTableRow, pick: number | null) {
  const branch = pick === null ? null : row.choices![pick - 1]
  return { name: row.name || branch?.name || '', text: row.text, injury: null }
}

/** The row as the attack keeps it; a d2 row keeps the one wound it rolled, a final row the rolls it asks for. */
function storedRow({ table, location, row }: LubecLocatedWoundRow, pick: number | null): CombatWoundRow {
  if (row.outcome) {
    const rolls = lubecLandingRolls(row, pick)
    const first = rolls[0]
    return {
      group: location.parts.join('+'), impact: row.impact, ...finalWoundOf(row, pick), severity: row.severity, trauma: row.trauma,
      check: first ? { kind: first.kind, against: first.against, advantage: first.advantage } : null, table: table.key, choice: pick, out: false,
      final: true, rolls,
    }
  }
  return {
    group: location.parts.join('+'), impact: row.impact, ...woundOf(row, pick), severity: row.severity, trauma: row.trauma,
    check: row.save ? { ...BODY_SAVE } : null, table: table.key, choice: pick, out: row.out === true,
  }
}

type Applied = { text: string; trauma: number }

/** A provisional row's words and Trauma; a Body Save row takes its success or failure version. */
function appliedRow(row: CombatWoundRow, located: LubecLocatedWoundRow, saved: boolean | null): Applied {
  const save = located.row.save
  if (!save || saved === null) return { text: row.text, trauma: row.trauma }
  const version = saved ? save.success : save.failure
  return { text: [row.text, version].filter(Boolean).join(' '), trauma: saved ? save.successTrauma : row.trauma }
}

const causeOf = (attack: CombatAttack, row: CombatWoundRow, tableName: string) =>
  `${tableName}, ${locName(attack.landing!.part!).toLowerCase()}, Impact ${attack.impact!.total}: ${row.severity} ${row.name}`

/** A provisional row's sheet effect: the wound's words, and the lasting injury it leaves, resolved by hand. */
function woundEffect(attack: CombatAttack, row: CombatWoundRow, applied: Applied, tableName: string, entropy: CombatEntropy): LubecEffect {
  const part = attack.landing!.part!
  const labels = [applied.text || `${row.name}.`, ...(row.injury ? [`Lasting injury: ${row.injury}`] : [])]
  return {
    id: entropy.id('effect', 0), name: row.name, duration: null, struckLocation: part,
    cause: causeOf(attack, row, tableName),
    steps: [{ modifiers: [], labels }],
    source: { table: row.table, group: row.group, impact: row.impact, name: row.name, severity: row.severity, injury: row.injury ?? null },
  }
}

const target = (state: CombatState, attack: CombatAttack) => {
  const entry = combatantOf(state, defenderOf(attack))
  return { kind: entry.kind, sheetId: entry.sheetId }
}

/** A provisional row: its words go to the target's sheet, effective at once, with its Trauma and any Save's Stress; stage consequences remain manual until that table is final. */
function applyProvisional(state: CombatState, attack: CombatAttack, applied: Applied, stress: number, entropy: CombatEntropy): CombatState {
  const located = locatedOf(attack)
  const wound: CombatWound = {
    id: entropy.id('wound', 0), target: target(state, attack), originatingRound: state.round, effectiveRound: state.round,
    traumaDelta: applied.trauma, stressDelta: stress, effect: woundEffect(attack, attack.row!, applied, located.table.name, entropy),
  }
  return closeAttack({ ...state, woundOutbox: [...state.woundOutbox, wound] }, { ...attack, rowOutcome: applied.text, rowTrauma: applied.trauma }, 'wounded')
}

const snapshotCheck = (check: CombatCheckRoll): LubecWoundRolledCheck => ({
  purpose: { 'fist-catch': 'Catch their fist', concussion: 'Concussion', prevention: 'Prevent the countdown', retention: 'Keep hold' }[check.purpose ?? 'concussion'],
  kind: check.kind, against: check.against, mode: check.advantage, target: check.target, dice: check.dice, result: check.result, success: check.success, stress: check.stress,
})

/**
 * The struck hand's drop, when the outcome has one: what the hand held, when the target's own sheet was read for a
 * landing roll, and whether a retention Check kept hold. An empty hand drops nothing and is never rolled for.
 */
function dropOf(outcome: LubecWoundOutcome, part: string, gear: LubecGear | null, checks: readonly CombatCheckRoll[]): LubecWoundDrop | null {
  if (!outcome.now?.some((now) => now.kind === 'drop')) return null
  const hand = lubecStruckHand(part)
  const retention = checks.find((check) => check.purpose === 'retention')
  const held = heldName(gear, hand)
  return { hand, ...(retention ? { kept: retention.success } : {}), ...(held === undefined ? {} : { held }) }
}

const heldName = (gear: LubecGear | null, hand: 'left' | 'right') => gear ? lubecHeldIn(gear, hand)?.name ?? null : undefined

/**
 * A final row: its cards, Trauma, Stress and Minimum Stress go to the target's sheet, effective at once: every roll the target has not made yet this round reads it.
 * A drop goes with the wound and leaves the hand when the wound reaches the sheet. A missed fist catch gives nothing at all.
 */
type LandedFinal = Extract<ReturnType<typeof lubecLanded>, { wound: true }>
type LandingDetails = {
  rolled: LubecWoundRolled; dice: Record<string, number[]>; drop: LubecWoundDrop | null; minimumStress: number
}

const hasNow = (outcome: LubecWoundOutcome, kind: LubecWoundNow['kind']) => outcome.now?.some((now) => now.kind === kind) ?? false

/** Only a step active at landing charges Minimum Stress now; later steps wait for recovery. */
function landingMinimumStress(outcome: LubecWoundOutcome, rolled: LubecWoundRolled): number {
  const fromStart = outcome.cards.reduce((sum, card) => sum + (card.steps[0]?.minimumStress ?? 0), 0)
  return (rolled.minimumStress ?? 0) + fromStart
}

function landingDetails(state: CombatState, attack: CombatAttack, landed: LandedFinal, checks: CombatCheckRoll[], entropy: CombatEntropy, gear: LubecGear | null): LandingDetails {
  const drop = dropOf(landed.outcome, attack.landing!.part!, gear, checks)
  const { rolled: amounts, dice } = lubecRollAmounts(landed.outcome, entropy)
  const lost = stageRounds(landed.outcome, state, defenderOf(attack), amounts.dazed ?? 1)
  const rolled = { ...amounts, lost }
  return { drop, dice, rolled, minimumStress: landingMinimumStress(landed.outcome, rolled) }
}

function landingSource(attack: CombatAttack, located: LubecLocatedWoundRow, landed: LandedFinal, checks: CombatCheckRoll[], details: LandingDetails) {
  const row = attack.row!
  const pick = row.choice ?? null
  const { dice, drop, minimumStress } = details
  return {
    table: located.table.key, tableName: located.table.name, location: row.group, part: attack.landing!.part!, impact: attack.impact!.total,
    severity: row.severity, row: row.name, prose: located.row.text, branch: pick, contentVersion: located.row.contentVersion ?? '',
    dice: { ...(pick === null ? {} : { d2: [pick] }), ...dice }, checks: checks.map(snapshotCheck),
    trauma: landed.trauma, stress: landed.stress, minimumStress, ...(drop ? { drop } : {}),
  }
}

function finalWound(state: CombatState, attack: CombatAttack, landed: LandedFinal, details: LandingDetails, cards: LubecEffect[], entropy: CombatEntropy): CombatWound {
  const { drop, minimumStress } = details
  return {
    id: entropy.id('wound', 0), target: target(state, attack), originatingRound: state.round, effectiveRound: state.round,
    traumaDelta: landed.trauma, stressDelta: landed.stress, ...(minimumStress ? { minimumStressDelta: minimumStress } : {}),
    ...(cards.length ? { effect: cards[0] } : {}), effects: cards, ...(lubecDropPending(drop) ? { drop } : {}),
    ...(hasNow(landed.outcome, 'immediate-death-save') ? { immediateDeathSave: attack.row!.name } : {}),
  }
}

const LOSS_REASONS: Record<string, string> = { dazed: 'Dazed', movement: 'Movement lost' }
const lossReason = (kind: string) => LOSS_REASONS[kind] ?? 'Action lost'
const withUnconscious = (state: CombatState, key: string): CombatState =>
  ({ ...state, combatants: state.combatants.map((entry) => entry.key === key ? { ...entry, unconscious: true } : entry) })

/** Stage losses, incapacity and reach are the public combat consequences; the sheet receives the cards separately. */
function withWoundStages(state: CombatState, attack: CombatAttack, outcome: LubecWoundOutcome, lost: NonNullable<LubecWoundRolled['lost']>): CombatState {
  const key = defenderOf(attack)
  let staged = Object.entries(lost).reduce<CombatState>((current, [kind, rounds]) => withLostStages(current, key, rounds, lossReason(kind), attack.row!.name), state)
  if (hasNow(outcome, 'knocked-down') && state.round >= 1 && !actionResolved(state, key)) {
    staged = withLostStages(staged, key, { movement: [], action: [state.round] }, 'Knocked down', attack.row!.name)
  }
  if (hasNow(outcome, 'unconscious')) staged = withUnconscious(staged, key)
  if (hasNow(outcome, 'out-of-reach')) staged = withOutOfReach(staged, attack.attackerKey, key)
  return staged
}

function applyFinal(state: CombatState, attack: CombatAttack, checks: CombatCheckRoll[], entropy: CombatEntropy, gear: LubecGear | null = null): CombatState {
  const located = locatedOf(attack)
  const row = attack.row!
  const landed = lubecLanded(located.row, row.choice ?? null, checks)
  const withChecks = { ...attack, checks, check: checks[0] ?? null }
  if (!landed.wound) {
    return closeAttack(state, { ...withChecks, rowOutcome: located.row.text, rowTrauma: 0, rowStress: 0, rowSections: [] }, 'no-wound')
  }
  const details = landingDetails(state, attack, landed, checks, entropy, gear)
  const source = landingSource(attack, located, landed, checks, details)
  const cards = lubecWoundCards(landed.outcome, { source, cause: causeOf(attack, row, located.table.name), rolled: details.rolled })
  const wound = finalWound(state, attack, landed, details, cards, entropy)
  const closed = {
    ...withChecks, rowOutcome: located.row.text, rowTrauma: landed.trauma, rowStress: landed.stress, rowMinimumStress: details.minimumStress,
    rowSections: lubecWoundSections(details.dice, details.drop), woundId: wound.id,
  }
  const roundWatch = watchedThrough(state, wound.target, cards)
  const countdowns = [...(state.countdowns ?? []), ...countdownsOf(state, wound, cards)]
  const staged = withWoundStages(state, attack, landed.outcome, details.rolled.lost!)
  return closeAttack({ ...staged, woundOutbox: [...state.woundOutbox, wound], roundWatch, countdowns }, closed, 'wounded')
}

/** Knocked out of striking reach: remembered for the attacker's next melee aim at the target, as a reminder only. */
function withOutOfReach(state: CombatState, attackerKey: string, targetKey: string): CombatState {
  const others = (state.outOfReach ?? []).filter((entry) => entry.attackerKey !== attackerKey || entry.targetKey !== targetKey)
  return { ...state, outOfReach: [...others, { attackerKey, targetKey, round: state.round }] }
}

/** The rounds each stage-losing consequence of the outcome takes from the target, worked out now. */
function stageRounds(outcome: { now?: LubecWoundNow[] }, state: CombatState, key: string, dazed: number): NonNullable<LubecWoundRolled['lost']> {
  const lost: NonNullable<LubecWoundRolled['lost']> = {}
  for (const now of outcome.now ?? []) {
    const rounds = lostRoundsOf(now, state, key, dazed)
    const slot = LOSS_SLOTS[now.kind]
    if (rounds && slot) lost[slot] = rounds
  }
  return lost
}

const LOSS_SLOTS: Partial<Record<LubecWoundNow['kind'], 'movement' | 'action' | 'dazed'>> = { 'lose-movement': 'movement', 'lose-action': 'action', dazed: 'dazed' }

type Countdown = { kind: 'bleed' | 'critical'; rounds: number }
const countdownOfCard = (card: LubecEffect): Countdown | null => (card.countdown as Countdown | undefined) ?? null

/** Each countdown the wound started, with the round it falls due, for the combat log at that round's end. */
function countdownsOf(state: CombatState, wound: CombatWound, cards: readonly LubecEffect[]): NonNullable<CombatState['countdowns']> {
  return cards.flatMap((card) => {
    const countdown = countdownOfCard(card)
    if (!countdown) return []
    return [{ key: `${wound.target.kind}:${wound.target.sheetId}`, wound: card.name, kind: countdown.kind, dueRound: lubecCountdownDue(state.round, countdown.rounds) }]
  })
}

/** The last round whose end must be processed for these cards: a brief window ends with the next round, a countdown with its due round. */
function watchedThrough(state: CombatState, target: CombatWound['target'], cards: readonly LubecEffect[]): CombatState['roundWatch'] {
  const ends = cards.flatMap((card) => cardWatchEnds(card, state.round))
  if (!ends.length) return state.roundWatch
  const key = `${target.kind}:${target.sheetId}`
  return { ...state.roundWatch, [key]: Math.max(state.roundWatch?.[key] ?? 0, ...ends) }
}

function cardWatchEnds(card: LubecEffect, round: number): number[] {
  const countdown = countdownOfCard(card)
  if (countdown) return [lubecCountdownDue(round, countdown.rounds)]
  const lost = card.lost as { movement: number[]; action: number[] } | undefined
  if (lost) return [Math.max(...lost.movement, ...lost.action)]
  return card.steps[0]?.until === 'next-round-end' ? [lubecBriefWindowEnd(round)] : []
}

/** A positive Impact on a located table reads its row: a d2 picks between two wounds, any Save or Check waits on the target. */
export function readTableRow(fight: CombatFight, attack: CombatAttack, entropy: CombatEntropy): CombatFight {
  const located = locatedOf(attack)
  const pick = located.row.choices ? entropy.die('wound-choice', 2) : null
  const withRow = { ...attack, row: storedRow(located, pick) }
  const check = withRow.row.check
  if (!check) {
    const state = withRow.row.final ? applyFinal(fight.state, withRow, [], entropy) : applyProvisional(fight.state, withRow, appliedRow(withRow.row, located, null), 0, entropy)
    return { ...fight, state }
  }
  const action = check.kind === 'save' ? 'save' : 'check'
  return { ...fight, state: { ...fight.state, attack: { ...withRow, step: 'check' }, pendingActions: stepRequest(defenderOf(attack), action) } }
}

/**
 * Every landing roll a final row asks for, in order, against the target's sheet as it stands, before this wound;
 * a missed fist catch stops there, and an empty struck hand has nothing to keep hold of.
 */
function rollLanding(record: CombatSheet, row: CombatWoundRow, part: string, fightId: string, round: number, entropy: CombatEntropy, called: LubecModeSource[]): CombatCheckRoll[] {
  const modifiers = combatInputModifiers(record.sheet, { fightId, round })
  const checks: CombatCheckRoll[] = []
  for (const spec of row.rolls ?? []) {
    if (emptyRetention(spec.purpose, record, part)) continue
    const rolled = rollLandingCheck(record, spec, row.name, { fightId, round }, modifiers, entropy, called)
    checks.push(rolled)
    if (spec.purpose === 'fist-catch' && !rolled.success) break
  }
  return checks
}

const emptyRetention = (purpose: string, record: CombatSheet, part: string) =>
  purpose === 'retention' && !lubecHeldIn(record.sheet.gear, lubecStruckHand(part))

function rollLandingCheck(record: CombatSheet, spec: NonNullable<CombatWoundRow['rolls']>[number], name: string, context: { fightId: string; round: number }, modifiers: ReturnType<typeof combatInputModifiers>, entropy: CombatEntropy, called: LubecModeSource[]): CombatCheckRoll {
  const { purpose, ...check } = spec
  const mode = landingCheckMode(record, check, name, context, called)
  const rolled = rollCheck(record, { ...check, advantage: mode.mode }, checkTarget(record, check.against, modifiers), entropy, mode.because)
  // A missed fist catch is "no effect, no wound and no Stress from this Check".
  return { ...rolled, purpose, ...(purpose === 'fist-catch' ? { stress: 0 } : {}) }
}

/** Each landing roll's card, with how the number it was made under was reached on the target's sheet this round. */
function landingLogs(fight: CombatFight, attack: CombatAttack, checks: readonly CombatCheckRoll[], record: CombatSheet, fightId: string): CombatLog[] {
  const who = combatantOf(fight.state, defenderOf(attack))
  const round = { fightId, round: fight.state.round }
  return checks.map((check) => checkLog(who, attack.row!, check, valueBreakdownOf(record, check.against, check.target, round)))
}

/** The target's Saves and Checks pick the row's version; failing a Save adds its Stress too. */
export function tableChecked(fight: CombatFight, attack: CombatAttack, record: CombatSheet, command: CombatCommand, entropy: CombatEntropy): CombatPlan {
  if (attack.row!.final) {
    const checks = rollLanding(record, attack.row!, attack.landing!.part!, command.envelope.fightId, fight.state.round, entropy, calledSources(command.payload))
    const state = applyFinal(fight.state, { ...attack, repair: null }, checks, entropy, record.sheet.gear)
    return { fight: { ...fight, state }, items: [], logs: landingLogs(fight, attack, checks, record, command.envelope.fightId) }
  }
  const rolled = rollRowCheck(record, attack.row!, command.envelope.fightId, fight.state.round, entropy, calledSources(command.payload))
  const applied = appliedRow(attack.row!, locatedOf(attack), rolled.success)
  const state = applyProvisional(fight.state, { ...attack, check: rolled, repair: null }, applied, rolled.stress, entropy)
  return { fight: { ...fight, state }, items: [], logs: landingLogs(fight, attack, [rolled], record, command.envelope.fightId) }
}
