import { describe, expect, it } from 'vitest'
import * as serverVersions from '../../../functions/src/characterSchemaVersions'
// The compiled output is tracked and is what gets deployed, so it runs the same
// cases as its source.
import * as compiledServerVersions from '../../../functions/lib/characterSchemaVersions.js'
import { resolveRuleSet } from './registry'
import { ruleSetResolutionCases } from './ruleSetResolutionCases'

describe.each([['source', serverVersions], ['compiled', compiledServerVersions]])(
  'the Cloud Functions character version resolver (%s)',
  (_copy, versions: typeof serverVersions) => {
    it.each(ruleSetResolutionCases)('resolves %j to %s, as the registry does', (system, ruleSet) => {
      expect(versions.resolveCharacterRuleSet(system)).toBe(ruleSet)
      expect(resolveRuleSet(system as string | null | undefined).id).toBe(ruleSet)
      expect(versions.currentCharacterSchemaVersion(system)).toBe(resolveRuleSet(system as string | null | undefined).characters.schemaVersion)
    })

    it.each([
      [{ schemaVersion: 1 }, 1, true],
      [{}, 0, true],
      [undefined, 0, true],
      [{}, 1, false],
      [{ schemaVersion: 0 }, 1, false],
      [{ schemaVersion: 2 }, 1, false],
      [{ schemaVersion: '1' }, 1, false],
    ])('judges %j at version %s as %s', (character, version, expected) => {
      expect(versions.isCharacterAtSchemaVersion(character, version)).toBe(expected)
    })
  },
)
