import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { canBeThrown } from './throwableFields'

export const lubecCatchLine = (item: Partial<LubecItem>): string[] => {
  if (!canBeThrown(item)) return []
  return item.catchChance ? [`catch ${item.catchChance}%`] : []
}

/** The item's catch rule, in the wording of the combat mock-up. */
export const lubecCatchRule = (item: Partial<LubecItem>): string[] =>
  canBeThrown(item) && item.catchPutsThrowerOut ? ['Catching this puts the thrower out'] : []

