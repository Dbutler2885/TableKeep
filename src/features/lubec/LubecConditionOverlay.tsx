import { Skull } from 'lucide-react'
import { LUBEC_CONDITION_NAMES, type LubecCondition } from '../ruleSets/lubec/condition'

/** The same portrait treatment as OSE's skull, with Zzz for Comatose. */
export function LubecConditionOverlay({ condition }: { condition?: LubecCondition }) {
  if (!condition) return null
  return <span className="character-dead-overlay" role="img" aria-label={LUBEC_CONDITION_NAMES[condition]}>{condition === 'dead' ? <Skull size={26} /> : <b>Zzz</b>}</span>
}
