// The character migration steps of every rule set, and the runner that applies
// them. Steps are pure and self-contained: this file and the step modules it
// imports load in plain Node (no bundler), so the migration script can run the
// same steps the app does. Import nothing here that is not a step module.
import { oseCharacterSteps } from './ose/characterMigrations.ts'
import type { CharacterMigrationStep, StoredCharacter } from './storedCharacter.ts'
import { vtmCharacterSteps } from './vtm/characterMigrations.ts'

export type { CharacterMigrationStep, StoredCharacter } from './storedCharacter.ts'

export type CharacterVersioning = {
  // The version every character of this rule set is written at.
  schemaVersion: number
  // The steps in order: the step at index N takes a document of version N to N + 1.
  migrations: readonly CharacterMigrationStep[]
}

export const oseCharacterVersioning: CharacterVersioning = { schemaVersion: 1, migrations: oseCharacterSteps }

export const vtmCharacterVersioning: CharacterVersioning = { schemaVersion: 1, migrations: vtmCharacterSteps }

export type CharacterMigrationResult = {
  // `current`: already at the current version, returned as stored.
  // `migrated`: brought up from an older version.
  // `newer`: above the current version, returned as stored; nothing is downgraded.
  status: 'current' | 'migrated' | 'newer'
  fromVersion: number
  document: StoredCharacter
}

const isWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

/** A document's stored version. A missing `schemaVersion` means 0, written before versioning. */
export function storedSchemaVersion(document: StoredCharacter): number {
  const stored = document.schemaVersion
  if (stored === undefined) return 0
  if (!isWholeNumber(stored)) throw new Error(`schemaVersion is not a whole number: ${String(stored)}`)
  return stored
}

/** Runs one step and checks it produced exactly the next version. */
function applyStep(versioning: CharacterVersioning, version: number, document: StoredCharacter, characterId: string) {
  const next = versioning.migrations[version](document, characterId)
  if (storedSchemaVersion(next) !== version + 1) {
    throw new Error(`migration step ${version} did not produce version ${version + 1}`)
  }
  return next
}

/** Applies a rule set's steps to one stored character, from its stored version up to the current one. */
export function migrateCharacter(
  versioning: CharacterVersioning,
  characterId: string,
  document: StoredCharacter,
): CharacterMigrationResult {
  const fromVersion = storedSchemaVersion(document)
  if (fromVersion > versioning.schemaVersion) return { status: 'newer', fromVersion, document }
  if (fromVersion === versioning.schemaVersion) return { status: 'current', fromVersion, document }
  let migrated = document
  for (let version = fromVersion; version < versioning.schemaVersion; version += 1) {
    migrated = applyStep(versioning, version, migrated, characterId)
  }
  return { status: 'migrated', fromVersion, document: migrated }
}
