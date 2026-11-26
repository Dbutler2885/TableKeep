import type { Role } from '../../../../types/app'
import type { CampaignScope } from '../../../campaign/firestorePaths'
import type { LubecCharacterRecord } from '../../../ruleSets/lubec/characterRecord'
import { describeLubecEffectStep, type LubecEffect } from '../../../ruleSets/lubec/effects'
import { lubecEffectGroups, lubecPlainProse } from '../../../ruleSets/lubec/woundCards'
import { readWoundLifetime } from '../../../ruleSets/lubec/woundLifetime'
import type { LubecEffectRecovery } from '../../effectRecovery'
import type { LubecStore } from '../../useLubecSheetSession'
import type { Combatant } from '../engine/types'
import type { CombatRosterRecords } from './combatFightCombatants'

// A fighter's active effects where play happens: each row of the turn order
// lists the cards on the sheet behind it, for whoever can read that sheet,
// and opens the sheet's own Effects panel to read a wound or step a card down.

/** How the combat tab saves a sheet it shows: the shared store's own writes, and the recovery Saves for one of its records. */
export type CombatSheetWriter = Pick<LubecStore, 'updateCharacter' | 'updateCharacterNow' | 'hasPendingWrite'> & {
  recovery: (record: LubecCharacterRecord) => LubecEffectRecovery
}

/** The writer for each collection a fighter's sheet lives in; null where this viewer has none. */
export type CombatSheetWriters = { characters: CombatSheetWriter | null; npcSheets: CombatSheetWriter | null }

export const NO_SHEET_WRITERS: CombatSheetWriters = { characters: null, npcSheets: null }

/** What the turn order needs to show and change fighters' effects. */
export type CombatEffectsAccess = {
  roster: CombatRosterRecords
  writers: CombatSheetWriters
  scope: CampaignScope
  viewer: { role: Role; userId: string }
}

/** The sheet behind a fighter, and where it is stored. */
export type FighterSheet = { record: LubecCharacterRecord; collection: keyof CombatSheetWriters }

/** The fighter's sheet when this viewer can read it: every sheet for the GM, a player's own characters, never another's NPC. */
export function fighterSheet(combatant: Combatant, roster: CombatRosterRecords): FighterSheet | null {
  if (combatant.kind === 'npc') {
    const record = roster.npcs.find((entry) => entry.npc.id === combatant.sheetId)?.sheet
    return record ? { record, collection: 'npcSheets' } : null
  }
  const record = roster.characters.find((entry) => entry.id === combatant.sheetId)
  return record ? { record, collection: 'characters' } : null
}

/** Who may change a fighter's cards: the GM, or the sheet's owner, as `canEditCharacterStoreCharacter` rules for the sheet itself. */
export const fighterSheetEditable = (sheet: FighterSheet, viewer: CombatEffectsAccess['viewer']): boolean =>
  viewer.role === 'gm' || sheet.record.ownerUserId === viewer.userId

/** One effect as the turn order says it: which card, what it does now, and what ends it, and all three as one line. */
export type FighterEffectLine = { id: string; label: string; now: string | null; until: string | null; words: string }

const nowOf = (effect: LubecEffect): string | null => {
  const words = effect.steps[0] ? describeLubecEffectStep(effect.steps[0]) : ''
  return words || null
}

/** One wound as a chip, named as the table names it, however many cards it made; a hand-made effect by its own name. */
const lifetimeOf = (effect: LubecEffect) => readWoundLifetime({ effect, at: null })

function lineOf(group: ReturnType<typeof lubecEffectGroups>[number]): FighterEffectLine {
  const first = group.effects[0]
  const now = group.effects.map(nowOf).filter(Boolean).join('; ') || null
  const until = group.wound ? group.effects.map((effect) => lifetimeOf(effect).roundTrigger).filter(Boolean).join('; ') || null : lifetimeOf(first).trigger
  const line = { id: first.id, label: first.name, now, until }
  const what = group.wound?.prose ? lubecPlainProse(group.wound.prose).replace(/\.$/, '') : line.now
  return { ...line, words: [line.label, what, line.until].filter(Boolean).join(' · ') }
}

export const fighterEffectLines = (effects: readonly LubecEffect[]): FighterEffectLine[] => lubecEffectGroups(effects).map(lineOf)
