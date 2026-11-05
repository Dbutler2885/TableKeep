import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import type { LubecItem } from '../../../ruleSets/lubec/gear/gearRecord'
import { place } from '../../../ruleSets/lubec/gear/placement'
import { lubecCombatantRecord } from '../../fight/lubecFightRequest'
import type { Combatant, CombatMovementChoice } from '../engine/types'
import { combatFightCombatant, type CombatRosterRecords } from './combatFightCombatants'
import type { CombatFloorRow } from './combatFloorRows'

export const MOVEMENT_NAMES: Readonly<Record<CombatMovementChoice, string>> = { stay: 'Move or stay', run: 'Run', pickup: 'Pick up', leave: 'Leave the fight' }

/** The sheet in hand for a combatant this viewer controls. */
export const movementSheetOf = (combatant: Combatant, roster: CombatRosterRecords): LubecCharacterSheet | null => {
  const fighter = combatFightCombatant(combatant, roster)
  return (fighter && lubecCombatantRecord(fighter)?.lubec) ?? null
}

/** One of a row's items fits a free hand now; settlement checks the hands again. */
export function pickupBlocked(sheet: LubecCharacterSheet | null, row: CombatFloorRow): string | null {
  if (!sheet) return null
  return place(sheet.gear, 'hands', { ...row.item, qty: 1 } as LubecItem).ok ? null : `No free hand for the ${row.item.name}.`
}

