import { lubecRollSkills, type LubecRollSkill } from './checkRoll'
import { LUBEC_EFFECTIVE_HANDLE_CAP } from './derivations'
import type { LubecSheet } from './sheet'

// The combined prototype's Fight bar (combined-character-sheet-prototype.html,
// "fight-region"): the Effective Handle drawn on a 0-100 bar, divided by
// Defense lines into Defense commitments and, last, the attack. Each part is
// rolled on its own d100 and succeeds under its own size. The math here is
// the prototype's as built.

/** The bar's tool: placing a Defense line, removing one, or neither. */
export type LubecAllocationMode = 'place' | 'remove' | null

export type LubecAllocationKind = 'attack' | 'defense'

/** One part of the bar, from one line to the next; the last is the attack. */
export type LubecAllocationSegment = {
  /** Its place among the parts, which numbers a Defense part and keys its roll. */
  index: number
  start: number
  size: number
  kind: LubecAllocationKind
  /** "ATK", or "DEF 1", "DEF 2"... */
  name: string
  /** Every other Defense part is the lighter blue. */
  alt: boolean
}

/**
 * The skills a fight can take: every one of the character's own skills with
 * a bonus, Trained before Expert as the skill strip orders them. A fighting or
 * shooting skill, which no Stat Check takes, counts here.
 */
export const lubecFightSkills = (sheet: LubecSheet): LubecRollSkill[] =>
  lubecRollSkills(sheet).sort((a, b) => a.bonus - b.bonus || a.name.localeCompare(b.name))

/** The armed skill's bonus when the fight can take it, or 0. */
export const lubecFightSkillBonus = (sheet: LubecSheet, armed: string | null): number =>
  lubecFightSkills(sheet).find((skill) => skill.name === armed)?.bonus ?? 0

/**
 * The Handle the bar divides: Effective Handle plus the armed skill's bonus,
 * as a skill adds to a Stat Check's target, held to the bar's 0-100. A hole
 * divides nothing.
 */
export function lubecFightHandle(handle: number | null, bonus: number): number {
  if (handle === null) return 0
  return Math.max(0, Math.min(LUBEC_EFFECTIVE_HANDLE_CAP, handle + bonus))
}

/** The bar's parts: the lines at or under the Handle, in order, with any part of no size left out. */
export function lubecAllocationSegments(positions: readonly number[], handle: number): LubecAllocationSegment[] {
  const boundaries = [0, ...positions.filter((position) => position <= handle), handle]
  const last = boundaries.length - 2
  return boundaries.slice(0, -1).flatMap((start, index) => {
    const size = boundaries[index + 1] - start
    if (size <= 0) return []
    const kind: LubecAllocationKind = index === last ? 'attack' : 'defense'
    return [{ index, start, size, kind, name: kind === 'attack' ? 'ATK' : `DEF ${index + 1}`, alt: kind === 'defense' && index % 2 === 1 }]
  })
}

/** Where a part's label sits: at its centre, or pinned to the bar's end when its centre is within 5 of it. */
export function lubecAllocationLabelPlace(segment: LubecAllocationSegment): { left: number; edge: 'at-start' | 'at-end' | null } {
  const centre = segment.start + segment.size / 2
  if (centre < 5) return { left: 0, edge: 'at-start' }
  if (centre > 95) return { left: 100, edge: 'at-end' }
  return { left: centre, edge: null }
}

/** A part's roll: a success under its size, and a double (11, 22 ... 99) either way. */
export function lubecAllocationOutcome(result: number, size: number): { success: boolean; double: boolean } {
  return { success: result < size, double: result % 11 === 0 }
}

/** The bar position under a pointer `fraction` of the way along it: a whole number from 1 to the Handle. */
export const lubecAllocationPosition = (fraction: number, handle: number): number =>
  Math.max(1, Math.min(Math.round(fraction * 100), handle))

/** The lines with one placed at `position`, in order; a line already there is not placed twice. */
export const withLubecLinePlaced = (positions: readonly number[], position: number): number[] =>
  (positions.includes(position) ? [...positions] : [...positions, position].sort((a, b) => a - b))

/** The lines without the one at `index`. */
export const withLubecLineRemoved = (positions: readonly number[], index: number): number[] =>
  positions.filter((_, each) => each !== index)

/** The lines with the one at `index` dragged to `position`, kept between its neighbours and under the Handle. */
export function withLubecLineMoved(positions: readonly number[], index: number, position: number, handle: number): number[] {
  const minimum = index > 0 ? positions[index - 1] + 1 : 1
  const maximum = index < positions.length - 1 ? positions[index + 1] - 1 : handle
  return positions.map((each, at) => (at === index ? Math.max(minimum, Math.min(position, maximum)) : each))
}

/** "Click the bar to place", "Click a line to remove" or "Tools off". */
export function lubecAllocationToolStatus(mode: LubecAllocationMode): string {
  if (mode === 'place') return 'Click the bar to place'
  return mode === 'remove' ? 'Click a line to remove' : 'Tools off'
}
