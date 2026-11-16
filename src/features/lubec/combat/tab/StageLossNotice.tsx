import { lostStageWords } from '../engine/stages'
import type { CombatState } from '../engine/types'

/** The skipped stages and the wound card that took them, visible in every combat phase. */
export function StageLossNotice({ state, combatantKey }: { state: CombatState; combatantKey: string }) {
  const words = lostStageWords(state, combatantKey)
  if (!words.length) return null
  return <details className="note"><summary>{words.join('; ')}</summary><p>Effect card: {state.lost?.[combatantKey]?.wound ?? state.lost?.[combatantKey]?.reason ?? 'Unconscious'}. Open the character sheet to inspect its recovery.</p></details>
}
