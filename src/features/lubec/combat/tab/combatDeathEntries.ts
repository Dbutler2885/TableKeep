import { lubecPendingDeathReminders } from '../../../ruleSets/lubec/deathReminders'
import { lubecCombatantRecord } from '../../fight/lubecFightRequest'
import type { LubecDeathEntry } from '../../LubecDeathReminders'
import type { Combatant } from '../engine/types'
import { combatFightCombatant, type CombatRosterRecords } from './combatFightCombatants'

/** Every combatant's Death Save reminders the GM has not handled, read from their sheets. */
export function combatDeathEntries(combatants: readonly Combatant[], roster: CombatRosterRecords, handle: (combatant: Combatant, id: string) => Promise<unknown>): LubecDeathEntry[] {
  return combatants.flatMap((combatant) => {
    const fighter = combatFightCombatant(combatant, roster)
    const record = fighter ? lubecCombatantRecord(fighter) : null
    return lubecPendingDeathReminders(record?.lubec.deathReminders).map((reminder) => ({
      key: `${combatant.key}:${reminder.id}`, who: combatant.name, reminder, onHandled: () => handle(combatant, reminder.id),
    }))
  })
}
