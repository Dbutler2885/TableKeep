import { migrateCharacter, type CharacterVersioning } from './characterMigrations'
import type { StoredCharacter } from './storedCharacter'

// How a rule set reads and writes its own characters. `parse` takes a stored
// document its steps have already brought up to the current version, and
// `serialize` gives back the fields a save writes. Fields the rule set does
// not model, top-level, nested and in list rows, come through both as stored,
// so a save never drops data the code does not know.
export type CharacterParser<Parsed> = {
  parse: (id: string, stored: StoredCharacter) => Parsed
  serialize: (character: Parsed) => StoredCharacter
}

/** A stored character as its rule set reads it: the rule set's steps run first, then its parser. */
export function readStoredCharacter<Parsed>(
  versioning: CharacterVersioning,
  parser: CharacterParser<Parsed>,
  id: string,
  stored: StoredCharacter,
): Parsed {
  return parser.parse(id, migrateCharacter(versioning, id, stored).document)
}

/** The top-level fields of a stored character outside `known`, as stored. */
export const fieldsOutside = (stored: StoredCharacter, known: ReadonlySet<string>): StoredCharacter =>
  Object.fromEntries(Object.entries(stored).filter(([key]) => !known.has(key)))
