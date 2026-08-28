import { describe, expect, it } from 'vitest'
import {
  marchRays,
  pixelBufferHasBlockers,
  rayCountForRadius,
  shouldProcessSurfaceReveal,
  visionBlockerCacheKey,
  visionSourceSignature,
  visitRevealStroke,
} from './visionRaycast'

const buffer = (width: number, height: number, pixel?: (x: number, y: number) => readonly number[]) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    data.set(pixel?.(x, y) ?? [0, 0, 0, 0], (y * width + x) * 4)
  }
  if (data.length !== width * height * 4) throw new Error('Invalid raycast fixture length.')
  return data
}

const run = ({
  data,
  width,
  height,
  originX,
  originY,
  radius,
  clip = { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 },
}: {
  data: Uint8ClampedArray
  width: number
  height: number
  originX: number
  originY: number
  radius: number
  clip?: { minX: number; minY: number; maxX: number; maxY: number }
}) => {
  const lit: Array<[number, number]> = []
  const surface: Array<[number, number]> = []
  marchRays({ data, width, height, originX, originY, radius, clip, onLit: (x, y) => lit.push([x, y]), onSurfaceHit: (x, y) => surface.push([x, y]) })
  return { lit, surface }
}

describe('vision ray march', () => {
  it('pins the ray-count formula and clamps', () => {
    expect(rayCountForRadius(1)).toBe(220)
    expect(rayCountForRadius(40)).toBe(220)
    expect(rayCountForRadius(100)).toBe(540)
    expect(rayCountForRadius(340)).toBe(1800)
    expect(rayCountForRadius(1000)).toBe(1800)
  })

  it('emits only points inside the radius and clip in an empty buffer', () => {
    const result = run({ data: buffer(21, 21), width: 21, height: 21, originX: 10, originY: 10, radius: 8 })
    expect(result.lit.length).toBeGreaterThan(0)
    result.lit.forEach(([x, y]) => {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(20)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(20)
      expect(Math.hypot(x - 10, y - 10)).toBeLessThanOrEqual(8.8)
    })
  })

  it('stops at a full-blocker ring without surface hits', () => {
    const data = buffer(31, 31, (x, y) => Math.hypot(x - 15, y - 15) >= 6 ? [0, 0, 255, 255] : [0, 0, 0, 0])
    const result = run({ data, width: 31, height: 31, originX: 15, originY: 15, radius: 12 })
    expect(result.surface).toEqual([])
    expect(result.lit.every(([x, y]) => Math.hypot(x - 15, y - 15) < 7)).toBe(true)
  })

  it('records first surface hits in ray order with duplicates preserved', () => {
    const data = buffer(31, 31, (x, y) => Math.hypot(x - 15, y - 15) >= 6 ? [0, 0, 0, 255] : [0, 0, 0, 0])
    const result = run({ data, width: 31, height: 31, originX: 15, originY: 15, radius: 12 })
    expect(result.surface.length).toBe(rayCountForRadius(12))
    expect(new Set(result.surface.map(([x, y]) => `${x},${y}`)).size).toBeLessThan(result.surface.length)
    expect(result.lit.every(([x, y]) => Math.hypot(x - 15, y - 15) < 7)).toBe(true)
  })

  it('lets a foreground full blocker suppress a surface blocker on that ray', () => {
    const data = buffer(20, 3, (x, y) => y === 1 && x === 5 ? [0, 0, 255, 255] : y === 1 && x === 8 ? [0, 0, 0, 255] : [0, 0, 0, 0])
    const result = run({ data, width: 20, height: 3, originX: 1, originY: 1, radius: 12 })
    expect(result.surface).not.toContainEqual([8, 1])
  })

  it('handles degenerate clips and centres outside a nearby clip', () => {
    const data = buffer(4, 4)
    expect(run({ data, width: 4, height: 4, originX: 1, originY: 1, radius: 2, clip: { minX: 3, minY: 0, maxX: 2, maxY: 3 } })).toEqual({ lit: [], surface: [] })
    const outside = run({ data, width: 4, height: 4, originX: -1, originY: 2, radius: 4 })
    expect(outside).toEqual({ lit: [], surface: [] })
  })

  it('is deterministic for identical inputs', () => {
    const args = { data: buffer(15, 15), width: 15, height: 15, originX: 7, originY: 7, radius: 6 }
    expect(run(args)).toEqual(run(args))
  })
})

