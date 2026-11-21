import { lubecCurrentValue, lubecEffectiveHandle } from '../../../ruleSets/lubec/derivations'
import { lubecUnconsciousCards } from '../../../ruleSets/lubec/stageRestrictions'
import { lubecHoles } from '../../../ruleSets/lubec/holes'
import { lubecSheetModifiers } from '../../../ruleSets/lubec/modifiers'
import { lubecNpcFightSummary } from '../../fight/lubecNpcFightSummary'
import type { Combatant, CombatantSelection, CombatSheet } from './types'
import { LUBEC_CONDITION_NAMES } from '../../../ruleSets/lubec/condition'

export const combatantKey = (selection: CombatantSelection) => `${selection.kind}:${selection.sheetId}`

function missingInputs(record: CombatSheet, requireBody: boolean) {
  const modifiers = lubecSheetModifiers(record.sheet)
  const values = {
    Speed: lubecCurrentValue(record.sheet, 'Speed', modifiers),
    'attack/Check Handle': lubecEffectiveHandle(record.sheet, modifiers),
    Strength: lubecCurrentValue(record.sheet, 'Strength', modifiers),
    ...(requireBody ? { 'Body Save': lubecCurrentValue(record.sheet, 'Body', modifiers) } : {}),
  }
  return Object.entries(values).filter(([, value]) => value === null).map(([name]) => name)
}

export function combatSetupIssues(selections: CombatantSelection[], sheets: CombatSheet[], requireBody: boolean): string[] {
  return selections.flatMap((selection) => {
    const record = sheets.find((sheet) => combatantKey(sheet) === combatantKey(selection))
    if (!record) return [`${combatantKey(selection)}: sheet is missing or unreadable.`]
    return missingInputs(record, requireBody).map((name) => `${record.name}: missing ${name}; repair ${lubecHoles(record.sheet).join(', ')}.`)
  })
}

export type CombatPublicSummary = Pick<Combatant, 'name' | 'portraitPath' | 'armor' | 'unconscious' | 'condition'> & { speed: number | null }

/** What everyone may see of a combatant's sheet: name, face, current Speed, worn armor and the GM's condition, nothing else. */
export const combatPublicSummary = (record: CombatSheet): CombatPublicSummary => ({
  unconscious: lubecUnconsciousCards(record.sheet.effects).length > 0,
  ...(record.sheet.condition ? { condition: record.sheet.condition } : {}),
  name: record.name, portraitPath: record.portraitPath,
  speed: lubecCurrentValue(record.sheet, 'Speed', lubecSheetModifiers(record.sheet)),
  armor: lubecNpcFightSummary(record.sheet).armor,
})

/** Only explicit public fields cross the private-sheet boundary. */
export function publicCombatant(record: CombatSheet): Combatant {
  const { speed, ...summary } = combatPublicSummary(record)
  if (speed === null) throw new Error('Speed is missing.')
  return {
    kind: record.kind, sheetId: record.sheetId, key: combatantKey(record),
    ownerUserId: record.ownerUserId, ...summary, speed, interactionSequence: 0, outReason: null,
  }
}

/** Whether a combatant's unresolved stages are skipped: unconscious, or the GM's Comatose or Dead condition. */
export const combatSkipsStages = (combatant: Pick<Combatant, 'unconscious' | 'condition'>): boolean =>
  Boolean(combatant.unconscious || combatant.condition)

/** Why a combatant's stages are skipped, as the table shows it; null when they are not. */
export function combatIncapacity(combatant: Pick<Combatant, 'unconscious' | 'condition'>): string | null {
  if (combatant.condition) return LUBEC_CONDITION_NAMES[combatant.condition]
  return combatant.unconscious ? 'Unconscious' : null
}
