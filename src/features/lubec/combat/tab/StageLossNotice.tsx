import { lostStageWords } from '../engine/stages'
import type { CombatState } from '../engine/types'

/** The skipped stages and why, visible in every combat phase; the card that took them is under the fighter's name. */
export function StageLossNotice({ state, combatantKey }: { state: CombatState; combatantKey: string }) {
  const words = lostStageWords(state, combatantKey)
  if (!words.length) return null
  return <p className="note">{words.join('; ')}</p>
}
