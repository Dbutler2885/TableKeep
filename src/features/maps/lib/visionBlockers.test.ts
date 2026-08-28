import { describe, expect, it } from 'vitest'
import { blockerKindAt, floodFillSurfaceRegion, isSurfaceBlocker, type BlockerKind } from './visionBlockers'

const colours: Array<readonly [number, number, number, number, BlockerKind]> = [
  [0, 0, 255, 0, 'none'],
  [0, 0, 255, 20, 'none'],
  [0, 0, 255, 21, 'full'],
  [100, 100, 119, 255, 'surface'],
  [100, 100, 120, 255, 'full'],
  [100, 111, 120, 255, 'surface'],
  [100, 110, 120, 255, 'full'],
  [50, 200, 100, 255, 'surface'],
  [200, 50, 100, 255, 'surface'],
  [0, 0, 0, 255, 'surface'],
  [255, 255, 255, 255, 'surface'],
  [0, 0, 255, 255, 'full'],
]

const colourBuffer = (values: ReadonlyArray<readonly [number, number, number, number]>) => {
  const data = new Uint8ClampedArray(values.flatMap((value) => [...value]))
  if (data.length !== values.length * 4) throw new Error('Invalid blocker fixture length.')
  return data
}

const grid = (rows: string[]) => {
  const width = rows[0]?.length ?? 0
  const data = new Uint8ClampedArray(width * rows.length * 4)
  rows.forEach((row, y) => [...row].forEach((cell, x) => {
    const index = (y * width + x) * 4
    const rgba = cell === 's' ? [0, 0, 0, 255] : cell === 'f' ? [0, 0, 255, 255] : [0, 0, 0, 0]
    data.set(rgba, index)
  }))
  return { data, width, height: rows.length }
}

const filledPoints = (mask: Uint8Array, width: number) => [...mask]
  .flatMap((value, flat) => value ? [`${flat % width},${Math.floor(flat / width)}`] : [])

describe('vision blocker classification', () => {
  it.each(colours)('classifies rgba(%i,%i,%i,%i) as %s', (r, g, b, a, expected) => {
    expect(blockerKindAt(colourBuffer([[r, g, b, a]]), 1, 1, 0, 0)).toBe(expected)
  })

  it('classifies every out-of-region side and corner as none without wrapping', () => {
    const data = colourBuffer([[0, 0, 255, 255], [0, 0, 255, 255], [0, 0, 255, 255], [0, 0, 255, 255]])
    for (const [x, y] of [[-1, 0], [2, 0], [0, -1], [0, 2], [-1, -1], [2, -1], [-1, 2], [2, 2]]) {
      expect(blockerKindAt(data, 2, 2, x, y)).toBe('none')
    }
    expect(blockerKindAt(data, 2, 2, -1, 1)).toBe('none')
  })

  it('keeps the classifier and surface predicate in agreement over the full fixture', () => {
    const data = colourBuffer(colours.map(([r, g, b, a]) => [r, g, b, a]))
    colours.forEach(([, , , , expected], x) => {
      const kind = blockerKindAt(data, colours.length, 1, x, 0)
      expect(kind).toBe(expected)
      expect(isSurfaceBlocker(data, colours.length, 1, x, 0)).toBe(kind === 'surface')
    })
  })
})

describe('8-connected surface flood fill', () => {
  it('fills a single pixel and an orthogonal run', () => {
    const single = grid(['s'])
    expect(filledPoints(floodFillSurfaceRegion({ ...single, seeds: [{ x: 0, y: 0 }] }), 1)).toEqual(['0,0'])
    const run = grid(['sss'])
    expect(filledPoints(floodFillSurfaceRegion({ ...run, seeds: [{ x: 0, y: 0 }] }), 3)).toEqual(['0,0', '1,0', '2,0'])
  })

  it('preserves diagonal-only connectivity', () => {
    const fixture = grid(['s..', '.s.', '..s'])
    expect(filledPoints(floodFillSurfaceRegion({ ...fixture, seeds: [{ x: 0, y: 0 }] }), 3)).toEqual(['0,0', '1,1', '2,2'])
  })

  it('stops at full blockers and ignores non-surface seeds', () => {
    const fixture = grid(['ssff'])
    expect(filledPoints(floodFillSurfaceRegion({ ...fixture, seeds: [{ x: 0, y: 0 }] }), 4)).toEqual(['0,0', '1,0'])
    expect(filledPoints(floodFillSurfaceRegion({ ...fixture, seeds: [{ x: 2, y: 0 }] }), 4)).toEqual([])
  })

  it('fills surface pixels touching every border without wrapping', () => {
    const fixture = grid(['sss', 's.s', 'sss'])
    expect(filledPoints(floodFillSurfaceRegion({ ...fixture, seeds: [{ x: 0, y: 0 }] }), 3)).toHaveLength(8)
  })

  it('fills multiple seeded components but nothing between them', () => {
    const fixture = grid(['ss..ss'])
    expect(filledPoints(floodFillSurfaceRegion({ ...fixture, seeds: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }), 6)).toEqual(['0,0', '1,0', '4,0', '5,0'])
  })

  it('handles empty and repeated seeds idempotently', () => {
    const fixture = grid(['sss'])
    expect(filledPoints(floodFillSurfaceRegion({ ...fixture, seeds: [] }), 3)).toEqual([])
    const once = floodFillSurfaceRegion({ ...fixture, seeds: [{ x: 1, y: 0 }] })
    const repeated = floodFillSurfaceRegion({ ...fixture, seeds: Array.from({ length: 20 }, () => ({ x: 1, y: 0 })) })
    expect(repeated).toEqual(once)
  })

  it('classifies every region pixel at most once', () => {
    const fixture = grid(['.....', '.sss.', '.s.s.', '.sss.', '.....'])
    const calls = new Map<string, number>()
    floodFillSurfaceRegion({
      ...fixture,
      seeds: [{ x: 2, y: 2 }, { x: 1, y: 1 }],
      isSurface: (x, y) => {
        const key = `${x},${y}`
        calls.set(key, (calls.get(key) ?? 0) + 1)
        return isSurfaceBlocker(fixture.data, fixture.width, fixture.height, x, y)
      },
    })
    expect(Math.max(...calls.values())).toBe(1)
    expect(calls.size).toBeLessThanOrEqual(fixture.width * fixture.height)
  })
})
