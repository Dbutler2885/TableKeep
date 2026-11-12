// A Lubec clock: a named pie of 1 to 10 pieces that the table fills and empties
// by hand. It says in plain words what fills it and what empties it, and what
// happens when it is full and when it is empty. The pieces have no order: any
// one may be filled or emptied on its own, so a clock's state is which pieces
// are filled, and whether it is full or empty follows from how many.

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

/** Who sees a clock besides the GM: nobody, the whole group, or the owners of chosen characters. */
export type LubecClockVisibility = 'hidden' | 'all' | 'some'

/**
 * Who sees a clock, which only the GM sets. `viewerUids` are the chosen
 * characters' owners when the GM saved, as a handout's are; it is what the
 * rules read, so a character changing hands needs the clock saved again.
 */
export type LubecClockSharing = {
  visibility: LubecClockVisibility
  characterIds: string[]
  viewerUids: string[]
}

/** A player's character the GM can show a clock to. */
export type LubecClockCharacter = { id: string; name: string; ownerUserId: string; ownerUsername: string }

export type LubecClock = LubecClockFields & LubecClockSharing & {
  id: string
  // The filled pieces, by index from the top piece clockwise, ascending and without repeats.
  filled: number[]
  // Whether a piece has ever been filled. A new clock starts empty without
  // having become empty, so its empty result waits until it has been filled.
  started: boolean
  createdAtMs: number
}

/** A GM's new clock starts hidden, as a new handout does. */
export const hiddenLubecClockSharing = (): LubecClockSharing => ({ visibility: 'hidden', characterIds: [], viewerUids: [] })

/** A player's new clock is the whole table's, since a player cannot choose who sees one. */
export const sharedLubecClockSharing = (): LubecClockSharing => ({ visibility: 'all', characterIds: [], viewerUids: [] })

export const lubecClockSharingOf = (clock: LubecClockSharing): LubecClockSharing =>
  ({ visibility: clock.visibility, characterIds: clock.characterIds, viewerUids: clock.viewerUids })

/** The owners of the chosen characters, once each. */
export const lubecClockViewerUids = (characterIds: readonly string[], characters: readonly LubecClockCharacter[]): string[] =>
  [...new Set(characters.filter((character) => characterIds.includes(character.id)).map((character) => character.ownerUserId).filter(Boolean))]

/** The sharing as it is saved: viewers only for chosen characters, or the reason it cannot be. */
export function cleanLubecClockSharing(sharing: LubecClockSharing, characters: readonly LubecClockCharacter[]): { ok: true; sharing: LubecClockSharing } | { ok: false; error: string } {
  if (sharing.visibility !== 'some') return { ok: true, sharing: { ...sharing, viewerUids: [] } }
  const viewerUids = lubecClockViewerUids(sharing.characterIds, characters)
  if (viewerUids.length === 0) return { ok: false, error: 'Choose at least one player to show it to.' }
  return { ok: true, sharing: { ...sharing, viewerUids } }
}

/** Who sees a clock, as the GM reads it on the card. */
export function lubecClockAudience(clock: LubecClockSharing, characters: readonly LubecClockCharacter[]): string {
  if (clock.visibility === 'hidden') return 'Hidden'
  if (clock.visibility === 'all') return 'Everyone'
  const names = characters.filter((character) => clock.characterIds.includes(character.id)).map((character) => character.name)
  return names.length > 0 ? names.join(', ') : 'Chosen players'
}

const VISIBILITIES: readonly LubecClockVisibility[] = ['hidden', 'all', 'some']

const stringsOf = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])

/** A stored clock's sharing; anything unreadable is hidden, so a damaged clock is never shown by mistake. */
const parseSharing = (data: Record<string, unknown>): LubecClockSharing => ({
  visibility: VISIBILITIES.includes(data.visibility as LubecClockVisibility) ? data.visibility as LubecClockVisibility : 'hidden',
  characterIds: stringsOf(data.characterIds),
  viewerUids: stringsOf(data.viewerUids),
})

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

