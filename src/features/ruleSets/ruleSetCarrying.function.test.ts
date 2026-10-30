import { describe, expect, it } from 'vitest'
import * as serverCarrying from '../../../functions/src/ruleSetCarrying'
import * as serverOseCarrying from '../../../functions/src/oseCarrying'
import * as serverLubecTransfer from '../../../functions/src/lubecGearTransfer'
// The compiled output is tracked and is what gets deployed, so it runs the same
// cases as its source.
import * as compiledServerCarrying from '../../../functions/lib/ruleSetCarrying.js'
import * as compiledServerOseCarrying from '../../../functions/lib/oseCarrying.js'
import * as compiledServerLubecTransfer from '../../../functions/lib/lubecGearTransfer.js'
import { resolveRuleSet, ruleSets } from './registry'
import { ruleSetResolutionCases } from './ruleSetResolutionCases'
import { transferCases } from '../character/oseCarryingCases'

describe.each([
  ['source', serverCarrying, serverOseCarrying, serverLubecTransfer],
  ['compiled', compiledServerCarrying, compiledServerOseCarrying, compiledServerLubecTransfer],
] as const)('the Cloud Functions transfer carrying table (%s)', (_copy, carrying, oseCarrying, lubecTransfer) => {
  it("declares a server rule for exactly the registry's rule sets that have transfers", () => {
    expect(Object.keys(carrying.transferCarryingByRuleSet).sort()).toEqual(Object.keys(ruleSets).sort())
    for (const ruleSet of Object.values(ruleSets)) {
      expect(carrying.transferCarryingByRuleSet[ruleSet.id] !== null).toBe(ruleSet.transfers)
    }
  })

  it("accepts an OSE transfer with OSE's adapter, and a Lubec one with Lubec's gear rule", () => {
    expect(carrying.transferCarryingByRuleSet.ose).toBe(oseCarrying.acceptOseTransfer)
    expect(carrying.transferCarryingByRuleSet.lubec).toBe(lubecTransfer.acceptLubecTransfer)
  })

  it.each(ruleSetResolutionCases)('resolves %j to the carrying of %s, as the registry does', (system, ruleSet) => {
    expect(carrying.resolveTransferCarrying(system)).toBe(carrying.transferCarryingByRuleSet[ruleSet])
    expect(carrying.resolveTransferCarrying(system) !== null)
      .toBe(resolveRuleSet(system as string | null | undefined).transfers)
  })
})

// The adapter writes exactly what `applyAcceptedTransfer` decides, into each
// character's `details` with every other detail kept, and refuses with the
// packed-slots words.
describe.each([
  ['source', serverOseCarrying],
  ['compiled', compiledServerOseCarrying],
] as const)("OSE's transfer adapter (%s)", (_copy, oseCarrying) => {
  it.each(transferCases)('$name', (testCase) => {
    const sender = { ownerUserId: 'u', details: { notes: 'kept', inventory: testCase.senderInventory } }
    const receiver = { details: { abilityScores: { STR: testCase.receiverStr }, inventory: testCase.receiverInventory } }
    const { expected } = testCase
    const outcome = oseCarrying.acceptOseTransfer(sender, receiver, testCase.transfer)

    if (!expected.ok) {
      expect(outcome).toEqual(expected.reason === 'packed_slots'
        ? { ok: false, reason: 'no_room', message: oseCarrying.PACKED_SLOTS_MESSAGE }
        : expected)
      return
    }
    expect(outcome).toEqual({
      ok: true,
      sender: { details: { notes: 'kept', inventory: expected.senderInventory } },
      receiver: { details: { abilityScores: { STR: testCase.receiverStr }, inventory: expected.receiverInventory } },
    })
  })

  it.each([undefined, null, 'bad', { details: 'bad' }, { details: { inventory: 'bad' } }])('reads stored character %j as having no details', (stored) => {
    const offer = { itemId: 'rope', itemSnapshot: { id: 'rope', kind: 'general', equipped: false } }
    const sender = { details: { inventory: [offer.itemSnapshot] } }

    expect(oseCarrying.acceptOseTransfer(sender, stored, offer)).toMatchObject({ ok: true, receiver: { details: { inventory: [offer.itemSnapshot] } } })
    expect(oseCarrying.acceptOseTransfer(stored, sender, offer)).toEqual({ ok: false, reason: 'missing_item' })
  })
})
