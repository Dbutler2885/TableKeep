import { lostStageWords } from '../engine/stages'
import type { CombatState } from '../engine/types'

const stageSource = (state: CombatState, key: string) => {
  const lost = state.lost?.[key]
  return lost?.wound ?? lost?.reason ?? 'Unconscious'
}

/** The skipped stages and the wound card that took them, visible in every combat phase. */
export function StageLossNotice({ state, combatantKey }: { state: CombatState; combatantKey: string }) {
  const words = lostStageWords(state, combatantKey)
  if (!words.length) return null
  return <details className="note"><summary>{words.join('; ')}</summary><p>Effect card: {stageSource(state, combatantKey)}. Open the character sheet to inspect its recovery.</p></details>
}
