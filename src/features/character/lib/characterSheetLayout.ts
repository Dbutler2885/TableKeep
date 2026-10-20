import { packedStrengthSlotLabels } from '../../ruleSets/ose/packedSlots'

export const packedSlotLabels = packedStrengthSlotLabels
export const equippedRowCount = 9
export const packedStrengthSlotCount = packedSlotLabels.length
export const packedMovementBands = [
  { label: "120' (40')", slotCount: 7, baseMove: 120 },
  { label: "90' (30')", slotCount: 2, baseMove: 90 },
  { label: "60' (20')", slotCount: 2, baseMove: 60 },
  { label: "30' (10')", slotCount: 2, baseMove: 30 },
]
export const packedRowCount = packedStrengthSlotCount + packedMovementBands.reduce((sum, band) => sum + band.slotCount, 0)
export const defaultTokenIcon = { icon: 'pawn' as const, color: '#bf2f2a', size: 34 }
