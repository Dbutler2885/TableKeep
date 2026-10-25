import { createContext, useContext } from 'react'
import type { TokenRecord } from './lib/types'
import { MapRuleSetContext } from './mapRuleSet'

/** Opens one NPC's character sheet over the map. */
export type OpenNpcSheet = (npcId: string) => void

// How the GM opens an NPC's sheet over the map. The Maps panel provides it
// only to a viewer who may open one, so a player has none.
export const MapNpcSheetContext = createContext<OpenNpcSheet | null>(null)

/**
 * Opens an NPC's sheet over the map, where the map's rule set keeps NPC sheets
 * and the viewer may open them; null elsewhere, including outside the Maps
 * panel, where there is neither.
 */
export function useNpcSheetOpener(): OpenNpcSheet | null {
  const open = useContext(MapNpcSheetContext)
  const ruleSet = useContext(MapRuleSetContext)
  return open && ruleSet?.sheet.npcSheet ? open : null
}

/** The NPC whose sheet the token row opens: the one selected token that stands for an NPC, or null for none or several. */
export function npcSheetTokenNpcId(selectedTokens: readonly TokenRecord[]): string | null {
  const npcIds = selectedTokens.flatMap((token) => (token.npcId ? [token.npcId] : []))
  return npcIds.length === 1 ? npcIds[0] : null
}

/** A map token's double-click: opens its NPC's sheet, for an NPC's token where a sheet can be opened. */
export function npcSheetDoubleClick(open: OpenNpcSheet | null, token: TokenRecord) {
  const npcId = token.npcId
  return open && npcId ? () => open(npcId) : undefined
}
