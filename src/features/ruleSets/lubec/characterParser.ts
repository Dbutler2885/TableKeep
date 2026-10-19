import type { CharacterParser } from '../characterParser'
import type { StoredCharacter } from '../storedCharacter'

// Lubec has no sheet yet, so its record is the stored document itself: parse
// and serialize hand it through unchanged, unknown fields and all.
export const lubecCharacterParser: CharacterParser<StoredCharacter> = {
  parse: (_id, stored) => stored,
  serialize: (character) => character,
}
