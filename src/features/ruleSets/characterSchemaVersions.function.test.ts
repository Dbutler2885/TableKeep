import { describe, expect, it } from 'vitest'
import * as serverVersions from '../../../functions/src/characterSchemaVersions'
// The compiled output is tracked and is what gets deployed, so it runs the same
// cases as its source.
import * as compiledServerVersions from '../../../functions/lib/characterSchemaVersions.js'
import { resolveRuleSet } from './registry'

describe.each([['source', serverVersions], ['compiled', compiledServerVersions]])(
  'the Cloud Functions character version resolver (%s)',
  (_copy, versions: typeof serverVersions) => {
    it.each([['ose', 'ose'], ['vtm', 'vtm'], ['lubec', 'lubec']])('resolves registered %s to itself', (system, expected) => {
      expect(versions.resolveCharacterRuleSet(system)).toBe(expected)
      expect(versions.currentCharacterSchemaVersion(system)).toBe(resolveRuleSet(system).characters.schemaVersion)
    })

    it.each([[undefined], [null], [''], ['pathfinder'], ['OSE'], ['LUBEC'], ['toString'], [7]])(
      'resolves missing, empty and unregistered %j to OSE, as the registry does',
      (system) => {
        expect(versions.resolveCharacterRuleSet(system)).toBe('ose')
        expect(resolveRuleSet(system as string | null | undefined).id).toBe('ose')
        expect(versions.currentCharacterSchemaVersion(system)).toBe(versions.characterSchemaVersions.ose)
      },
    )

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
