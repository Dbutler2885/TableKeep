import { createContext, useContext } from 'react'

/** Opens the fight modal for the open sheet, with a weapon chosen if one is named. */
export type LubecFightStart = (weaponItemId?: string) => void

// How the open sheet's Fight bar and Gear cards reach the host over them. Only
// a viewer who may fight as the open character has one, so nobody else sees a way in.
export const LubecFightStartContext = createContext<LubecFightStart | null>(null)

/** Starts a fight as the open character; null for a viewer who may not, or outside a host. */
export const useLubecFightStart = () => useContext(LubecFightStartContext)
