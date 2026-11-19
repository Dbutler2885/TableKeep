import { lubecPlainProse } from '../../../ruleSets/lubec/woundCards'
import { combatAttackers } from '../engine/declare'
import type { CombatAttack, CombatState, CombatWoundSection } from '../engine/types'
import type { Banner } from './outcomeWords'

/** The report's severity shades, lightest to darkest. */
export const SEVERITY_CLASS: Readonly<Record<string, string>> = { Minor: 'mi', Serious: 'se', Severe: 'sv', Critical: 'cr', Catastrophic: 'ca' }

export type WoundPart = { label: string; text: string }
export type ResultsWound = {
  severity: string
  cls: string
  trauma: string
  name: string
  parts: WoundPart[]
  injury: string | null
  notes: string[]
  /** A final row's consequences by when they happen: Now, Next round, Recovery, Lasting. */
  sections: CombatWoundSection[]
  out: boolean
}

const LABELS = /(Now|Lasting(?: \([^)]*\))?|After 1 Long Rest|After 2 Long Rests): /

/** "Now: Dazed. Lasting: -10 Handle. After 1 Long Rest: healed." as labelled parts; words before any label are what it does. */
export function woundParts(text: string): WoundPart[] {
  const [before, ...labelled] = text.split(LABELS)
  const parts = before.trim() ? [{ label: 'What it does', text: before.trim() }] : []
  for (let index = 0; index < labelled.length; index += 2) parts.push({ label: labelled[index], text: labelled[index + 1].trim() })
  return parts
}

const PURPOSE_WORDS = { 'fist-catch': 'Catch their fist', concussion: 'Concussion', prevention: 'Countdown', retention: 'Keep hold' } as const

const checkDiceNote = (rolled: NonNullable<CombatAttack['check']>) =>
  (rolled.dice?.length ?? 0) > 1 ? ` (${rolled.because ? `${rolled.because}: ` : ''}${rolled.dice.map((die) => String(die).padStart(2, '0')).join(' and ')})` : ''

const rollNote = (rolled: NonNullable<CombatAttack['check']>) => {
  const purpose = rolled.purpose ? `${PURPOSE_WORDS[rolled.purpose]}: ` : ''
  const dice = checkDiceNote(rolled)
  const stress = rolled.stress ? `, +${rolled.stress} Stress` : ''
  return `${purpose}${rolled.against} ${rolled.kind === 'save' ? 'Save' : 'Check'} ${String(rolled.result).padStart(2, '0')}${dice} against ${rolled.target}: ${rolled.success ? 'passed' : 'failed'}${stress}`
}

const landingChecks = (attack: CombatAttack) => attack.checks?.length ? attack.checks : attack.check ? [attack.check] : []
const provisionalWound = (row: CombatAttack['row']) => Boolean(row?.table && !row.final)

/** The rolls that picked the wound's version: every landing Save or Check, or a two-wound row's d2. */
function woundNotes(attack: CombatAttack): string[] {
  const notes: string[] = []
  const rolls = landingChecks(attack)
  for (const rolled of rolls) notes.push(rollNote(rolled))
  if (attack.row?.choice) notes.push(`d2 rolled ${attack.row.choice}`)
  if (provisionalWound(attack.row)) notes.push('Resolved by hand')
  return notes
}

/** What the wound charged, leaving out what it did not (a passed Body Save can bring its Trauma under the row's); empty for nothing. */
function traumaWords(attack: CombatAttack): string {
  const charged = [['Trauma', attack.rowTrauma ?? attack.row!.trauma], ['Stress', attack.rowStress], ['Minimum Stress', attack.rowMinimumStress]] as const
  return charged.filter(([, amount]) => amount).map(([name, amount]) => `${name} +${amount}`).join(', ')
}

/** The wound the hit left, once its row is applied; nothing before then or without one. */
export function resultsWound(state: CombatState, attack: CombatAttack): ResultsWound | null {
  const row = attack.row
  if (!row || attack.rowOutcome == null) return null
  const target = state.combatants.find((entry) => entry.key === attack.aim!.targetKey)!
  const prose = lubecPlainProse(attack.rowOutcome || `${row.name}.`)
  return {
    severity: row.severity, cls: SEVERITY_CLASS[row.severity], trauma: traumaWords(attack),
    name: row.name, parts: resultWoundParts(attack, prose), injury: row.injury ?? null, notes: woundNotes(attack),
    sections: attack.rowSections ?? [],
    out: target.outReason !== null,
  }
}

/** A final row's own sections already say what it does; the table's words show only when there are none, as for a missed fist catch. */
function resultWoundParts(attack: CombatAttack, prose: string): WoundPart[] {
  if (!attack.row!.final) return woundParts(prose)
  return attack.rowSections?.length ? [] : [{ label: 'The table says', text: prose }]
}

/** The Results headline, and the one line under it that the wound panel does not already say. */
export function headWords(banner: Banner | null, wound: boolean): { title: string; line: string | null } {
  if (!banner) return { title: 'Done', line: null }
  const line = wound ? banner.aside ?? banner.text : banner.text
  return { title: banner.title, line: line || null }
}

/** What the GM's Continue opens: the next attacker's turn, or the next round. */
export function continueWords(state: CombatState): string {
  const next = combatAttackers(state).find((entry) => !(state.attacked ?? []).includes(entry.key))
  return next ? `Continue: ${next.name}'s turn` : `Continue: Round ${state.round + 1}`
}