/** The filled pieces that exist on a clock of `pieces` pieces, ascending and without repeats. */
export const lubecFilledWithin = (filled: readonly unknown[], pieces: number): number[] =>
  [...new Set(filled.filter((index): index is number => Number.isInteger(index) && (index as number) >= 0 && (index as number) < pieces))].sort((a, b) => a - b)

/** Reads a stored clock, keeping a damaged one usable rather than dropping it. */
export function parseLubecClock(data: Record<string, unknown>, id: string): LubecClock {
  const pieces = clampLubecClockPieces(numberOr(data.pieces, LUBEC_CLOCK_MIN_PIECES))
  const filled = lubecFilledWithin(Array.isArray(data.filled) ? data.filled : [], pieces)
  return {
    id,
    name: textOf(data.name, LUBEC_CLOCK_LIMITS.name) || 'Unnamed clock',
    description: textOf(data.description, LUBEC_CLOCK_LIMITS.description),
    pieces,
    filled,
    started: data.started === true || filled.length > 0,
    increase: textOf(data.increase, LUBEC_CLOCK_LIMITS.increase),
    decrease: textOf(data.decrease, LUBEC_CLOCK_LIMITS.decrease),
    whenFull: textOf(data.whenFull, LUBEC_CLOCK_LIMITS.whenFull),
    whenEmpty: textOf(data.whenEmpty, LUBEC_CLOCK_LIMITS.whenEmpty),
    ...parseSharing(data),
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

export type LubecClockState = 'full' | 'empty' | 'running'

/** Full when every piece is filled, whichever order they were filled in; empty only once it has been filled and drained again. */
export function lubecClockState(clock: Pick<LubecClock, 'filled' | 'pieces' | 'started'>): LubecClockState {
  if (clock.filled.length >= clock.pieces) return 'full'
  if (clock.filled.length === 0 && clock.started) return 'empty'
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

/** A clock whose pieces someone else filled or emptied: the clock as it is now, and which pieces changed since it was last seen. */
export type LubecClockChange = { clock: LubecClock; before: number[]; added: number[]; removed: number[] }

/** A clock as one read delivers it, and whether the change in it is this browser's own write. */
export type LubecClockReading = { clock: LubecClock; local: boolean }

const changeOf = (clock: LubecClock, before: readonly number[]): LubecClockChange => ({
  clock,
  before: [...before],
  added: clock.filled.filter((index) => !before.includes(index)),
  removed: before.filter((index) => !clock.filled.includes(index)),
})

/**
 * The fills to announce between two reads: each clock seen both times whose
 * filled pieces differ, unless the change is this browser's own. The first
 * read announces nothing, and neither does a clock that has just come into
 * view, so nobody is told about a clock they could not see a moment ago.
 */
export function lubecClockChanges(previous: ReadonlyMap<string, readonly number[]> | null, readings: readonly LubecClockReading[]): LubecClockChange[] {
  if (!previous) return []
  return readings.flatMap(({ clock, local }) => {
    const before = previous.get(clock.id)
    if (local || !before) return []
    const change = changeOf(clock, before)
    return change.added.length + change.removed.length > 0 ? [change] : []
  })
}

/** A later change to a clock already waiting to be announced, folded into it, measured from what the table last saw. */
export const mergeLubecClockChange = (waiting: LubecClockChange, later: LubecClockChange): LubecClockChange => changeOf(later.clock, waiting.before)

/** What happened, in words: which pieces were filled and which emptied. */
export function lubecClockChangeText({ added, removed }: Pick<LubecClockChange, 'added' | 'removed'>): string {
  const pieces = (indexes: readonly number[]) => {
    const numbers = indexes.map((index) => index + 1).sort((a, b) => a - b)
    const list = numbers.length > 1 ? `${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}` : `${numbers[0]}`
    return `${numbers.length > 1 ? 'Pieces' : 'Piece'} ${list}`
  }
  const parts = [added.length ? `${pieces(added)} filled` : '', removed.length ? `${pieces(removed)} emptied` : ''].filter(Boolean)
  return parts.join('; ')
}
