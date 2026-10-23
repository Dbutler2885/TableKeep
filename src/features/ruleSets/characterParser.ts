import type { StoredCharacter } from './storedCharacter'

// How a rule set reads and writes its own characters. `parse` takes a stored
// document at the current version, as the migration leaves every character,
// and `serialize` gives back the fields a save writes. Fields the rule set does
// not model, top-level, nested and in list rows, come through both as stored,
// so a save never drops data the code does not know.
// Written as methods so a registry can hold every rule set's parser, whatever its record.
export type CharacterParser<Parsed> = {
  parse(id: string, stored: StoredCharacter): Parsed
  serialize(character: Parsed): StoredCharacter
}

/** The top-level fields of a stored character outside `known`, as stored. */
export const fieldsOutside = (stored: StoredCharacter, known: ReadonlySet<string>): StoredCharacter =>
  Object.fromEntries(Object.entries(stored).filter(([key]) => !known.has(key)))
