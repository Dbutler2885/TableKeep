import { describe, expect, it } from 'vitest'
import { packedSlotsUnlocked } from '../../ruleSets/ose/packedSlots'
import { defaultTokenIcon, equippedRowCount, packedMovementBands, packedRowCount, packedSlotLabels } from './characterSheetLayout'

describe('character sheet layout', () => {
  it('preserves packed slot and movement geometry', () => {
    expect(packedSlotLabels).toEqual(['STR 18+', 'STR 16+', 'STR 13+', 'STR 9+', 'STR 6+', 'STR 4+'])
    expect(equippedRowCount).toBe(9)
    expect(packedMovementBands.map((band) => band.slotCount)).toEqual([7, 2, 2, 2])
    expect(packedRowCount).toBe(19)
    expect(defaultTokenIcon).toEqual({ icon: 'pawn', color: '#bf2f2a', size: 34 })
  })

  it('has a row for every packed slot OSE carrying can open', () => {
    expect(packedSlotsUnlocked(18)).toHaveLength(packedRowCount)
  })
})
