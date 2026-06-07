import { describe, expect, it } from 'vitest'
import type { CharacterAmmunitionItem, CharacterInventoryItem, PendingTransfer } from '../../types/app'
import { applyAcceptedTransfer } from './transferResolution'

const makeStackableAmmo = (overrides: Partial<CharacterAmmunitionItem> = {}): CharacterAmmunitionItem => ({
  id: 'arrows-1',
  kind: 'ammunition',
  typeId: 'ammo-arrows',
  typeName: 'Arrows',
  name: 'Arrows',
  costGp: 0,
  equipped: false,
  notes: '',
  qty: 10,
  stack: { stackable: true, maxStack: 20 },
  ...overrides,
})

describe('applyAcceptedTransfer', () => {
  it('moves only the offered quantity and leaves the sender remainder in place', () => {
    const senderInventory: CharacterInventoryItem[] = [makeStackableAmmo()]
    const receiverInventory: CharacterInventoryItem[] = []
    const transfer: Pick<PendingTransfer, 'itemId' | 'itemSnapshot'> = {
      itemId: 'arrows-1',
      itemSnapshot: makeStackableAmmo({ id: 'split-offer-1', qty: 4 }),
    }

    const result = applyAcceptedTransfer({
      senderInventory,
      receiverInventory,
      transfer,
      packedAllowed: 20,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.senderInventory).toHaveLength(1)
    expect(result.senderInventory[0].id).toBe('arrows-1')
    expect(result.senderInventory[0].qty).toBe(6)
    expect(result.receiverInventory).toHaveLength(1)
    expect(result.receiverInventory[0].id).toBe('split-offer-1')
    expect(result.receiverInventory[0].qty).toBe(4)
    expect(result.receiverInventory[0].equipped).toBe(false)
  })

  it('removes the sender item entirely when the full stack is accepted', () => {
    const senderInventory: CharacterInventoryItem[] = [makeStackableAmmo({ qty: 4 })]
    const transfer: Pick<PendingTransfer, 'itemId' | 'itemSnapshot'> = {
      itemId: 'arrows-1',
      itemSnapshot: makeStackableAmmo({ qty: 4 }),
    }

    const result = applyAcceptedTransfer({
      senderInventory,
      receiverInventory: [],
      transfer,
      packedAllowed: 20,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.senderInventory).toEqual([])
    expect(result.receiverInventory).toHaveLength(1)
  })

  it('rejects the transfer when the sender quantity changed before acceptance', () => {
    const senderInventory: CharacterInventoryItem[] = [makeStackableAmmo({ qty: 2 })]
    const transfer: Pick<PendingTransfer, 'itemId' | 'itemSnapshot'> = {
      itemId: 'arrows-1',
      itemSnapshot: makeStackableAmmo({ id: 'split-offer-1', qty: 4 }),
    }

    const result = applyAcceptedTransfer({
      senderInventory,
      receiverInventory: [],
      transfer,
      packedAllowed: 20,
    })

    expect(result).toEqual({ ok: false, reason: 'qty_changed' })
  })
})
