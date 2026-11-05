import { combatHasSheet, useLubecCombat } from './combatWatch'

/** While a live fight has this sheet in it, the sheet's Fight bar and "Fight with this" go to the Combat tab instead. */
export function useCombatRoute(sheetId: string | undefined): (() => void) | null {
  const { live, openCombat } = useLubecCombat()
  return combatHasSheet(live, sheetId) ? openCombat ?? null : null
}
