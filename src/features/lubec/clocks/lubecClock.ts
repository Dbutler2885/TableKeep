// A Lubec clock: a named pie of 1 to 10 pieces that the table fills and empties
// by hand. It says in plain words what fills it and what empties it, and what
// happens when it is full and when it is empty. Pieces fill in order from the
// top, clockwise, so a clock's state is how many are filled.

export const LUBEC_CLOCK_MIN_PIECES = 1
export const LUBEC_CLOCK_MAX_PIECES = 10

/** The longest each text field may be; `firestore.rules`' `validLubecClock` holds the same limits. */
export const LUBEC_CLOCK_LIMITS = {
  name: 100,
  description: 1000,
  increase: 500,
  decrease: 500,
  whenFull: 500,
  whenEmpty: 500,
} as const

/** What the clock form edits: everything but how full the clock is. */
export type LubecClockFields = {
  name: string
  description: string
  pieces: number
  increase: string
  decrease: string
  whenFull: string
  whenEmpty: string
}

export type LubecClock = LubecClockFields & {
  id: string
  filled: number
  // Whether a piece has ever been filled. A new clock starts empty without
  // having become empty, so its empty result waits until it has been filled.
  started: boolean
  createdAtMs: number
}

export const LUBEC_CLOCK_TEXT_FIELDS = ['description', 'increase', 'decrease', 'whenFull', 'whenEmpty'] as const

export const emptyLubecClockFields = (): LubecClockFields => ({
  name: '',
  description: '',
  pieces: 4,
  increase: '',
  decrease: '',
  whenFull: '',
  whenEmpty: '',
})

export const lubecClockFieldsOf = (clock: LubecClock): LubecClockFields => ({
  name: clock.name,
  description: clock.description,
  pieces: clock.pieces,
  increase: clock.increase,
  decrease: clock.decrease,
  whenFull: clock.whenFull,
  whenEmpty: clock.whenEmpty,
})

const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value)))

const numberOr = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

const textOf = (value: unknown, limit: number) => (typeof value === 'string' ? value.slice(0, limit) : '')

const millisOf = (value: unknown): number => {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    const ms: unknown = value.toMillis()
    if (typeof ms === 'number') return ms
  }
  return 0
}

export const clampLubecClockPieces = (pieces: number) => clampInt(pieces, LUBEC_CLOCK_MIN_PIECES, LUBEC_CLOCK_MAX_PIECES)

/** Reads a stored clock, keeping a damaged one usable rather than dropping it. */
export function parseLubecClock(data: Record<string, unknown>, id: string): LubecClock {
  const pieces = clampLubecClockPieces(numberOr(data.pieces, LUBEC_CLOCK_MIN_PIECES))
  const filled = clampInt(numberOr(data.filled, 0), 0, pieces)
  return {
    id,
    name: textOf(data.name, LUBEC_CLOCK_LIMITS.name) || 'Unnamed clock',
    description: textOf(data.description, LUBEC_CLOCK_LIMITS.description),
    pieces,
    filled,
    started: data.started === true || filled > 0,
    increase: textOf(data.increase, LUBEC_CLOCK_LIMITS.increase),
    decrease: textOf(data.decrease, LUBEC_CLOCK_LIMITS.decrease),
    whenFull: textOf(data.whenFull, LUBEC_CLOCK_LIMITS.whenFull),
    whenEmpty: textOf(data.whenEmpty, LUBEC_CLOCK_LIMITS.whenEmpty),
    createdAtMs: millisOf(data.createdAt),
  }
}

/** Oldest first, so a new clock lands at the end and the others stay put. */
export const sortLubecClocks = (clocks: readonly LubecClock[]) =>
  [...clocks].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id))

/** The form's fields as they are saved: trimmed, within their limits, or the reason they cannot be. */
export function cleanLubecClockFields(fields: LubecClockFields): { ok: true; fields: LubecClockFields } | { ok: false; error: string } {
  const name = fields.name.trim()
  if (!name) return { ok: false, error: 'Give the clock a name.' }
  if (name.length > LUBEC_CLOCK_LIMITS.name) return { ok: false, error: `Keep the name to ${LUBEC_CLOCK_LIMITS.name} characters.` }
  const cleaned: LubecClockFields = { ...fields, name, pieces: clampLubecClockPieces(fields.pieces) }
  for (const key of LUBEC_CLOCK_TEXT_FIELDS) {
    const text = fields[key].trim()
    if (text.length > LUBEC_CLOCK_LIMITS[key]) return { ok: false, error: `Keep each note to ${LUBEC_CLOCK_LIMITS[key]} characters.` }
    cleaned[key] = text
  }
  return { ok: true, fields: cleaned }
}

/**
 * How full the clock is after a piece is pressed: up to and including that
 * piece, or, when it is the last filled piece, one fewer. So any level is one
 * press away, and pressing the edge again takes it back.
 */
export const lubecFillAfterPress = (filled: number, pieceIndex: number) => (pieceIndex + 1 === filled ? pieceIndex : pieceIndex + 1)

/** A clock whose piece count shrinks below its fill keeps only as many as fit. */
export const lubecFillForPieces = (filled: number, pieces: number) => Math.min(filled, clampLubecClockPieces(pieces))

export type LubecClockState = 'full' | 'empty' | 'running'

/** Full when every piece is filled; empty only once it has been filled and drained again. */
export function lubecClockState(clock: Pick<LubecClock, 'filled' | 'pieces' | 'started'>): LubecClockState {
  if (clock.filled >= clock.pieces) return 'full'
  if (clock.filled === 0 && clock.started) return 'empty'
  return 'running'
}

export const lubecPiecesLabel = (pieces: number) => `${pieces} ${pieces === 1 ? 'piece' : 'pieces'}`

/** The SVG path of each piece of a pie of radius `r` about (`c`, `c`), from the top, clockwise. */
export function lubecPiePaths(pieces: number, c = 50, r = 44): string[] {
  if (pieces <= 1) return [`M${c} ${c - r} A${r} ${r} 0 1 1 ${c} ${c + r} A${r} ${r} 0 1 1 ${c} ${c - r} Z`]
  const at = (angle: number) => `${round(c + r * Math.cos(angle))} ${round(c + r * Math.sin(angle))}`
  return Array.from({ length: pieces }, (_, i) => {
    const from = -Math.PI / 2 + (i * 2 * Math.PI) / pieces
    const to = -Math.PI / 2 + ((i + 1) * 2 * Math.PI) / pieces
    return `M${c} ${c} L${at(from)} A${r} ${r} 0 0 1 ${at(to)} Z`
  })
}

const round = (value: number) => Math.round(value * 100) / 100
