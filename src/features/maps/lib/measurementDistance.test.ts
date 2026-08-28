import { describe, expect, it } from 'vitest'
import { measurementDistanceFeet, measurementDistanceLabel } from './measurementDistance'

const distance = (updates: Partial<Parameters<typeof measurementDistanceFeet>[0]> = {}) => measurementDistanceFeet({
  line: { start: { x: 0, y: 0 }, end: { x: 0.1, y: 0 } },
  effectiveGridCellScale: 0.1,
  activeMapDimension: 1000,
  activeMapWidth: 1000,
  activeMapHeight: 1000,
  ...updates,
})

describe('measurement distance', () => {
  it('handles zero length and exactly one grid cell', () => {
    expect(distance({ line: { start: { x: 0.5, y: 0.5 }, end: { x: 0.5, y: 0.5 } } })).toBe(0)
    expect(distance()).toBe(10)
  })

  it('floors the cell size at one pixel', () => {
    expect(distance({ effectiveGridCellScale: 0, line: { start: { x: 0, y: 0 }, end: { x: 0.001, y: 0 } } })).toBe(10)
  })

  it('returns null for non-finite input', () => {
    expect(distance({ activeMapWidth: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('formats null, integer, fractional, and integer-rounded labels', () => {
    expect(measurementDistanceLabel(null)).toBe('--')
    expect(measurementDistanceLabel(12)).toBe("12'")
    expect(measurementDistanceLabel(12.5)).toBe("12.5'")
    expect(measurementDistanceLabel(12.04)).toBe("12'")
  })
})
