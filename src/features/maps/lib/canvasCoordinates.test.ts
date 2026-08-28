import { describe, expect, it } from 'vitest'
import { clientPointToNormalizedPoint, tokenPointToCanvasPoint, type RectLike } from './canvasCoordinates'

const rect = (updates: Partial<RectLike> = {}): RectLike => ({ left: 10, top: 20, width: 100, height: 200, ...updates })

describe('canvas coordinates', () => {
  it('falls back from unusable canvas metrics to the layer and otherwise returns null', () => {
    expect(clientPointToNormalizedPoint({ clientX: 60, clientY: 120 }, { rect: rect({ width: 0 }), width: 100, height: 200 }, rect())).toEqual({ x: 0.5, y: 0.5 })
    expect(clientPointToNormalizedPoint({ clientX: 60, clientY: 120 }, { rect: rect({ height: 0 }), width: 100, height: 200 }, null)).toBeNull()
    expect(clientPointToNormalizedPoint({ clientX: 60, clientY: 120 }, { rect: rect(), width: 0, height: 200 }, null)).toBeNull()
    expect(clientPointToNormalizedPoint({ clientX: 60, clientY: 120 }, { rect: rect(), width: 100, height: 0 }, null)).toBeNull()
  })

  it('clamps points outside all four sides and maps exact corners', () => {
    const canvas = { rect: rect(), width: 400, height: 800 }
    expect(clientPointToNormalizedPoint({ clientX: 0, clientY: 120 }, canvas, null)).toEqual({ x: 0, y: 0.5 })
    expect(clientPointToNormalizedPoint({ clientX: 120, clientY: 120 }, canvas, null)).toEqual({ x: 1, y: 0.5 })
    expect(clientPointToNormalizedPoint({ clientX: 60, clientY: 0 }, canvas, null)).toEqual({ x: 0.5, y: 0 })
    expect(clientPointToNormalizedPoint({ clientX: 60, clientY: 230 }, canvas, null)).toEqual({ x: 0.5, y: 1 })
    expect(clientPointToNormalizedPoint({ clientX: 10, clientY: 20 }, canvas, null)).toEqual({ x: 0, y: 0 })
    expect(clientPointToNormalizedPoint({ clientX: 110, clientY: 220 }, canvas, null)).toEqual({ x: 1, y: 1 })
  })

  it('handles non-unit intrinsic canvas scale without changing normalized output', () => {
    expect(clientPointToNormalizedPoint({ clientX: 35, clientY: 70 }, { rect: rect(), width: 1000, height: 500 }, null)).toEqual({ x: 0.25, y: 0.25 })
  })

  it('converts token points with zero size and floors a large vertical offset', () => {
    expect(tokenPointToCanvasPoint({ point: { x: 0.25, y: 0.5 }, canvasWidth: 400, canvasHeight: 200, activeMapDimension: 1000 })).toEqual({ x: 100, y: 100 })
    expect(tokenPointToCanvasPoint({ point: { x: 0.25, y: 0.1 }, tokenSizePx: 1000, canvasWidth: 400, canvasHeight: 200, activeMapDimension: 1000 })).toEqual({ x: 100, y: 0 })
  })
})
