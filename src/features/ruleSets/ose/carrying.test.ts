import { describe, expect, it } from 'vitest'
import type { CharacterInventoryItem } from '../../../types/app'
import { OVERFLOW_FEEDBACK_MESSAGE, transferCases } from '../../character/oseCarryingCases'
import { carriedAfter } from '../carrying'
import { oseCarrying, PACKED_SLOTS_MESSAGE } from './carrying'
import { packedSlotsUnlocked } from './packedSlots'

const item = (id: string, equipped = false) => ({ id, kind: 'general', name: id, equipped, qty: 1 }) as CharacterInventoryItem
const packed = (count: number) => Array.from({ length: count }, (_, index) => item(`p${index + 1}`))
const character = (str: string) => ({ id: 'pc', name: 'Mirelda Crow', details: { abilityScores: { STR: str } } })

describe('OSE carrying decision', () => {
  it.each(['add', 'grant', 'transfer'] as const)('%s: packs at capacity fit, equipped items not counting', (operation) => {
    const inventory = [...packed(13), item('e1', true), item('e2', true)]
    expect(oseCarrying.decide(character('3'), operation, inventory)).toEqual({ outcome: 'fits' })
  })

  it('a transfer past capacity is refused with the packed-slots reason, and nothing spills', () => {
    expect(oseCarrying.decide(character('3'), 'transfer', packed(14))).toEqual({
      outcome: 'refused',
      reason: 'packed_slots',
      message: PACKED_SLOTS_MESSAGE,
    })
  })

  it.each(['add', 'grant'] as const)('%s past capacity spills the newest item to Dropped Items', (operation) => {
    const decision = oseCarrying.decide(character('4'), operation, packed(15))
    expect(decision).toMatchObject({
      outcome: 'overflow',
      keptInventory: packed(14),
      droppedGoldAmount: 0,
      feedbackMessage: OVERFLOW_FEEDBACK_MESSAGE,
    })
    expect(decision.outcome === 'overflow' && decision.droppedItems.map((dropped) => [dropped.name, dropped.status]))
      .toEqual([['p15', 'dropped']])
  })

  // The sender checks run first; where they pass, the receiver's capacity
  // decides, as the transfer callable's does.
  it.each(transferCases.filter(({ expected }) => expected.ok || expected.reason === 'packed_slots'))(
    'transfer in, $name',
    ({ receiverStr, receiverInventory, transfer, expected }) => {
      const arriving = [...receiverInventory, { ...transfer.itemSnapshot!, equipped: false }]
      expect(oseCarrying.decide(character(receiverStr), 'transfer', arriving).outcome).toBe(expected.ok ? 'fits' : 'refused')
    },
  )

  it('reads capacity from stored details, with no details giving the movement slots only', () => {
    expect(oseCarrying.packedSlots(undefined)).toBe(13)
    expect(oseCarrying.packedSlots(character('16').details)).toBe(18)
  })

  it('opens the STR rows the character meets and every movement row', () => {
    expect(packedSlotsUnlocked(13)).toEqual([false, false, true, true, true, true, ...Array<boolean>(13).fill(true)])
    expect(packedSlotsUnlocked(Number.NaN).filter(Boolean)).toHaveLength(13)
  })
})

describe('what a caller stores after a decision', () => {
  const inventory = packed(2)

  it('keeps the whole inventory when it fits', () => {
    expect(carriedAfter({ outcome: 'fits' }, inventory)).toEqual({
      keptInventory: inventory,
      droppedItems: [],
      droppedGoldAmount: 0,
      feedbackMessage: null,
    })
  })

  it('keeps the kept part of a spill', () => {
    const spill = { keptInventory: [inventory[0]], droppedItems: [], droppedGoldAmount: 40, feedbackMessage: 'Spilled.' }
    expect(carriedAfter({ outcome: 'overflow', ...spill }, inventory)).toEqual(spill)
  })

  it('throws the message of a refusal', () => {
    expect(() => carriedAfter({ outcome: 'refused', reason: 'packed_slots', message: PACKED_SLOTS_MESSAGE }, inventory))
      .toThrow(PACKED_SLOTS_MESSAGE)
  })
})
