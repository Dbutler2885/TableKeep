import type { CombatAttack, CombatState } from '../engine/types'
import { outcomeBanner } from './outcomeWords'

export function OutcomeBanner({ state, attack }: { state: CombatState; attack: CombatAttack }) {
  const banner = outcomeBanner(state, attack)
  if (!banner) return null
  return <div className={`outcome ${banner.tone}`.trim()}><h4>{banner.title}</h4><p>{banner.text}</p></div>
}
