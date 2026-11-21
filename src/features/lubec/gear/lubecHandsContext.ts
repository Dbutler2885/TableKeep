import { createContext, useContext } from 'react'
import { LUBEC_FREE_HANDS, type LubecHandLimits } from '../../ruleSets/lubec/handLimits'

/** The hands the sheet's active cards leave usable, for every Gear move, drop target and load on the page. */
export const LubecHandsContext = createContext<LubecHandLimits>(LUBEC_FREE_HANDS)

export const useLubecHands = (): LubecHandLimits => useContext(LubecHandsContext)
