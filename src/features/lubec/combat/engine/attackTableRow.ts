import { locName } from '../../../ruleSets/lubec/gear/gearRules'
import { lubecWoundTableRow, type LubecLocatedWoundRow, type LubecWoundTableRow } from '../../../ruleSets/lubec/woundTables'
import type { CombatWound } from '../woundTypes'
import { closeAttack, stepRequest } from './attackFlow'
import { combatantOf, defenderOf } from './attackParty'
import type { CombatEntropy } from './commandEntropy'
import type { CombatAttack, CombatCommand, CombatFight, CombatPlan, CombatSheet, CombatState, CombatWoundRow } from './types'
import { checkLog, rollRowCheck } from './woundCheck'

// Blunt Force, Gunshot, Piercing, Cutting, Thrown Objects and Fisticuffs: the located tables the
// hit-location report drafts. Dodgeball keeps its own path in attackRow.

const BODY_SAVE = { kind: 'save', against: 'Body', advantage: 'normal' } as const

/** What the hit reads: its table, the struck part's location, and the row its Impact reaches. */
const locatedOf = (attack: CombatAttack): LubecLocatedWoundRow =>
  lubecWoundTableRow(attack.impact!.table, attack.landing!.part!, attack.impact!.total)!

/** The wound a row gives: the one its d2 rolled, or the row itself. */
function woundOf(row: LubecWoundTableRow, pick: number | null) {
  const wound = pick === null ? row : row.choices![pick - 1]
  return { name: wound.name, text: wound.text, injury: wound.injury ?? null }
}

/** The row as the attack keeps it; a d2 row keeps the one wound it rolled. */
function storedRow({ table, location, row }: LubecLocatedWoundRow, pick: number | null): CombatWoundRow {
  return {
    group: location.parts.join('+'), impact: row.impact, ...woundOf(row, pick), severity: row.severity, trauma: row.trauma,
    check: row.save ? { ...BODY_SAVE } : null, table: table.key, choice: pick, out: row.out === true,
  }
}

type Applied = { text: string; trauma: number }

/** The row's words and Trauma; a Body Save row takes its success or failure version. */
function appliedRow(row: CombatWoundRow, located: LubecLocatedWoundRow, saved: boolean | null): Applied {
  const save = located.row.save
  if (!save || saved === null) return { text: row.text, trauma: row.trauma }
  const version = saved ? save.success : save.failure
  return { text: [row.text, version].filter(Boolean).join(' '), trauma: saved ? save.successTrauma : row.trauma }
}

/** The sheet effect: the wound's words, and the lasting injury it leaves. */
function woundEffect(attack: CombatAttack, row: CombatWoundRow, applied: Applied, tableName: string, entropy: CombatEntropy) {
  const part = attack.landing!.part!
  const labels = [applied.text || `${row.name}.`, ...(row.injury ? [`Lasting injury: ${row.injury}`] : [])]
  return {
    id: entropy.id('effect', 0), name: row.name, duration: null, struckLocation: part,
    cause: `${tableName}, ${locName(part).toLowerCase()}, Impact ${attack.impact!.total}: ${row.severity} ${row.name}`,
    steps: [{ modifiers: [], labels }],
    source: { table: row.table, group: row.group, impact: row.impact, name: row.name, severity: row.severity, injury: row.injury ?? null },
  }
}

/** Every located row is a wound: it goes to the target's sheet, effective next round, with its Trauma and any Save's Stress. */
function tableWound(state: CombatState, attack: CombatAttack, applied: Applied, stress: number, located: LubecLocatedWoundRow, entropy: CombatEntropy): CombatWound {
  const target = combatantOf(state, defenderOf(attack))
  return {
    id: entropy.id('wound', 0), target: { kind: target.kind, sheetId: target.sheetId }, originatingRound: state.round, effectiveRound: state.round + 1,
    traumaDelta: applied.trauma, stressDelta: stress, effect: woundEffect(attack, attack.row!, applied, located.table.name, entropy),
  }
}

/** The wound lands: an unconscious target is Out at once, the wound queues for the sheet, and the attack closes. */
function applyRow(state: CombatState, attack: CombatAttack, applied: Applied, stress: number, entropy: CombatEntropy): CombatState {
  const located = locatedOf(attack)
  const targetKey = defenderOf(attack)
  const combatants = state.combatants.map((entry) => (entry.key === targetKey && attack.row!.out && entry.outReason === null ? { ...entry, outReason: 'wound' } : entry))
  const woundOutbox = [...state.woundOutbox, tableWound(state, attack, applied, stress, located, entropy)]
  return closeAttack({ ...state, combatants, woundOutbox }, { ...attack, rowOutcome: applied.text, rowTrauma: applied.trauma }, 'wounded')
}

/** A positive Impact on a located table reads its row: a d2 picks between two wounds, a Body Save waits on the target. */
export function readTableRow(fight: CombatFight, attack: CombatAttack, entropy: CombatEntropy): CombatFight {
  const located = locatedOf(attack)
  const pick = located.row.choices ? entropy.die('wound-choice', 2) : null
  const withRow = { ...attack, row: storedRow(located, pick) }
  if (!located.row.save) return { ...fight, state: applyRow(fight.state, withRow, appliedRow(withRow.row, located, null), 0, entropy) }
  return { ...fight, state: { ...fight.state, attack: { ...withRow, step: 'check' }, pendingActions: stepRequest(defenderOf(attack), 'save') } }
}

/** The target's Body Save picks the row's version; failing it adds the Save's Stress too. */
export function tableChecked(fight: CombatFight, attack: CombatAttack, record: CombatSheet, command: CombatCommand, entropy: CombatEntropy): CombatPlan {
  const rolled = rollRowCheck(record, attack.row!, command.envelope.fightId, fight.state.round, entropy)
  const applied = appliedRow(attack.row!, locatedOf(attack), rolled.success)
  const state = applyRow(fight.state, { ...attack, check: rolled, repair: null }, applied, rolled.stress, entropy)
  return { fight: { ...fight, state }, items: [], logs: [checkLog(combatantOf(fight.state, defenderOf(attack)), attack.row!, rolled)] }
}
