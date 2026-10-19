// VtM's character migration steps. VtM has no old stored format; its default
// filling for missing sheet parts stays in the reader.
import type { CharacterMigrationStep } from '../storedCharacter.ts'

/** Version 0 to 1: stamps the version and changes nothing else. */
export const vtmCharacterV0ToV1: CharacterMigrationStep = (document) => ({ ...document, schemaVersion: 1 })

export const vtmCharacterSteps: readonly CharacterMigrationStep[] = [vtmCharacterV0ToV1]
