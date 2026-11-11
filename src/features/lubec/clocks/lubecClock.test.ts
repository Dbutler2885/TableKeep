import { describe, expect, it } from 'vitest'
import {
  cleanLubecClockFields, emptyLubecClockFields, lubecClockFieldsOf, lubecClockState, lubecFillAfterPress, lubecFillForPieces,
  lubecPiePaths, lubecPiecesLabel, parseLubecClock, sortLubecClocks, type LubecClock,
} from './lubecClock'

const clock = (over: Partial<LubecClock> = {}): LubecClock => ({
  id: 'c1', name: 'Sheriff', description: '', pieces: 6, filled: 0, started: false,
  increase: '', decrease: '', whenFull: '', whenEmpty: '', createdAtMs: 0, ...over,
})

const stamp = (ms: number) => ({ toMillis: () => ms })

describe('parseLubecClock', () => {
  it('reads a stored clock', () => {
    expect(parseLubecClock({
      name: 'Sheriff', description: 'He is watching.', pieces: 6, filled: 2, started: true,
      increase: 'Seen sneaking', decrease: 'Lie low', whenFull: 'He comes', whenEmpty: 'He forgets', createdAt: stamp(5),
    }, 'c1')).toEqual(clock({
      description: 'He is watching.', filled: 2, started: true, increase: 'Seen sneaking', decrease: 'Lie low', whenFull: 'He comes', whenEmpty: 'He forgets', createdAtMs: 5,
    }))
  })

  it('keeps a damaged clock usable', () => {
    expect(parseLubecClock({ pieces: 40, filled: -3, name: 7, createdAt: 'yesterday' }, 'c2')).toEqual(clock({ id: 'c2', name: 'Unnamed clock', pieces: 10, filled: 0 }))
    expect(parseLubecClock({ name: 'X', pieces: 3, filled: 9 }, 'c3')).toMatchObject({ pieces: 3, filled: 3, started: true })
    expect(parseLubecClock({ name: 'X', pieces: Number.NaN }, 'c4')).toMatchObject({ pieces: 1 })
    expect(parseLubecClock({ name: 'X', createdAt: { toMillis: () => 'soon' } }, 'c5')).toMatchObject({ createdAtMs: 0 })
  })
})

describe('sortLubecClocks', () => {
  it('puts the oldest first, then by id', () => {
    const sorted = sortLubecClocks([clock({ id: 'b', createdAtMs: 2 }), clock({ id: 'c', createdAtMs: 1 }), clock({ id: 'a', createdAtMs: 2 })])
    expect(sorted.map((c) => c.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('cleanLubecClockFields', () => {
  it('trims every field and keeps the pieces in range', () => {
    expect(cleanLubecClockFields({ ...emptyLubecClockFields(), name: '  Sheriff ', increase: ' Seen \n', pieces: 14 }))
      .toEqual({ ok: true, fields: { ...emptyLubecClockFields(), name: 'Sheriff', increase: 'Seen', pieces: 10 } })
  })

  it('refuses a clock with no name', () => {
    expect(cleanLubecClockFields({ ...emptyLubecClockFields(), name: '   ' })).toEqual({ ok: false, error: 'Give the clock a name.' })
  })

  it('refuses text past its limit', () => {
    expect(cleanLubecClockFields({ ...emptyLubecClockFields(), name: 'x'.repeat(101) })).toEqual({ ok: false, error: 'Keep the name to 100 characters.' })
    expect(cleanLubecClockFields({ ...emptyLubecClockFields(), name: 'x', whenFull: 'y'.repeat(501) })).toEqual({ ok: false, error: 'Keep each note to 500 characters.' })
  })
})

describe('filling', () => {
  it('fills up to a pressed piece, and a press on the last filled piece takes it back', () => {
    expect(lubecFillAfterPress(0, 3)).toBe(4)
    expect(lubecFillAfterPress(4, 1)).toBe(2)
    expect(lubecFillAfterPress(4, 3)).toBe(3)
    expect(lubecFillAfterPress(1, 0)).toBe(0)
  })

  it('keeps only the pieces that fit when the clock shrinks', () => {
    expect(lubecFillForPieces(5, 3)).toBe(3)
    expect(lubecFillForPieces(2, 8)).toBe(2)
  })
})

describe('lubecClockState', () => {
  it('is full when every piece is filled', () => {
    expect(lubecClockState({ filled: 4, pieces: 4, started: true })).toBe('full')
  })

  it('is empty only once a filled clock has drained', () => {
    expect(lubecClockState({ filled: 0, pieces: 4, started: false })).toBe('running')
    expect(lubecClockState({ filled: 0, pieces: 4, started: true })).toBe('empty')
    expect(lubecClockState({ filled: 2, pieces: 4, started: true })).toBe('running')
  })
})

describe('the pie', () => {
  it('draws one path per piece, starting at the top', () => {
    expect(lubecPiePaths(1)).toEqual(['M50 6 A44 44 0 1 1 50 94 A44 44 0 1 1 50 6 Z'])
    const four = lubecPiePaths(4)
    expect(four).toHaveLength(4)
    expect(four[0]).toBe('M50 50 L50 6 A44 44 0 0 1 94 50 Z')
  })

  it('names the pieces', () => {
    expect(lubecPiecesLabel(1)).toBe('1 piece')
    expect(lubecPiecesLabel(6)).toBe('6 pieces')
  })

  it('gives the form a clock\'s own fields', () => {
    expect(lubecClockFieldsOf(clock({ filled: 3, whenFull: 'He comes' }))).toEqual({ ...emptyLubecClockFields(), name: 'Sheriff', pieces: 6, whenFull: 'He comes' })
  })
})
