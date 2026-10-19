/**
 * The character schema floors in `firestore.rules` against the registry. A
 * rules file cannot import the registry, so its list of rule sets and its
 * floors are pinned here: a rule set only one side knows would resolve
 * differently in the rules and the app, and a floor above the version the app
 * writes would refuse every character write in that rule set.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { currentCharacterSchemaVersions } from '../../../scripts/floor-rehearsal/currentVersions.mjs'
import {
  characterSchemaFloorDrift,
  readCharacterSchemaFloors,
  withCharacterSchemaFloors,
} from '../../../scripts/floor-rehearsal/floors.mjs'
import { ruleSets } from './registry'

const rulesText = readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8')

const registryVersions = Object.fromEntries(
  Object.values(ruleSets).map((ruleSet) => [ruleSet.id, ruleSet.characters.schemaVersion]),
)

describe('character schema floors', () => {
  it("lists exactly the registry's rule sets in firestore.rules", () => {
    expect(Object.keys(readCharacterSchemaFloors(rulesText)).sort()).toEqual(Object.keys(ruleSets).sort())
  })

  it('keeps every floor at or below the version the app writes', () => {
    expect(characterSchemaFloorDrift(readCharacterSchemaFloors(rulesText), registryVersions)).toEqual([])
  })

  it('fails when a floor is raised above the current version', () => {
    const raised = withCharacterSchemaFloors(rulesText, { ...registryVersions, ose: registryVersions.ose + 1 })
    expect(characterSchemaFloorDrift(readCharacterSchemaFloors(raised), registryVersions)).toEqual([
      `"ose" has floor ${registryVersions.ose + 1}, above its current version ${registryVersions.ose}.`,
    ])
  })

  it('gives the raised-floor rehearsal the same current versions as the registry', () => {
    expect(currentCharacterSchemaVersions).toEqual(registryVersions)
  })
})
