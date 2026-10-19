import { describe, expect, it } from 'vitest'
import { characterVersioningByRuleSet, resolveCharacterRuleSetId } from './characterMigrations'
import { resolveRuleSet, ruleSets } from './registry'

// The migration script cannot load the registry, so it resolves campaigns with
// the plain-Node table in `characterMigrations.ts`. A rule set added to the
// registry has to be added to that table too, or this fails.
describe('the migration script\'s rule-set table', () => {
  it('lists every registered rule set, with the versioning the registry declares', () => {
    expect(Object.keys(characterVersioningByRuleSet).sort()).toEqual(Object.keys(ruleSets).sort())
    for (const ruleSet of Object.values(ruleSets)) {
      const versioning = characterVersioningByRuleSet[ruleSet.id as keyof typeof characterVersioningByRuleSet]
      expect(versioning.schemaVersion).toBe(ruleSet.characters.schemaVersion)
      expect(versioning.migrations).toBe(ruleSet.characters.migrations)
    }
  })

  it.each([['ose'], ['vtm'], ['lubec'], ['LUBEC'], [undefined], [null], [''], ['pathfinder'], ['OSE'], ['toString'], [7]])(
    'resolves %j as the registry does',
    (system) => {
      expect(resolveCharacterRuleSetId(system)).toBe(resolveRuleSet(system as string | null | undefined).id)
    },
  )
})
