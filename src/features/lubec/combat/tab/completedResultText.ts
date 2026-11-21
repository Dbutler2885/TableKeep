import { locName } from '../../../ruleSets/lubec/gear/gearRules'
import { armorAbsorbed } from '../engine/attackFlow'
import type { CombatAttack, CombatImpact } from '../engine/types'
import { rollText } from './attackDraft'
import { attackVerdict } from './attackWords'
import { strengthTitle, tableName, type ResultStep } from './resultSequence'

const movedWords = (moved: number): string => (moved ? `, moved ${moved}` : '')

const absorbedWords = (impact: CombatImpact): string => (armorAbsorbed(impact) > 0 ? ` Armor absorbed ${armorAbsorbed(impact)} damage.` : '')

const attackText = (attack: CombatAttack): string =>
  `${rollText(attack.roll!.roll)} / ${attack.roll!.attackNumber} · ${attackVerdict(attack.roll!)}`

/** Compact summaries use only the published outcome; the original detail stays expandable. */
const TEXT: Readonly<Record<ResultStep, (attack: CombatAttack) => string>> = {
  attack: attackText,
  defense: (attack) => attack.defense ? `${rollText(attack.defense.roll)} / ${attack.defense.value} · ${attack.defense.success ? 'Holds' : 'Fails'} · ${attack.defense.removes} off Quality` : 'No Defense.',
  catch: (attack) => attack.catch ? `${rollText(attack.catch.roll)} / ${attack.catch.chance} · ${attack.catch.success ? 'Caught' : 'Dropped'}` : 'Not rolled.',
  location: (attack) => attack.landing?.part ? `Hits the ${locName(attack.landing.part).toLowerCase()}${movedWords(attack.landing.moved)}.` : 'Not confirmed.',
  wound: (attack) => attack.impact ? `Impact ${attack.impact.total} on ${tableName(attack.impact.table)}.${absorbedWords(attack.impact)}` : strengthTitle(attack.strength),
  check: (attack) => attack.check ? `${rollText(attack.check.result)} / ${attack.check.target} · ${attack.check.success ? 'Success' : 'Failure'}` : 'Not rolled.',
}

export const completedResultText = (attack: CombatAttack, card: ResultStep): string => TEXT[card](attack)
