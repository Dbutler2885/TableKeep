import type { CampaignScope } from '../../../campaign/firestorePaths'
import { acknowledgeLubecDeathReminder } from '../../deathReminderAck'
import { LubecDeathReminders } from '../../LubecDeathReminders'
import type { Combatant } from '../engine/types'
import { combatDeathEntries } from './combatDeathEntries'
import type { CombatRosterRecords } from './combatFightCombatants'

/** Marks one reminder handled on the combatant's own sheet; the database is reached only when the GM presses it. */
async function handled(scope: CampaignScope, combatant: Combatant, id: string) {
  const { db } = await import('../../../../firebase')
  return acknowledgeLubecDeathReminder(db, scope, { kind: combatant.kind, sheetId: combatant.sheetId }, id)
}

/** The GM's Death Save prompt in the combat workspace: beside the fight, never pausing it. */
export function CombatDeathReminders({ combatants, roster, scope }: { combatants: readonly Combatant[]; roster: CombatRosterRecords; scope: CampaignScope }) {
  return <LubecDeathReminders entries={combatDeathEntries(combatants, roster, (combatant, id) => handled(scope, combatant, id))} />
}
