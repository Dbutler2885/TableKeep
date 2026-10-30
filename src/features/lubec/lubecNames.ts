import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'

export const lubecCharacterName = (character: Pick<LubecCharacterRecord, 'name'>) => character.name || 'Unnamed kid'

/** Age as typed: empty clears it, digits set it, and anything else is refused (`undefined`). */
export function lubecAgeFromInput(text: string): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  return /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : undefined
}

// The player's name rides inside the stored `lubec` field, which keeps every key
// the rules do not read, as the prototype keeps it beside the character's own.
type LubecSheetWithPlayer = LubecCharacterRecord['lubec'] & { playerName?: unknown }

export const lubecPlayerName = (character: LubecCharacterRecord): string => {
  const { playerName } = character.lubec as LubecSheetWithPlayer
  return typeof playerName === 'string' ? playerName : ''
}

export const withLubecPlayerName = (character: LubecCharacterRecord, playerName: string): LubecSheetWithPlayer =>
  ({ ...character.lubec, playerName })
