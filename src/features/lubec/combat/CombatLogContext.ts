import { createContext, use } from 'react'
import type { CombatLogEntry } from './combatLog'

export type CombatLogView = {
  entries: CombatLogEntry[]
  cards: CombatLogEntry[]
  /** The cards whose roll has finished revealing; the page may show what they rolled. */
  settled: ReadonlySet<string>
  sessionKey: string
  finishCard: (id: string) => void
  settleCard: (id: string) => void
}
export const EMPTY_COMBAT_LOG: CombatLogView = { entries: [], cards: [], settled: new Set(), sessionKey: '', finishCard: () => undefined, settleCard: () => undefined }
export const CombatLogContext = createContext<CombatLogView>(EMPTY_COMBAT_LOG)
export const useCombatLogView = () => use(CombatLogContext)
