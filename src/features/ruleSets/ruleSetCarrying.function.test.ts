import { describe, expect, it } from 'vitest'
import * as serverCarrying from '../../../functions/src/ruleSetCarrying'
import * as serverOseCarrying from '../../../functions/src/oseCarrying'
// The compiled output is tracked and is what gets deployed, so it runs the same
// cases as its source.
import * as compiledServerCarrying from '../../../functions/lib/ruleSetCarrying.js'
import * as compiledServerOseCarrying from '../../../functions/lib/oseCarrying.js'
import { resolveRuleSet, ruleSets } from './registry'
import { ruleSetResolutionCases } from './ruleSetResolutionCases'

describe.each([
  ['source', serverCarrying, serverOseCarrying],
  ['compiled', compiledServerCarrying, compiledServerOseCarrying],
] as const)('the Cloud Functions transfer carrying table (%s)', (_copy, carrying, oseCarrying) => {
  it("declares carrying for exactly the registry's rule sets that have it", () => {
    expect(Object.keys(carrying.transferCarryingByRuleSet).sort()).toEqual(Object.keys(ruleSets).sort())
    for (const ruleSet of Object.values(ruleSets)) {
      expect(carrying.transferCarryingByRuleSet[ruleSet.id] !== null).toBe(ruleSet.carrying !== null)
    }
  })

  it("accepts an OSE transfer with OSE's server rule", () => {
    expect(carrying.transferCarryingByRuleSet.ose).toEqual({
      packedSlots: oseCarrying.availablePackedSlots,
      acceptTransfer: oseCarrying.applyAcceptedTransfer,
    })
  })

  it.each(ruleSetResolutionCases)('resolves %j to the carrying of %s, as the registry does', (system, ruleSet) => {
    expect(carrying.resolveTransferCarrying(system)).toBe(carrying.transferCarryingByRuleSet[ruleSet])
    expect(carrying.resolveTransferCarrying(system) !== null)
      .toBe(resolveRuleSet(system as string | null | undefined).carrying !== null)
  })
})
