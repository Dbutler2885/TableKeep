import type { LubecCharacterRecord } from '../../../ruleSets/lubec/characterRecord'
import type { LubecCombatant } from '../../fight/lubecFightRequest'
import type { LubecNpcIdentity } from '../../lubecNpcSheetRecord'
import type { Combatant } from '../engine/types'

/** The sheets this viewer can read: their own characters, or for the GM every character and NPC sheet. */
export type CombatRosterRecords = {
  characters: readonly LubecCharacterRecord[]
  npcs: readonly { npc: LubecNpcIdentity; sheet: LubecCharacterRecord | null }[]
}

export const NO_ROSTER: CombatRosterRecords = { characters: [], npcs: [] }

/** An NPC as everyone may see it: the fight's public name, face and armor, never its sheet. */
const publicNpc = (combatant: Combatant): LubecNpcIdentity => ({
  id: combatant.sheetId, name: combatant.name, portraitPath: combatant.portraitPath, portraitUrl: null,
  portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn', color: '#555555', size: 34 },
})

function npcCombatant(combatant: Combatant, records: CombatRosterRecords): LubecCombatant {
  const found = records.npcs.find((entry) => entry.npc.id === combatant.sheetId)
  return { kind: 'npc', npc: found?.npc ?? publicNpc(combatant), sheet: found?.sheet ?? null, summary: { armor: combatant.armor, woundLevel: null } }
}

/** The fight modal's view of a combatant; null for a character whose sheet this viewer cannot read. */
export function combatFightCombatant(combatant: Combatant, records: CombatRosterRecords): LubecCombatant | null {
  if (combatant.kind === 'npc') return npcCombatant(combatant, records)
  const character = records.characters.find((entry) => entry.id === combatant.sheetId)
  return character ? { kind: 'character', character } : null
}
