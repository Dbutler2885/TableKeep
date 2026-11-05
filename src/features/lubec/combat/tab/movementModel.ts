import type { LubecCharacterSheet } from '../../../ruleSets/lubec/characterRecord'
import type { LubecItem } from '../../../ruleSets/lubec/gear/gearRecord'
import { place } from '../../../ruleSets/lubec/gear/placement'
import { lubecCombatantRecord } from '../../fight/lubecFightRequest'
import { lubecHeld, type LubecHands } from '../../../ruleSets/lubec/gear/held'
import type { Combatant, CombatMovementChoice, CombatState } from '../engine/types'
import { controlsAttacker, type CombatViewer } from './attackWords'
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


const HAND_WORDS: Readonly<Record<LubecHands, string>> = { left: 'in the left hand', right: 'in the right hand', both: 'in both hands' }

/** "Wayne Gardner: a Dodgeball in the left hand and a Walkie-talkie in the right hand." */
export function handsLine(combatant: Combatant, sheet: LubecCharacterSheet): string {
  const held = lubecHeld(sheet.gear).map((entry) => `a ${entry.name} ${HAND_WORDS[entry.hands]}`)
  return `${combatant.name}: ${held.length ? held.join(' and ') : 'both hands empty'}.`
}

const HANDS_PHASES = ['declare', 'attack']

/** What the viewer's own fighters hold, under the Floor once Declare begins. */
export function viewerHands(state: CombatState, viewer: CombatViewer, roster: CombatRosterRecords): string[] {
  if (!HANDS_PHASES.includes(state.phase)) return []
  return state.combatants
    .filter((entry) => entry.kind === 'character' && entry.outReason === null && controlsAttacker(entry, viewer))
    .flatMap((entry) => { const sheet = movementSheetOf(entry, roster); return sheet ? [handsLine(entry, sheet)] : [] })
}
