// Swapping (Rule M9), copied from the inventory prototype (B's `canSwap`,
// `spotOf`, `cellsOf`, `swapCost`, `swapWord` and `swapItems`). Two things
// trade places, so a full inventory never locks anything in (captain, round
// 27). B swapped in place and put things back when a check failed; here it is
// pure: gear in, the next gear or the reason out.

import { lubecCostWord, lubecMoveCost } from './moveCost'
import type { LubecGear, LubecItem } from './gearRecord'
import { lubecAt, lubecInMain, lubecWithItems } from './moves'
import { bothHands, packMain, place } from './placement'

// Only things in hands, body slots and the backpack. A small thing held or on the body takes that slot, so it swaps;
// small stuff in the backpack takes no slot, so it never gets stuck.
export const lubecCanSwap = (i: LubecItem): boolean =>
  ['hands', 'body', 'backpack'].includes(i.carrier) && !(i.carrier === 'backpack' && i.size === 0)

// A thing in both hands is in "hands"; one in one hand, or in a body slot, is in that slot.
const slotSpot = (i: LubecItem): string => (i.carrier === 'hands' && bothHands(i) ? 'hands' : `${i.carrier}#${i.slot ?? 0}`)

/** The exact place a thing is in, as a destination: its hand or body slot, its pocket. */
export function lubecSpotOf(i: LubecItem): string {
  if (i.carrier === 'hands' || i.carrier === 'body') return slotSpot(i)
  return `${i.carrier}#${i.pocket ?? 'small'}`
}

/** The main-pocket boxes a thing sits in: the ones the player arranged, or where the sheet packed it. */
export function lubecCellsOf(gear: LubecGear, i: LubecItem): readonly number[] | null {
  if (!lubecInMain(i)) return null
  return i.cells || packMain(gear)?.placed.find((p) => p.item.id === i.id)?.at || null
}

export type LubecSwapCost = { n: number; guess: boolean }

/** Both moves added up (a GUESS); inside the backpack it's only arranging (Rule M2). Null when a move isn't counted. */
export function lubecSwapCost(a: LubecItem, b: LubecItem): LubecSwapCost | null {
  const x = lubecMoveCost(a.carrier, lubecSpotOf(b)), y = lubecMoveCost(b.carrier, lubecSpotOf(a))
  if (!x || !y) return null
  return { n: x.n + y.n, guess: [x.a, x.b, y.a, y.b].some((p) => p !== 'backpack') }
}

/** A swap's cost in words: "4 actions (a guess)", "free (a guess)", "free, only arranging", or '' when it isn't counted. */
export function lubecSwapWord(c: LubecSwapCost | null, guessed = ' (a guess)'): string {
  if (!c) return ''
  if (c.n) return `${lubecCostWord(c)}${c.guess ? guessed : ''}`
  return c.guess ? `free${guessed}` : 'free, only arranging'
}

/** The other things `i` could trade places with; inside the main pocket only a thing of the same size. */
export const lubecSwapCandidates = (gear: LubecGear, i: LubecItem): LubecItem[] =>
  (lubecCanSwap(i) ? gear.items.filter((o) => o.id !== i.id && lubecCanSwap(o) && !(lubecInMain(i) && lubecInMain(o) && i.size !== o.size)) : [])

export type LubecSwapped = { ok: true; gear: LubecGear; a: LubecItem; b: LubecItem; cost: LubecSwapCost | null } | { ok: false; msg: string }

// In the main pocket each keeps the other's boxes when they're the same size; otherwise the sheet packs it.
const withCells = (i: LubecItem, at: readonly number[] | null): LubecItem =>
  (lubecInMain(i) && at && at.length === i.size ? { ...i, cells: [...at] } : i)

/** `a` and `b` trade places. Each has to fit where the other was, or the reason says why not and nothing changes. */
export function lubecSwapItems(gear: LubecGear, a: LubecItem, b: LubecItem): LubecSwapped {
  // b is out of the way while a takes its place.
  const out = { ...gear, items: gear.items.filter((x) => x.id !== b.id) }
  const pa = place(out, lubecSpotOf(b), a, a.id)
  if (!pa.ok) return pa
  const a2 = lubecAt(a, pa)
  const pb = place(lubecWithItems(out, a2), lubecSpotOf(a), b, b.id)
  if (!pb.ok) return { ok: false, msg: `${b.name} can't go where ${a.name} was. ${pb.msg}` }
  const na = withCells(a2, lubecCellsOf(gear, b)), nb = withCells(lubecAt(b, pb), lubecCellsOf(gear, a))
  return { ok: true, gear: lubecWithItems(gear, na, nb), a: na, b: nb, cost: lubecSwapCost(a, b) }
}
