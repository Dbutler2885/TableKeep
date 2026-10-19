// A character document as Firestore stores it, before any rule set reads it.
export type StoredCharacter = Record<string, unknown>

// One migration step: a stored document of version N in, the same character at
// version N + 1 out. A step reads nothing but the document and its id, writes
// nothing, and keeps every field it does not know.
export type CharacterMigrationStep = (document: StoredCharacter, characterId: string) => StoredCharacter
