// The version each rule set's characters are written at, by rule-set id, for
// plain Node. The registry itself cannot load here, because it imports app
// modules, so this reads the plain-Node table the migration script uses.
// `src/features/ruleSets/characterSchemaFloors.test.ts` pins it to the registry.
import { characterVersioningByRuleSet } from '../../src/features/ruleSets/characterMigrations.ts'

export const currentCharacterSchemaVersions = Object.fromEntries(
  Object.entries(characterVersioningByRuleSet).map(([id, versioning]) => [id, versioning.schemaVersion]),
)
