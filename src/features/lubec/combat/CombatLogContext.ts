import { createContext, use } from 'react'
import type { CombatLogEntry } from './combatLog'

export type CombatLogView = { entries: CombatLogEntry[]; cards: CombatLogEntry[] }
export const EMPTY_COMBAT_LOG: CombatLogView = { entries: [], cards: [] }
export const CombatLogContext = createContext<CombatLogView>(EMPTY_COMBAT_LOG)
export const useCombatLogView = () => use(CombatLogContext)
