import { lostStageWords } from '../engine/stages'
import type { CombatState } from '../engine/types'

/** The skipped stages and why, visible in every combat phase; the card that took them is under the fighter's name. */
export function StageLossNotice({ state, combatantKey, chip = false }: { state: CombatState; combatantKey: string; chip?: boolean }) {
  const words = lostStageWords(state, combatantKey)
  if (!words.length) return null
  // On a fighter's one-line row the words sit behind a chip, so the row keeps its height.
  if (chip) return <span className="stage-lost" role="note" title={words.join('; ')} aria-label={words.join('; ')}>Lost</span>
  return <p className="note">{words.join('; ')}</p>
}
