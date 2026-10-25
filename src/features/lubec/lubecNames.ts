import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'

export const lubecCharacterName = (character: LubecCharacterRecord) => character.name || 'Unnamed kid'

/** Age as typed: empty clears it, digits set it, and anything else is refused (`undefined`). */
export function lubecAgeFromInput(text: string): number | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  return /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : undefined
}
