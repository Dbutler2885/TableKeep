import type { LubecEffect } from '../../../ruleSets/lubec/effects'
import { locName } from '../../../ruleSets/lubec/gear/gearRules'
import { lubecWoundCards, type LubecWoundRolledCheck } from '../../../ruleSets/lubec/woundCards'
import { lubecWoundTableRow, type LubecLocatedWoundRow, type LubecWoundTableRow } from '../../../ruleSets/lubec/woundTables'
import type { CombatWound } from '../woundTypes'
import { closeAttack, stepRequest } from './attackFlow'
import { combatantOf, defenderOf } from './attackParty'
import type { CombatLog } from './combatFeedback'
import type { CombatEntropy } from './commandEntropy'
import { combatInputModifiers } from './inputModifiers'
import type { CombatAttack, CombatCheckRoll, CombatCommand, CombatFight, CombatPlan, CombatSheet, CombatState, CombatWoundRow } from './types'
import { lubecLanded, lubecLandingRolls, lubecRollAmounts, lubecWoundSections } from './woundLanding'
import { checkLog, checkTarget, landingCheckMode, rollCheck, rollRowCheck } from './woundCheck'

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

/** A provisional row: its words go to the target's sheet, effective next round, with its Trauma and any Save's Stress; an unconscious target is Out at once. */
function applyProvisional(state: CombatState, attack: CombatAttack, applied: Applied, stress: number, entropy: CombatEntropy): CombatState {
  const located = locatedOf(attack)
  const targetKey = defenderOf(attack)
  const combatants = state.combatants.map((entry) => (entry.key === targetKey && attack.row!.out && entry.outReason === null ? { ...entry, outReason: 'wound' } : entry))
  const wound: CombatWound = {
    id: entropy.id('wound', 0), target: target(state, attack), originatingRound: state.round, effectiveRound: state.round + 1,
    traumaDelta: applied.trauma, stressDelta: stress, effect: woundEffect(attack, attack.row!, applied, located.table.name, entropy),
  }
  return closeAttack({ ...state, combatants, woundOutbox: [...state.woundOutbox, wound] }, { ...attack, rowOutcome: applied.text, rowTrauma: applied.trauma }, 'wounded')
}

const snapshotCheck = (check: CombatCheckRoll): LubecWoundRolledCheck => ({
  purpose: { 'fist-catch': 'Catch their fist', concussion: 'Concussion', prevention: 'Prevent the countdown' }[check.purpose ?? 'concussion'],
  kind: check.kind, against: check.against, mode: check.advantage, target: check.target, dice: check.dice, result: check.result, success: check.success, stress: check.stress,
})

/** A final row: its cards, Trauma, Stress and Minimum Stress go to the target's sheet, effective next round. A missed fist catch gives nothing at all. */
function applyFinal(state: CombatState, attack: CombatAttack, checks: CombatCheckRoll[], entropy: CombatEntropy): CombatState {
  const located = locatedOf(attack)
  const row = attack.row!
  const pick = row.choice ?? null
  const landed = lubecLanded(located.row, pick, checks)
  const withChecks = { ...attack, checks, check: checks[0] ?? null }
  if (!landed.wound) {
    return closeAttack(state, { ...withChecks, rowOutcome: 'Failure: no effect, no wound and no Stress from this Check.', rowTrauma: 0, rowStress: 0, rowSections: [] }, 'no-wound')
  }
  const { rolled, dice } = lubecRollAmounts(landed.outcome, entropy)
  // "+1d5 Minimum Stress" rolled at once, and any lasting Minimum Stress that starts the moment the wound lands
  // ("if survived, lasting +4 minimum Stress"); one a later step names waits for the Step down that reaches it.
  const fromStart = landed.outcome.cards.reduce((sum, card) => sum + (card.steps[0]?.minimumStress ?? 0), 0)
  const minimumStress = (rolled.minimumStress ?? 0) + fromStart
  const source = {
    table: located.table.key, tableName: located.table.name, location: row.group, part: attack.landing!.part!, impact: attack.impact!.total,
    severity: row.severity, row: row.name, prose: located.row.text, branch: pick, contentVersion: located.row.contentVersion ?? '',
    dice: { ...(pick === null ? {} : { d2: [pick] }), ...dice }, checks: checks.map(snapshotCheck),
    trauma: landed.trauma, stress: landed.stress, minimumStress,
  }
  const cards = lubecWoundCards(landed.outcome, { source, cause: causeOf(attack, row, located.table.name), rolled })
  const wound: CombatWound = {
    id: entropy.id('wound', 0), target: target(state, attack), originatingRound: state.round, effectiveRound: state.round + 1,
    traumaDelta: landed.trauma, stressDelta: landed.stress, ...(minimumStress ? { minimumStressDelta: minimumStress } : {}),
    ...(cards.length ? { effect: cards[0] } : {}), effects: cards,
  }
  const closed = {
    ...withChecks, rowOutcome: located.row.text, rowTrauma: landed.trauma, rowStress: landed.stress, rowMinimumStress: minimumStress,
    rowSections: lubecWoundSections(landed.outcome, cards, rolled, landed.prevented),
  }
  return closeAttack({ ...state, woundOutbox: [...state.woundOutbox, wound] }, closed, 'wounded')
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

/** Every landing roll a final row asks for, in order, against the target's sheet as it stands; a missed fist catch stops there. */
function rollLanding(record: CombatSheet, row: CombatWoundRow, fightId: string, round: number, entropy: CombatEntropy): CombatCheckRoll[] {
  const modifiers = combatInputModifiers(record.sheet, { fightId, round })
  const checks: CombatCheckRoll[] = []
  for (const spec of row.rolls ?? []) {
    const { purpose, ...check } = spec
    const mode = landingCheckMode(record, check, row.name, { fightId, round })
    const rolled = rollCheck(record, { ...check, advantage: mode.mode }, checkTarget(record, check.against, modifiers), entropy, mode.because)
    // A missed fist catch is "no effect, no wound and no Stress from this Check".
    checks.push({ ...rolled, purpose, ...(purpose === 'fist-catch' ? { stress: 0 } : {}) })
    if (purpose === 'fist-catch' && !rolled.success) break
  }
  return checks
}

function landingLogs(fight: CombatFight, attack: CombatAttack, checks: readonly CombatCheckRoll[]): CombatLog[] {
  const who = combatantOf(fight.state, defenderOf(attack))
  return checks.map((check) => checkLog(who, attack.row!, check))
}

/** The target's Saves and Checks pick the row's version; failing a Save adds its Stress too. */
export function tableChecked(fight: CombatFight, attack: CombatAttack, record: CombatSheet, command: CombatCommand, entropy: CombatEntropy): CombatPlan {
  if (attack.row!.final) {
    const checks = rollLanding(record, attack.row!, command.envelope.fightId, fight.state.round, entropy)
    const state = applyFinal(fight.state, { ...attack, repair: null }, checks, entropy)
    return { fight: { ...fight, state }, items: [], logs: landingLogs(fight, attack, checks) }
  }
  const rolled = rollRowCheck(record, attack.row!, command.envelope.fightId, fight.state.round, entropy)
  const applied = appliedRow(attack.row!, locatedOf(attack), rolled.success)
  const state = applyProvisional(fight.state, { ...attack, check: rolled, repair: null }, applied, rolled.stress, entropy)
  return { fight: { ...fight, state }, items: [], logs: [checkLog(combatantOf(fight.state, defenderOf(attack)), attack.row!, rolled)] }
}