describe('vision cache characterization', () => {
  const source = { id: 'map', visionBlockImagePath: 'path', visionBlockImageUrl: 'url', visionBlockDataUrl: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ' }

  it('pins signature join order, slice bounds, and dimensions', () => {
    expect(visionSourceSignature(source)).toBe(`map:path:url:${source.visionBlockDataUrl.length}:${source.visionBlockDataUrl.slice(0, 32)}:${source.visionBlockDataUrl.slice(-32)}`)
    expect(visionBlockerCacheKey(source, 12, 34)).toBe(`${visionSourceSignature(source)}:12x34`)
  })

  it('pins the current equal-length first-and-last-32 collision', () => {
    const prefix = 'p'.repeat(32)
    const suffix = 's'.repeat(32)
    const first = { ...source, visionBlockDataUrl: `${prefix}AAAA${suffix}` }
    const second = { ...source, visionBlockDataUrl: `${prefix}BBBB${suffix}` }
    expect(first.visionBlockDataUrl).not.toBe(second.visionBlockDataUrl)
    expect(visionSourceSignature(first)).toBe(visionSourceSignature(second))
  })

  it('uses alpha greater than 20 for whole-buffer blocker detection', () => {
    expect(pixelBufferHasBlockers(buffer(1, 1, () => [0, 0, 255, 20]))).toBe(false)
    expect(pixelBufferHasBlockers(buffer(1, 1, () => [0, 0, 255, 21]))).toBe(true)
  })
})

describe('surface reveal throttle', () => {
  it('requires a hit and permits the exact interval boundary', () => {
    expect(shouldProcessSurfaceReveal({ hitCount: 0, now: 1000, lastRevealAt: 0, intervalMs: 150 })).toBe(false)
    expect(shouldProcessSurfaceReveal({ hitCount: 1, now: 149, lastRevealAt: 0, intervalMs: 150 })).toBe(false)
    expect(shouldProcessSurfaceReveal({ hitCount: 1, now: 150, lastRevealAt: 0, intervalMs: 150 })).toBe(true)
  })
})

describe('reveal stroke interpolation', () => {
  const points = (from: { x: number; y: number }, to: { x: number; y: number }, brushSize: number, clipRect?: { minX: number; minY: number; maxX: number; maxY: number }) => {
    const visited: Array<{ x: number; y: number }> = []
    visitRevealStroke({ from, to, brushSize, clipRect, onPoint: (point) => visited.push(point) })
    return visited
  }

  it('visits zero-length and sub-step strokes exactly once at the destination', () => {
    expect(points({ x: 1, y: 1 }, { x: 1, y: 1 }, 10)).toEqual([{ x: 1, y: 1 }])
    expect(points({ x: 0, y: 0 }, { x: 1, y: 0 }, 10)).toEqual([{ x: 1, y: 0 }])
  })

  it('visits exactly two interpolated points at twice the step', () => {
    expect(points({ x: 0, y: 0 }, { x: 4, y: 0 }, 1)).toEqual([{ x: 2, y: 0 }, { x: 4, y: 0 }])
  })

  it('uses the two-pixel floor for brush size one and skips outside padded bounds', () => {
    expect(points({ x: 0, y: 0 }, { x: 5, y: 0 }, 1)).toHaveLength(3)
    expect(points({ x: 0, y: 0 }, { x: 1, y: 1 }, 10, { minX: 100, minY: 100, maxX: 120, maxY: 120 })).toEqual([])
  })
})
