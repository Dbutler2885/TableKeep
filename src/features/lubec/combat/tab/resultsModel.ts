import { combatAttackers } from '../engine/declare'
import type { CombatAttack, CombatState, CombatWoundSection } from '../engine/types'
import type { Banner } from './outcomeWords'

/** The report's severity shades, lightest to darkest. */
export const SEVERITY_CLASS: Readonly<Record<string, string>> = { Minor: 'mi', Serious: 'se', Severe: 'sv', Critical: 'cr', Catastrophic: 'ca' }

export type ResultsWound = {
  severity: string
  cls: string
  trauma: string
  name: string
  /** The table row's own words, exactly as the table writes them. */
  prose: string
  injury: string | null
  notes: string[]
  /** Only what the table leaves to the moment: the dice the wound rolled, and what the struck hand dropped. */
  sections: CombatWoundSection[]
  out: boolean
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

/** What the wound charged: its Trauma always, +0 included, as the table gives it (a passed Body Save can bring it under the row's); Stress only when it charged some. */
function traumaWords(attack: CombatAttack): string {
  const stress = [['Stress', attack.rowStress], ['Minimum Stress', attack.rowMinimumStress]] as const
  const charged = stress.filter(([, amount]) => amount).map(([name, amount]) => `${name} +${amount}`)
  return [`Trauma +${attack.rowTrauma ?? attack.row!.trauma}`, ...charged].join(', ')
}

/** The sections Results show; an attack that landed before them keeps the app's own retired lines, which never show. */
const RESULT_SECTIONS = ['Rolled', 'Struck hand']

/** The wound the hit left, once its row is applied; nothing before then or without one. */
export function resultsWound(state: CombatState, attack: CombatAttack): ResultsWound | null {
  const row = attack.row
  if (!row || attack.rowOutcome == null) return null
  const target = state.combatants.find((entry) => entry.key === attack.aim!.targetKey)!
  return {
    severity: row.severity, cls: SEVERITY_CLASS[row.severity], trauma: traumaWords(attack),
    name: row.name, prose: attack.rowOutcome || row.text, injury: row.injury ?? null, notes: woundNotes(attack),
    sections: (attack.rowSections ?? []).filter((section) => RESULT_SECTIONS.includes(section.label)),
    out: target.outReason !== null,
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
