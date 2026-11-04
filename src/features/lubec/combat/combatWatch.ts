import { createContext, use } from 'react'
import type { Role } from '../../../types/app'
import type { CombatTabAccess } from '../../shell/shellTabs'
import type { CombatFight } from './engine/types'

export type LubecLiveFight = { id: string; fight: CombatFight }

/**
 * The workspace's one view of the campaign's fight: whether this build and
 * campaign follow fights at all, whether the first read has arrived, and the
 * live fight, if there is one.
 */
export type LubecCombatWatch = { enabled: boolean; ready: boolean; live: LubecLiveFight | null }

export const LUBEC_COMBAT_OFF: LubecCombatWatch = { enabled: false, ready: true, live: null }

/** Shared by the nav, the Combat tab and the GM's services, so they hold one subscription between them. */
export const LubecCombatContext = createContext<LubecCombatWatch>(LUBEC_COMBAT_OFF)

export const useLubecCombat = () => use(LubecCombatContext)

/** Only a live fight is offered; an ended document is history, which has no view yet. */
export const liveFightOf = (seen: LubecLiveFight | null): LubecLiveFight | null => (seen?.fight.status === 'live' ? seen : null)

/** The GM always has the Combat tab; a player has it only while a fight is live, and waits while that is unknown. */
export function lubecCombatTabAccess(watch: LubecCombatWatch, role: Role | null): CombatTabAccess {
  if (!watch.enabled) return false
  if (role === 'gm') return true
  return watch.ready ? watch.live !== null : null
}

/** The live fight a viewer should be taken to: one they have a combatant in and have not been taken to yet. */
export function arrivingFightId(live: LubecLiveFight | null, userId: string, moved: ReadonlySet<string>): string | null {
  if (!live || moved.has(live.id)) return null
  return live.fight.state.combatants.some((combatant) => combatant.ownerUserId === userId) ? live.id : null
}
