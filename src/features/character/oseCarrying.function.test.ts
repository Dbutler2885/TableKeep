import { describe, expect, it } from 'vitest'
import * as serverCarrying from '../../../functions/src/oseCarrying'
import type { InventoryItem as ServerInventoryItem } from '../../../functions/src/oseCarrying'
// The compiled output is tracked and is what gets deployed, so it runs the same
// cases as its source.
import * as compiledServerCarrying from '../../../functions/lib/oseCarrying.js'
import type { CharacterInventoryItem } from '../../types/app'
import { applyAcceptedTransfer as appApplyAcceptedTransfer } from '../transfers/transferResolution'
import { computeAvailablePackedSlots, computeOverflow } from './inventoryOverflow'
import { capacityCases, spillCases, transferCases, type TransferCase } from './oseCarryingCases'

// Every app caller reads STR off the stored details this way before asking for
// capacity (grants, the Items tab, approvals and the transfer screens).
const appPackedSlots = (details: unknown) => {
  const abilityScores = (details as { abilityScores?: { STR?: string } } | undefined)?.abilityScores
  return computeAvailablePackedSlots(Number.parseInt(abilityScores?.STR ?? '', 10))
}

const appCopy = {
  packedSlots: appPackedSlots,
  transfer: (testCase: TransferCase) => appApplyAcceptedTransfer({
    senderInventory: testCase.senderInventory,
    receiverInventory: testCase.receiverInventory,
    transfer: testCase.transfer,
    packedAllowed: appPackedSlots({ abilityScores: { STR: testCase.receiverStr } }),
  }),
}

const serverCopyOf = (carrying: typeof serverCarrying) => ({
  packedSlots: carrying.availablePackedSlots,
  transfer: (testCase: TransferCase) => carrying.applyAcceptedTransfer(
    testCase.senderInventory as ServerInventoryItem[],
    testCase.receiverInventory as ServerInventoryItem[],
    testCase.transfer as { itemId: string; itemSnapshot: ServerInventoryItem },
    carrying.availablePackedSlots({ abilityScores: { STR: testCase.receiverStr } }),
  ),
})

const copies = [
  ['app', appCopy],
  ['server', serverCopyOf(serverCarrying)],
  ['compiled server', serverCopyOf(compiledServerCarrying)],
] as const

describe.each(copies)('OSE capacity, %s copy', (_label, copy) => {
  it.each(capacityCases)('$name', ({ details, packedSlots }) => {
    expect(copy.packedSlots(details)).toBe(packedSlots)
  })
})

describe.each(copies)('OSE transfer in, %s copy', (_label, copy) => {
  it.each(transferCases)('$name', (testCase) => {
    expect(copy.transfer(testCase)).toEqual(testCase.expected)
  })
})

const keptLabel = (item: CharacterInventoryItem) => (item.kind === 'gold' ? `gold:${item.qty}` : item.id)

describe('OSE add and grant spill, app copy', () => {
  it.each(spillCases)('$operation: $name', ({ str, candidateInventory, expected }) => {
    const result = computeOverflow(
      candidateInventory,
      appPackedSlots({ abilityScores: { STR: str } }),
      'character-1',
      'Mirelda Crow',
    )

    expect({
      keptInventory: result.keptInventory.map(keptLabel),
      droppedItemNames: result.droppedItems.map((item) => item.name),
      droppedGoldAmount: result.droppedGoldAmount,
      feedbackMessage: result.feedbackMessage,
    }).toEqual(expected)
    for (const dropped of result.droppedItems) {
      expect(dropped).toMatchObject({
        status: 'dropped',
        droppedByCharacterId: 'character-1',
        droppedByCharacterName: 'Mirelda Crow',
      })
    }
  })
})
