import type { NpcRecord } from '../../../../types/app'
import type { LubecCharacterRecord } from '../../../ruleSets/lubec/characterRecord'
import type { CombatSheet } from '../engine/types'

const inPlay = (character: LubecCharacterRecord) => character.creationStatus === 'active'

/** The roster's characters in play, as combat reads a sheet. */
export const characterCombatSheets = (characters: readonly LubecCharacterRecord[]): CombatSheet[] =>
  characters.filter(inPlay).map((character) => ({
    kind: 'character', sheetId: character.id, name: character.name, ownerUserId: character.ownerUserId,
    portraitPath: character.portraitPath, sheet: character.lubec,
  }))

/** An NPC with a sheet, as combat reads it: the public name and face from the NPC, the numbers from its sheet. */
export const npcCombatSheet = (npc: NpcRecord, sheet: LubecCharacterRecord): CombatSheet => ({
  kind: 'npc', sheetId: npc.id, name: npc.name, ownerUserId: sheet.ownerUserId, portraitPath: npc.portraitPath ?? '', sheet: sheet.lubec,
})
