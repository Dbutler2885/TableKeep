import { describeLubecCheckDice, describeLubecCheckOutcome, readLubecCheckRoll } from '../ruleSets/lubec/checkRoll'
import type { LubecStoredEntry } from '../ruleSets/lubec/characterRecord'
import type { LubecEffect } from '../ruleSets/lubec/effects'
import { locName } from '../ruleSets/lubec/gear/gearRules'
import { lubecPlainProse, type LubecWoundRolledCheck, type LubecWoundSource } from '../ruleSets/lubec/woundCards'

// A wound card opened: the wound it came from, as it landed. The table, the
// struck part, the Impact and severity, the row's words, the d2, every die and
// every Save or Check it rolled, and the Trauma and Stress it charged. Everyone
// who can see the sheet can read it; it never re-reads the table.

const pad = (value: number) => String(value).padStart(2, '0')

function checkWords(check: LubecWoundRolledCheck): string {
  const what = `${check.purpose}: ${check.against} ${check.kind === 'save' ? 'Save' : 'Check'}`
  const dice = check.dice.length > 1 ? `${check.mode === 'advantage' ? 'Advantage' : 'Disadvantage'} ${check.dice.map(pad).join(' and ')}, kept ${pad(check.result)}` : pad(check.result)
  const stress = check.stress ? `, +${check.stress} Stress` : ''
  return `${what} ${dice} against ${check.target}, ${check.success ? 'passed' : 'failed'}${stress}`
}

const diceWords = (dice: Record<string, number[]>) =>
  Object.entries(dice).filter(([, rolled]) => rolled.length).map(([what, rolled]) => `${what} ${rolled.join(' + ')}`)

const signed = (amount: number) => (amount > 0 ? `+${amount}` : `${amount}`)

function chargedWords(wound: LubecWoundSource): string {
  const parts = [`Trauma ${signed(wound.trauma)}`]
  if (wound.stress) parts.push(`Stress ${signed(wound.stress)}`)
  if (wound.minimumStress) parts.push(`Minimum Stress ${signed(wound.minimumStress)}`)
  return parts.join(', ')
}

type DetailProps = { effect: LubecEffect; wound: LubecWoundSource; onEdit: (() => void) | null }

export function LubecWoundDetail({ effect, wound, onEdit }: DetailProps) {
  const recovered = readLubecCheckRoll(effect.recoveryRoll as LubecStoredEntry ?? null)
  const facts: [string, string][] = [
    ['Table', wound.tableName],
    ['Struck', locName(wound.part)],
    ['Impact', String(wound.impact)],
    ['Severity', wound.severity],
    ['Wound', wound.row],
    ['Row', lubecPlainProse(wound.prose)],
    ...(wound.branch === null ? [] : [['d2', String(wound.branch)] as [string, string]]),
    ...diceWords(wound.dice ?? {}).map((words): [string, string] => ['Rolled', words]),
    ...(wound.checks ?? []).map((check): [string, string] => ['Roll', checkWords(check)]),
    ...(recovered ? [['Recovery Save', `${describeLubecCheckDice(recovered)}: ${describeLubecCheckOutcome(recovered)}. ${recovered.because ?? ''}`] as [string, string]] : []),
    ['Charged', chargedWords(wound)],
    ['Source', wound.contentVersion],
  ]
  return (
    <div className="lubec-wound-detail" aria-label={`${effect.name} wound`}>
      <dl>
        {facts.map(([term, value], index) => (
          <div key={`${term}-${index}`} className="lubec-wound-fact"><dt>{term}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      {onEdit ? <button type="button" className="secondary-button" onClick={onEdit}>Edit</button> : null}
    </div>
  )
}
