import { lubecCharacterVersioning } from '../../ruleSets/characterMigrations'
import { assertCharacterAtCurrentVersion } from '../../ruleSets/characterSchemaStamp'
import type { StoredCharacter } from '../../ruleSets/storedCharacter'
import { parseLubecCharacter } from '../../ruleSets/lubec/characterParser'
import type { CombatantSelection, CombatSheet } from './engine/types'

export const combatSheetCollection = (selection: CombatantSelection) => (selection.kind === 'character' ? 'characters' : 'npcSheets')

type PublicIdentity = { name: string; portraitPath: string }

/** An NPC's public face lives on its NPC document, beside the GM-only sheet; a character carries its own. */
function publicIdentity(selection: CombatantSelection, sheet: PublicIdentity, npc: Record<string, unknown> = {}): PublicIdentity {
  if (selection.kind === 'character') return sheet
  return { name: String(npc.name ?? sheet.name), portraitPath: String(npc.portraitPath ?? sheet.portraitPath) }
}

/** A selected sheet as combat reads it; it must be at the current schema version. */
export function combatSheetRecord(selection: CombatantSelection, id: string, stored: StoredCharacter, npc?: Record<string, unknown>): CombatSheet {
  assertCharacterAtCurrentVersion(stored, lubecCharacterVersioning)
  const character = parseLubecCharacter(id, stored)
  const identity = publicIdentity(selection, character, npc)
  return { kind: selection.kind, sheetId: selection.sheetId, sheet: character.lubec, ownerUserId: character.ownerUserId, name: identity.name, portraitPath: identity.portraitPath }
}
