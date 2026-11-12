import { describe, expect, it } from 'vitest'
import {
  cleanLubecClockFields, cleanLubecClockSharing, emptyLubecClockFields, hiddenLubecClockSharing, lubecClockAudience, lubecClockFieldsOf, lubecClockSharingOf,
  lubecClockChanges, lubecClockChangeText, lubecClockViewerUids, mergeLubecClockChange, sharedLubecClockSharing, type LubecClockCharacter, lubecClockState, lubecFilledWithin,
  lubecPiePaths, lubecPiecesLabel, parseLubecClock, sortLubecClocks, type LubecClock,
} from './lubecClock'

const clock = (over: Partial<LubecClock> = {}): LubecClock => ({
  id: 'c1', name: 'Sheriff', description: '', pieces: 6, filled: [], started: false, visibility: 'hidden', characterIds: [], viewerUids: [],
  increase: '', decrease: '', whenFull: '', whenEmpty: '', createdAtMs: 0, ...over,
})

const stamp = (ms: number) => ({ toMillis: () => ms })

describe('parseLubecClock', () => {
  it('reads a stored clock', () => {
    expect(parseLubecClock({
      name: 'Sheriff', description: 'He is watching.', pieces: 6, filled: [4, 1], started: true,
      increase: 'Seen sneaking', decrease: 'Lie low', whenFull: 'He comes', whenEmpty: 'He forgets', createdAt: stamp(5),
      visibility: 'some', characterIds: ['wayne', 7], viewerUids: ['alice'],
    }, 'c1')).toEqual(clock({
      description: 'He is watching.', filled: [1, 4], started: true, increase: 'Seen sneaking', decrease: 'Lie low', whenFull: 'He comes', whenEmpty: 'He forgets', createdAtMs: 5,
      visibility: 'some', characterIds: ['wayne'], viewerUids: ['alice'],
    }))
  })

  it('keeps a damaged clock usable', () => {
    expect(parseLubecClock({ pieces: 40, filled: 3, name: 7, createdAt: 'yesterday' }, 'c2')).toEqual(clock({ id: 'c2', name: 'Unnamed clock', pieces: 10, filled: [] }))
    expect(parseLubecClock({ name: 'X', pieces: 3, filled: [2, 2, 7, -1, 0.5, '1', 0] }, 'c3')).toMatchObject({ pieces: 3, filled: [0, 2], started: true })
    expect(parseLubecClock({ name: 'X', pieces: Number.NaN }, 'c4')).toMatchObject({ pieces: 1 })
    expect(parseLubecClock({ name: 'X', createdAt: { toMillis: () => 'soon' } }, 'c5')).toMatchObject({ createdAtMs: 0 })
    expect(parseLubecClock({ name: 'X', visibility: 'everyone', viewerUids: 'alice' }, 'c6')).toMatchObject({ visibility: 'hidden', viewerUids: [] })
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

describe('lubecFilledWithin', () => {
  it('keeps only the pieces that fit when the clock shrinks, in order and once each', () => {
    expect(lubecFilledWithin([5, 0, 2], 3)).toEqual([0, 2])
    expect(lubecFilledWithin([7, 1, 1], 8)).toEqual([1, 7])
  })
})

describe('lubecClockState', () => {
  it('is full when every piece is filled', () => {
    expect(lubecClockState({ filled: [0, 1, 2, 3], pieces: 4, started: true })).toBe('full')
  })

  it('counts pieces filled in any order', () => {
    expect(lubecClockState({ filled: [3], pieces: 4, started: true })).toBe('running')
    expect(lubecClockState({ filled: [2, 0, 1], pieces: 3, started: true })).toBe('full')
  })

  it('is empty only once a filled clock has drained', () => {
    expect(lubecClockState({ filled: [], pieces: 4, started: false })).toBe('running')
    expect(lubecClockState({ filled: [], pieces: 4, started: true })).toBe('empty')
    expect(lubecClockState({ filled: [1, 3], pieces: 4, started: true })).toBe('running')
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
    expect(lubecClockFieldsOf(clock({ filled: [0, 2, 5], whenFull: 'He comes' }))).toEqual({ ...emptyLubecClockFields(), name: 'Sheriff', pieces: 6, whenFull: 'He comes' })
  })
})

const characters: LubecClockCharacter[] = [
  { id: 'wayne', name: 'Wayne Gardner', ownerUserId: 'alice', ownerUsername: 'alice77' },
  { id: 'tommy', name: 'Tommy Eves', ownerUserId: 'bob', ownerUsername: '' },
  { id: 'dot', name: 'Dot Eves', ownerUserId: 'bob', ownerUsername: '' },
]

describe('who sees a clock', () => {
  it('starts a GM\'s clock hidden and a player\'s shown to everyone', () => {
    expect(hiddenLubecClockSharing()).toEqual({ visibility: 'hidden', characterIds: [], viewerUids: [] })
    expect(sharedLubecClockSharing()).toEqual({ visibility: 'all', characterIds: [], viewerUids: [] })
    expect(lubecClockSharingOf(clock({ visibility: 'all', name: 'X' }))).toEqual(sharedLubecClockSharing())
  })

  it('shows a clock to the owners of the chosen characters, once each', () => {
    expect(lubecClockViewerUids(['tommy', 'dot', 'wayne', 'gone'], characters)).toEqual(['alice', 'bob'])
  })

  it('captures the viewers only for chosen players, and needs at least one', () => {
    expect(cleanLubecClockSharing({ visibility: 'some', characterIds: ['tommy'], viewerUids: [] }, characters))
      .toEqual({ ok: true, sharing: { visibility: 'some', characterIds: ['tommy'], viewerUids: ['bob'] } })
    expect(cleanLubecClockSharing({ visibility: 'all', characterIds: ['tommy'], viewerUids: ['bob'] }, characters))
      .toEqual({ ok: true, sharing: { visibility: 'all', characterIds: ['tommy'], viewerUids: [] } })
    expect(cleanLubecClockSharing({ visibility: 'some', characterIds: [], viewerUids: [] }, characters))
      .toEqual({ ok: false, error: 'Choose at least one player to show it to.' })
  })

  it('says who sees a clock, for the GM', () => {
    expect(lubecClockAudience(hiddenLubecClockSharing(), characters)).toBe('Hidden')
    expect(lubecClockAudience(sharedLubecClockSharing(), characters)).toBe('Everyone')
    expect(lubecClockAudience({ visibility: 'some', characterIds: ['wayne', 'tommy'], viewerUids: [] }, characters)).toBe('Wayne Gardner, Tommy Eves')
    expect(lubecClockAudience({ visibility: 'some', characterIds: ['gone'], viewerUids: [] }, characters)).toBe('Chosen players')
  })
})

describe('the changes to announce', () => {
  const seen = new Map([['c1', [0]], ['c2', [1, 2]]])

  it('announces nothing on the first read', () => {
    expect(lubecClockChanges(null, [{ clock: clock({ filled: [0, 1] }), local: false }])).toEqual([])
  })

  it('announces pieces someone else filled or emptied, in any order', () => {
    expect(lubecClockChanges(seen, [
      { clock: clock({ id: 'c1', filled: [0, 3] }), local: false },
      { clock: clock({ id: 'c2', filled: [2] }), local: false },
    ])).toEqual([
      { clock: clock({ id: 'c1', filled: [0, 3] }), before: [0], added: [3], removed: [] },
      { clock: clock({ id: 'c2', filled: [2] }), before: [1, 2], added: [], removed: [1] },
    ])
  })

  it('announces neither this browser\'s own change, an unchanged clock, nor one that just came into view', () => {
    expect(lubecClockChanges(seen, [
      { clock: clock({ id: 'c1', filled: [0, 3] }), local: true },
      { clock: clock({ id: 'c2', filled: [1, 2] }), local: false },
      { clock: clock({ id: 'new', filled: [0] }), local: false },
    ])).toEqual([])
  })

  it('folds a later change into one waiting, measured from what the table last saw', () => {
    const waiting = { clock: clock({ filled: [0, 3] }), before: [0], added: [3], removed: [] }
    const later = { clock: clock({ filled: [3, 4] }), before: [0, 3], added: [4], removed: [0] }
    expect(mergeLubecClockChange(waiting, later)).toEqual({ clock: clock({ filled: [3, 4] }), before: [0], added: [3, 4], removed: [0] })
  })

  it('says which pieces changed', () => {
    expect(lubecClockChangeText({ added: [2], removed: [] })).toBe('Piece 3 filled')
    expect(lubecClockChangeText({ added: [], removed: [4, 0] })).toBe('Pieces 1 and 5 emptied')
    expect(lubecClockChangeText({ added: [0, 1, 5], removed: [3] })).toBe('Pieces 1, 2 and 6 filled; Piece 4 emptied')
  })
})
