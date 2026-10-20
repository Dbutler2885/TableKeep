import { describe, expect, it } from 'vitest'
import * as serverCarrying from '../../../functions/src/oseCarrying'
import type { InventoryItem as ServerInventoryItem } from '../../../functions/src/oseCarrying'
// The compiled output is tracked and is what gets deployed, so it runs the same
// cases as its source.
import * as compiledServerCarrying from '../../../functions/lib/oseCarrying.js'
import type { CharacterInventoryItem, PendingTransfer } from '../../types/app'
import { applyAcceptedTransfer as appApplyAcceptedTransfer } from '../transfers/transferResolution'
import { carriedAfter } from '../ruleSets/carrying'
import { oseCarrying, PACKED_SLOTS_MESSAGE } from '../ruleSets/ose/carrying'
import { capacityCases, spillCases, transferCases, type TransferCase } from './oseCarryingCases'

// Every app caller asks OSE's carrying rule for capacity from the stored
// details (grants, the Items tab, approvals and the transfer screens).
const appPackedSlots = (details: unknown) => oseCarrying.packedSlots(details)

const appCopy = {
  packedSlots: appPackedSlots,
  transfer: (testCase: TransferCase) => appApplyAcceptedTransfer({
    senderInventory: testCase.senderInventory,
    receiverInventory: testCase.receiverInventory,
    transfer: testCase.transfer as Pick<PendingTransfer, 'itemId' | 'itemSnapshot'>,
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

it.each([
  ['server', serverCarrying],
  ['compiled server', compiledServerCarrying],
] as const)('the %s copy refuses a transfer that does not fit with the app copy\'s words', (_label, carrying) => {
  expect(carrying.PACKED_SLOTS_MESSAGE).toBe(PACKED_SLOTS_MESSAGE)
})

const keptLabel = (item: CharacterInventoryItem) => (item.kind === 'gold' ? `gold:${item.qty}` : item.id)

describe('OSE add and grant spill, app copy', () => {
  it.each(spillCases)('$operation: $name', ({ operation, str, candidateInventory, expected }) => {
    const character = { id: 'character-1', name: 'Mirelda Crow', details: { abilityScores: { STR: str } } }
    const result = carriedAfter(oseCarrying.decide(character, operation, candidateInventory), candidateInventory)

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
