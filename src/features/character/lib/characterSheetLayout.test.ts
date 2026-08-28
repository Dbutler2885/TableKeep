import { describe, expect, it } from 'vitest'
import { defaultTokenIcon, equippedRowCount, packedMovementBands, packedRowCount, packedSlotLabels, packedSlotThresholds } from './characterSheetLayout'

describe('character sheet layout', () => {
  it('preserves packed slot and movement geometry', () => {
    expect(packedSlotThresholds).toEqual([18, 16, 13, 9, 6, 4])
    expect(packedSlotLabels).toHaveLength(6)
    expect(equippedRowCount).toBe(9)
    expect(packedMovementBands.map((band) => band.slotCount)).toEqual([7, 2, 2, 2])
    expect(packedRowCount).toBe(19)
    expect(defaultTokenIcon).toEqual({ icon: 'pawn', color: '#bf2f2a', size: 34 })
  })
})
