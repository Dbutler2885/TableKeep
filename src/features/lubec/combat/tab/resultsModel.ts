import { locName } from '../../../ruleSets/lubec/gear/gearRules'
import { combatAttackers } from '../engine/declare'
import type { CombatAttack, CombatState } from '../engine/types'
import { combatantName, pairWords } from './attackWords'
import type { Banner } from './outcomeWords'
import { tableName } from './resultSequence'

/** The report's severity shades, lightest to darkest. */
export const SEVERITY_CLASS: Readonly<Record<string, string>> = { Minor: 'mi', Serious: 'se', Severe: 'sv', Critical: 'cr', Catastrophic: 'ca' }

export type ResultsFact = { term: string; value: string }
export type WoundPart = { label: string; text: string }
export type ResultsWound = {
  severity: string
  cls: string
  trauma: string
  name: string
  parts: WoundPart[]
  injury: string | null
  notes: string[]
  out: boolean
  sheet: string
}

const LABELS = /(Now|Lasting(?: \([^)]*\))?|After 1 Long Rest|After 2 Long Rests): /

/** "Now: Dazed. Lasting: -10 Handle. After 1 Long Rest: healed." as labelled parts; words before any label are what it does. */
export function woundParts(text: string): WoundPart[] {
  const [before, ...labelled] = text.split(LABELS)
  const parts = before.trim() ? [{ label: 'What it does', text: before.trim() }] : []
  for (let index = 0; index < labelled.length; index += 2) parts.push({ label: labelled[index], text: labelled[index + 1].trim() })
  return parts
}

/** Who against whom, with what, where it struck and how hard: only what this attack reached. */
export function resultsFacts(state: CombatState, attack: CombatAttack): ResultsFact[] {
  const facts = [
    { term: 'Who', value: `${combatantName(state, attack.attackerKey)} → ${combatantName(state, attack.aim?.targetKey)}` },
    { term: 'With', value: pairWords(attack.frozen!.weaponName, attack.frozen!.choice.name) },
  ]
  const landing = attack.landing
  if (landing?.part) facts.push({ term: 'Where', value: `${locName(landing.part)}${landing.moved ? `, moved ${landing.moved}` : ''}` })
  if (attack.impact) facts.push({ term: 'How hard', value: `Impact ${attack.impact.total} on ${tableName(attack.impact.table)}` })
  return facts
}

/** The roll that picked the wound's version: a Save or Check, or a two-wound row's d2. */
function woundNotes(attack: CombatAttack): string[] {
  const notes: string[] = []
  const rolled = attack.check
  if (rolled) notes.push(`${rolled.against} ${rolled.kind === 'save' ? 'Save' : 'Check'} ${String(rolled.result).padStart(2, '0')} against ${rolled.target}: ${rolled.success ? 'passed' : 'failed'}`)
  if (attack.row?.choice) notes.push(`d2 rolled ${attack.row.choice}`)
  return notes
}

/** The Trauma the wound gave: a passed Body Save can make it less than the row prints. */
function traumaWords(attack: CombatAttack): string {
  const trauma = attack.rowTrauma ?? attack.row!.trauma
  return trauma > 0 ? `Trauma +${trauma}` : 'Trauma 0'
}

/** The wound the hit left, once its row is applied; nothing before then or without one. */
export function resultsWound(state: CombatState, attack: CombatAttack): ResultsWound | null {
  const row = attack.row
  if (!row || attack.rowOutcome == null) return null
  const target = state.combatants.find((entry) => entry.key === attack.aim!.targetKey)!
  return {
    severity: row.severity, cls: SEVERITY_CLASS[row.severity], trauma: traumaWords(attack),
    name: row.name, parts: woundParts(attack.rowOutcome || `${row.name}.`), injury: row.injury ?? null, notes: woundNotes(attack),
    out: target.outReason !== null, sheet: `Goes on ${target.name}'s sheet next round.`,
  }
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
