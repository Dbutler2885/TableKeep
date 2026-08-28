import { describe, expect, it } from 'vitest'
import { isGridAdjustDirty } from './gridAdjustDirty'
import type { GridAdjustDraft, MapRecord } from './types'

const saved: Pick<MapRecord, 'gridEnabled' | 'gridVisible' | 'gridCellScale' | 'gridOffsetX' | 'gridOffsetY' | 'gridType'> = {
  gridEnabled: true,
  gridVisible: true,
  gridCellScale: 0.05,
  gridOffsetX: 0.1,
  gridOffsetY: 0.2,
  gridType: 'square',
}
const draft = (updates: Partial<GridAdjustDraft> = {}): GridAdjustDraft => ({ ...saved, ...updates })

describe('grid adjustment dirty check', () => {
  it('is false for null inputs and identical settings', () => {
    expect(isGridAdjustDirty(null, draft())).toBe(false)
    expect(isGridAdjustDirty(saved, null)).toBe(false)
    expect(isGridAdjustDirty(saved, draft())).toBe(false)
  })

  it.each(['gridCellScale', 'gridOffsetX', 'gridOffsetY'] as const)('uses the exact tolerance for %s', (field) => {
    const zeroed = { ...saved, [field]: 0 }
    expect(isGridAdjustDirty(zeroed, { ...draft(), [field]: 0.000001 })).toBe(false)
    expect(isGridAdjustDirty(zeroed, { ...draft(), [field]: 0.0000011 })).toBe(true)
  })

  it('detects every discrete setting change', () => {
    expect(isGridAdjustDirty(saved, draft({ gridEnabled: false }))).toBe(true)
    expect(isGridAdjustDirty(saved, draft({ gridVisible: false }))).toBe(true)
    expect(isGridAdjustDirty(saved, draft({ gridType: 'hex-pointy' }))).toBe(true)
  })
})
