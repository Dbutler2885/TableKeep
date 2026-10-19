// What every character write adds, and the check the writers that change a
// stored character inside a transaction make first (Spec A 5.9). This file
// imports the Firebase SDK, so it stays apart from the plain-Node migration
// steps in `characterMigrations.ts`.
import { serverTimestamp } from 'firebase/firestore'
import type { CharacterVersioning } from './characterMigrations'
import type { StoredCharacter } from './storedCharacter'

export const CHARACTER_BEING_UPDATED_MESSAGE = 'This character is being updated. Try again in a minute.'

/**
 * The rule set's current version and the server time. The write time is what
 * lets the rules tell a fresh write from a merge that only keeps an old stamp.
 */
export function characterSchemaStamp(versioning: CharacterVersioning) {
  return { schemaVersion: versioning.schemaVersion, schemaWrittenAt: serverTimestamp() }
}

/**
 * Refuses a stored character that is not at the current version: below it, it
 * has not been migrated yet, and writing onto it would stamp an unconverted
 * document as migrated; above it, this code is older than the data.
 */
export function assertCharacterAtCurrentVersion(stored: StoredCharacter, versioning: CharacterVersioning) {
  // A missing `schemaVersion` means 0, written before versioning.
  if ((stored.schemaVersion ?? 0) !== versioning.schemaVersion) throw new Error(CHARACTER_BEING_UPDATED_MESSAGE)
}
