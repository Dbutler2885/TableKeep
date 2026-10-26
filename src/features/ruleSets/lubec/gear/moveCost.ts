// What a move costs in actions, in the words the sheet shows (Rules M1 to M6),
// copied from the inventory prototype (B). Shown by the sheet and counted by
// the table. B's `ground` is `drop` here: a dropped thing goes to the GM.

import { MOVE_COST, MOVE_GUESS, type LubecMovePlace } from './gearRules'

type Place = LubecMovePlace | 'drop' | 'carrier'

export type LubecMoveCost = { n: number; a: LubecMovePlace; b: Place; guess: boolean }

const BUILT_IN_PLACES: readonly string[] = ['hands', 'body', 'worn', 'backpack', 'drop']

// A carrier's id names a carrier; moves to and from carriers aren't counted here (Rule M6).
const placeOf = (id: string): Place => (BUILT_IN_PLACES.includes(id) ? id as Place : 'carrier')

/** What moving a thing from the place `fromId` to `destId` ("backpack#1", "hands", "drop") costs, or null when it isn't counted. */
export function lubecMoveCost(fromId: string, destId: string): LubecMoveCost | null {
  const a = placeOf(fromId), b = placeOf(destId.split('#')[0])
  const n = a === 'drop' || a === 'carrier' ? undefined : (MOVE_COST[a] as Partial<Record<Place, number>>)[b]
  return n == null ? null : { n, a: a as LubecMovePlace, b, guess: MOVE_GUESS.has(`${a}>${b}`) }
}

/** A cost in words: "2 actions", "1 action" or "free". */
export const lubecCostWord = (c: Pick<LubecMoveCost, 'n'>): string => (c.n ? `${c.n} action${c.n > 1 ? 's' : ''}` : 'free')

const PLACE_NAME: Readonly<Record<LubecMovePlace, string>> = { hands: 'a hand', body: 'the body', backpack: 'the backpack', worn: 'worn armor' }
const OFF_INTO: Readonly<Record<string, string>> = { hands: 'into a hand', body: 'onto the body', backpack: 'into the backpack' }

function sameCostText(c: LubecMoveCost, w: string): string {
  return c.a === 'hands' ? `Moving it to the other hand: ${w}.` : `Moving it inside the backpack: ${w}. It's only arranging.`
}

function costSentence(c: LubecMoveCost, w: string): string {
  if (c.b === 'drop') return `Dropping it ${c.a === 'worn' ? 'once it is off' : `from ${PLACE_NAME[c.a]}`}: ${w}.`
  if (c.b === 'worn') return `Putting it on from ${PLACE_NAME[c.a]}: ${w}.`
  if (c.a === 'worn') return `Taking it off ${OFF_INTO[c.b]}: ${w}.`
  if (c.a === c.b) return sameCostText(c, w)
  return `From ${PLACE_NAME[c.a]} to ${PLACE_NAME[c.b as LubecMovePlace]}: ${w}.`
}

/** The cost line under a destination: "From a hand to the backpack: 2 actions.", or '' when the move isn't counted. */
export function lubecCostText(fromId: string, destId: string): string {
  const c = lubecMoveCost(fromId, destId)
  if (!c) return ''
  const text = costSentence(c, lubecCostWord(c))
  return c.guess ? `${text} (A guess.)` : text
}
