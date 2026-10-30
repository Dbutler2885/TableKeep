import { createContext, useContext } from 'react'
import type { TokenRecord } from './lib/types'

/** What the Fight action does with these selected tokens; null when it can start no fight. */
export type MapFightFor = (tokens: readonly TokenRecord[]) => (() => void) | null

// How the map's Fight action reaches the rule set's fight host. Only a rule
// set with a fight modal provides it, so the map shows no Fight action elsewhere.
export const MapFightContext = createContext<MapFightFor | null>(null)

/** What the map's Fight action does with these tokens; null where there is none. */
export const useMapFight = (tokens: readonly TokenRecord[]) => useContext(MapFightContext)?.(tokens) ?? null
