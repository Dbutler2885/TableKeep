import type { StoredCharacter } from '../../ruleSets/storedCharacter'
import { combatSheetCollection, combatSheetRecord } from './combatSheetRecord'
import type { CombatantSelection, CombatSheet } from './engine/types'

/** The documents a combatant's public summary is read from: its sheet, and an NPC's public story record. */
export const combatantPaths = (selection: CombatantSelection): string[] => [
  `${combatSheetCollection(selection)}/${selection.sheetId}`,
  ...(selection.kind === 'npc' ? [`npcs/${selection.sheetId}`] : []),
]

type Docs = ReadonlyMap<string, Record<string, unknown> | null>

function readable(selection: CombatantSelection, docs: Docs): CombatSheet | null {
  const [sheetPath, npcPath] = combatantPaths(selection)
  const stored = docs.get(sheetPath)
  if (!stored) return null
  try {
    return combatSheetRecord(selection, selection.sheetId, stored as StoredCharacter, docs.get(npcPath ?? '') ?? undefined)
  } catch {
    return null
  }
}

/** The combatants' sheets as read; a missing or unreadable one is left out, as the transaction leaves it out. */
export const combatantSheets = (selections: readonly CombatantSelection[], docs: Docs): CombatSheet[] =>
  selections.map((selection) => readable(selection, docs)).filter((sheet): sheet is CombatSheet => sheet !== null)
