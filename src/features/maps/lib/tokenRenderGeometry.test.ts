import { describe, expect, it } from 'vitest'
import {
  renderTokenDimensions,
  renderTokenSize,
  renderTokenViewDistance,
  tokenViewDistanceSliderValue,
  type TokenRenderGeometryInput,
} from './tokenRenderGeometry'

const token = (updates: Partial<TokenRenderGeometryInput> = {}): TokenRenderGeometryInput => ({
  size: 90,
  sizeScale: null,
  tokenImageWidth: 0,
  tokenImageHeight: 0,
  viewDistance: null,
  viewDistanceScale: null,
  ...updates,
})

describe('token render geometry', () => {
  it('uses sizeScale when present and falls back to size divided by the reference dimension', () => {
    expect(renderTokenSize(token({ sizeScale: 0.2 }), 1000)).toBe(200)
    expect(renderTokenSize(token({ size: 180 }), 1000)).toBe(200)
  })

  it('clamps rendered size to the exact floor and ceiling', () => {
    expect(renderTokenSize(token({ sizeScale: 0 }), 1000)).toBe(10)
    expect(renderTokenSize(token({ sizeScale: 20 }), 1000)).toBe(8000)
  })

  it('falls back to square dimensions when either image dimension is non-positive', () => {
    expect(renderTokenDimensions(token({ tokenImageWidth: 0, tokenImageHeight: 50 }), 900)).toEqual({ width: 90, height: 90, baseSize: 90 })
    expect(renderTokenDimensions(token({ tokenImageWidth: 50, tokenImageHeight: -1 }), 900)).toEqual({ width: 90, height: 90, baseSize: 90 })
  })

  it('preserves landscape, portrait, and exactly-square aspect ratios', () => {
    expect(renderTokenDimensions(token({ tokenImageWidth: 200, tokenImageHeight: 100 }), 900)).toEqual({ width: 90, height: 45, baseSize: 90 })
    expect(renderTokenDimensions(token({ tokenImageWidth: 100, tokenImageHeight: 200 }), 900)).toEqual({ width: 45, height: 90, baseSize: 90 })
    expect(renderTokenDimensions(token({ tokenImageWidth: 100, tokenImageHeight: 100 }), 900)).toEqual({ width: 90, height: 90, baseSize: 90 })
  })

  it('floors the derived image dimension at eight pixels', () => {
    expect(renderTokenDimensions(token({ sizeScale: 0.01, tokenImageWidth: 1000, tokenImageHeight: 1 }), 1000).height).toBe(8)
    expect(renderTokenDimensions(token({ sizeScale: 0.01, tokenImageWidth: 1, tokenImageHeight: 1000 }), 1000).width).toBe(8)
  })

  it('uses the fallback view scale and clamps view distance at both limits', () => {
    expect(renderTokenViewDistance(token(), 900)).toBe(120)
    expect(renderTokenViewDistance(token({ viewDistanceScale: 0 }), 900)).toBe(8)
    expect(renderTokenViewDistance(token({ viewDistanceScale: 2 }), 900)).toBe(600)
  })

  it('honours present, absent, and explicitly zero slider values', () => {
    expect(tokenViewDistanceSliderValue(token({ viewDistance: 42 }))).toBe(42)
    expect(tokenViewDistanceSliderValue(token({ viewDistance: null }))).toBe(120)
    expect(tokenViewDistanceSliderValue(token({ viewDistance: 0 }))).toBe(0)
  })
})
