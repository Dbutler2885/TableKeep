// The version each rule set's characters are written at, by rule-set id, for
// plain Node. The registry itself cannot load here, because it imports app
// modules, so this reads the same versioning the registry declares from the
// step entry point, which is built to load without a bundler.
// `src/features/ruleSets/characterSchemaFloors.test.ts` pins it to the registry.
import { oseCharacterVersioning, vtmCharacterVersioning } from '../../src/features/ruleSets/characterMigrations.ts'

export const currentCharacterSchemaVersions = {
  ose: oseCharacterVersioning.schemaVersion,
  vtm: vtmCharacterVersioning.schemaVersion,
}
