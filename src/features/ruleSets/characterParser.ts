import { migrateCharacter, type CharacterVersioning } from './characterMigrations'
import type { StoredCharacter } from './storedCharacter'

// How a rule set reads and writes its own characters. `parse` takes a stored
// document its steps have already brought up to the current version, and
// `serialize` gives back the fields a save writes. Fields the rule set does
// not model, top-level, nested and in list rows, come through both as stored,
// so a save never drops data the code does not know.
// Written as methods so a registry can hold every rule set's parser, whatever its record.
export type CharacterParser<Parsed> = {
  parse(id: string, stored: StoredCharacter): Parsed
  serialize(character: Parsed): StoredCharacter
}

// A stored character as its rule set reads it: the document as the rule set's
// steps left it, beside the record its parser made of that document. The map
// reads the stored values, with its own defaults, where a sheet reads the
// record's tidied ones.
export type CharacterReading<Parsed> = {
  stored: StoredCharacter
  record: Parsed
}

/** Reads a stored character: the rule set's steps run first, then its parser. Nothing is written. */
export function readCharacter<Parsed>(
  versioning: CharacterVersioning,
  parser: CharacterParser<Parsed>,
  id: string,
  raw: StoredCharacter,
): CharacterReading<Parsed> {
  const stored = migrateCharacter(versioning, id, raw).document
  return { stored, record: parser.parse(id, stored) }
}

/** A stored character as its rule set's record: the rule set's steps run first, then its parser. */
export function readStoredCharacter<Parsed>(
  versioning: CharacterVersioning,
  parser: CharacterParser<Parsed>,
  id: string,
  stored: StoredCharacter,
): Parsed {
  return readCharacter(versioning, parser, id, stored).record
}

/** The top-level fields of a stored character outside `known`, as stored. */
export const fieldsOutside = (stored: StoredCharacter, known: ReadonlySet<string>): StoredCharacter =>
  Object.fromEntries(Object.entries(stored).filter(([key]) => !known.has(key)))
