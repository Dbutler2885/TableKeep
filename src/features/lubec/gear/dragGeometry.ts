// Drag and drop on the On you view (Rule M7), copied from the inventory
// prototype (B's `cellsRect`, `dropTargets`, `targetAt` and `dropCostText`).
// B read the page for every box; here the page's boxes come in as a surface
// of rectangles, so the geometry is pure and `useLubecDrag` does the
// measuring. A rectangle is a function, as in B, because the page can scroll
// under a finger while it drags.

import { lubecCostWord, lubecMoveCost, type LubecMoveCost } from '../../ruleSets/lubec/gear/moveCost'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecInMain } from '../../ruleSets/lubec/gear/moves'
import { bothHands, FOOTPRINTS, packMain, place } from '../../ruleSets/lubec/gear/placement'
import { lubecCanSwap, lubecCellsOf, lubecSpotOf, lubecSwapCost, lubecSwapItems, lubecSwapWord, type LubecSwapCost } from '../../ruleSets/lubec/gear/swap'
import type { LubecPackSpot } from './backpackSlots'
import { destOf } from './itemLabels'
import { cap1, LUBEC_DROP_DEST, theName } from './moveLabels'

/** A box on the screen, as `getBoundingClientRect` gives it. */
export type LubecRect = { left: number; top: number; right: number; bottom: number; width: number; height: number }

type Measure = () => LubecRect

/** The mark of the hands row, which both hands light up as one. */
export const LUBEC_HANDS_MARK = 'hands-row'
/** The mark of the worn armor's drawing. */
export const LUBEC_WORN_MARK = 'worn'
/** The mark of the drop zone. */
export const LUBEC_DROP_MARK = 'drop'

/** A place on the page: a box marked `data-drop`, or one holding a thing, marked `data-item`. Its mark names it. */
export type LubecDropBox = { mark: string; dest: string | null; itemId: string | null; rect: Measure }

/** The page's boxes while a thing is dragged. */
export type LubecDropSurface = {
  /** The pack box, and the main pocket's five boxes in percent of it. */
  pack: Measure
  spots: readonly LubecPackSpot[]
  boxes: readonly LubecDropBox[]
  hands: Measure | null
  worn: Measure | null
  drop: Measure
}

/** A place the dragged thing could be dropped, open or not: where it goes, its screen box, and what it costs or why not. */
export type LubecDropTarget = {
  dest: string
  rect: Measure
  /** The mark of the box it lights up; null for the main pocket's boxes, which get marks of their own. */
  mark: string | null
  ok: boolean
  why: string | null
  cost: LubecMoveCost | LubecSwapCost | null
  /** The main-pocket boxes it takes (Rule W2). */
  cells?: readonly number[]
  /** Room in the main pocket, but not in one piece: the sheet packs it afresh. */
  repack?: boolean
  /** The thing it would swap with (Rule M9). */
  swap?: LubecItem
}

export const lubecInset = (r: LubecRect, d: number): LubecRect =>
  ({ left: r.left + d, top: r.top + d, right: r.right - d, bottom: r.bottom - d, width: r.width - 2 * d, height: r.height - 2 * d })

/** The screen box of some of the main pocket's boxes, from the pack's own box and the boxes' percents. */
export function lubecCellsRect(pack: LubecRect, spots: readonly LubecPackSpot[], at: readonly number[]): LubecRect {
  const cs = at.map((k) => spots[k])
  const x = Math.min(...cs.map((c) => c.x)), y = Math.min(...cs.map((c) => c.y))
  const w = Math.max(...cs.map((c) => c.x + c.w)) - x, h = Math.max(...cs.map((c) => c.y + c.h)) - y
  const left = pack.left + (pack.width * x) / 100, top = pack.top + (pack.height * y) / 100
  const width = (pack.width * w) / 100, height = (pack.height * h) / 100
  return { left, top, right: left + width, bottom: top + height, width, height }
}

const ALL_CELLS = [0, 1, 2, 3, 4]

const sameCells = (a: readonly number[], b: readonly number[] | null) => b !== null && a.length === b.length && a.every((k, n) => k === b[n])

type Targets = { gear: LubecGear; it: LubecItem; s: LubecDropSurface; list: LubecDropTarget[] }

function addTarget(t: Targets, dest: string, rect: Measure, mark: string | null, extra: Partial<LubecDropTarget> = {}) {
  const pl = place(t.gear, dest, t.it, t.it.id)
  t.list.push({ dest, rect, mark, ok: pl.ok, why: pl.ok ? null : pl.msg, cost: pl.ok ? lubecMoveCost(t.it.carrier, dest) : null, ...extra })
}

const cellsAt = (t: Targets, at: readonly number[]): Measure => () => lubecCellsRect(t.s.pack(), t.s.spots, at)

// The footprints of the main pocket a thing could take: boxes that are empty, or its own.
// Stored gear that breaks the pocket's rules packs to nothing, and then every box reads as empty.
function openFeet(gear: LubecGear, it: LubecItem): readonly (readonly number[])[] {
  const cells: readonly (LubecItem | null)[] = packMain(gear)?.cells ?? []
  const isOpen = (k: number) => (cells[k] ?? it).id === it.id
  return FOOTPRINTS[it.size].filter((at) => at.every(isOpen))
}

const boxesNow = (gear: LubecGear, it: LubecItem) => (lubecInMain(it) ? lubecCellsOf(gear, it) : null)

// The main pocket: one target per open footprint. Inside the pocket it's arranging, and free (Rule M2).
function mainTargets(t: Targets) {
  if (t.it.size === 8) return addTarget(t, 'backpack#0', cellsAt(t, ALL_CELLS), null)
  if (t.it.size === 0) return
  const feet = openFeet(t.gear, t.it), now = boxesNow(t.gear, t.it)
  feet.filter((at) => !sameCells(at, now)).forEach((at) => addTarget(t, 'backpack#0', cellsAt(t, at), null, { cells: at }))
  // Room in the pocket, but not in one piece: the sheet packs it afresh.
  if (!feet.length) addTarget(t, 'backpack#0', cellsAt(t, ALL_CELLS), null, { repack: true })
}

// A box the thing isn't offered: where it is, a pocket for a small thing (it goes with the small stuff),
// small stuff for anything else, and a single hand for a thing that takes both (both hands are one target).
function skipsBox(it: LubecItem, dest: string, here: string): boolean {
  const [cid] = dest.split('#')
  const backpackMismatch = cid === 'backpack' && (dest === 'backpack#small') !== (it.size === 0)
  return dest === here || backpackMismatch || (cid === 'hands' && bothHands(it))
}

const occupantOf = (gear: LubecGear, box: LubecDropBox): LubecItem | null =>
  (box.itemId === null ? null : gear.items.find((x) => x.id === box.itemId) ?? null)

const isOffered = (t: Targets, box: LubecDropBox, occupant: LubecItem | null, here: string): box is LubecDropBox & { dest: string } =>
  box.dest !== null && occupant?.id !== t.it.id && !skipsBox(t.it, box.dest, here)

function boxTarget(t: Targets, box: LubecDropBox, here: string) {
  const occupant = occupantOf(t.gear, box)
  if (!isOffered(t, box, occupant, here)) return
  if (!occupant) return addTarget(t, box.dest, box.rect, box.mark)
  // A thing it can swap with is a target of its own (swapTargets).
  if (!lubecCanSwap(t.it) || !lubecCanSwap(occupant)) t.list.push({ dest: box.dest, rect: box.rect, mark: box.mark, ok: false, why: `${occupant.name} is there.`, cost: null })
}

// Everything marked data-drop: front pockets, small stuff, hand and body slots.
function boxTargets(t: Targets) {
  const here = destOf(t.it)
  t.s.boxes.forEach((box) => boxTarget(t, box, here))
}

// Inside the main pocket a thing swaps only with one of the same size; the open boxes do the rest.
const canSwapWith = (it: LubecItem, o: LubecItem): boolean =>
  o.id !== it.id && lubecCanSwap(o) && !(lubecInMain(it) && lubecInMain(o) && it.size !== o.size)

function swapTarget(t: Targets, box: LubecDropBox) {
  const o = t.gear.items.find((x) => x.id === box.itemId)
  if (!o || !canSwapWith(t.it, o)) return
  const r = lubecSwapItems(t.gear, t.it, o)
  t.list.push({ dest: lubecSpotOf(o), rect: box.rect, mark: box.mark, swap: o, ok: r.ok, why: r.ok ? null : r.msg, cost: r.ok ? lubecSwapCost(t.it, o) : null })
}

// Dropping on another thing swaps the two (Rule M9).
function swapTargets(t: Targets) {
  if (lubecCanSwap(t.it)) t.s.boxes.forEach((box) => swapTarget(t, box))
}

// Both hands as one place, for a thing that takes both; worn armor's drawing, for armor not worn yet.
function rowTargets(t: Targets) {
  const { it, s } = t
  if (s.hands && bothHands(it) && it.carrier !== 'hands') addTarget(t, 'hands', s.hands, LUBEC_HANDS_MARK)
  if (s.worn && it.kind === 'armor' && it.carrier !== 'worn') addTarget(t, 'worn', s.worn, LUBEC_WORN_MARK)
}

/** Every place `it` could be dropped on the surface, open or not. */
export function lubecDropTargets(gear: LubecGear, it: LubecItem, s: LubecDropSurface): LubecDropTarget[] {
  const t: Targets = { gear, it, s, list: [] }
  mainTargets(t)
  boxTargets(t)
  swapTargets(t)
  rowTargets(t)
  // A drop always works: the thing goes to the GM's Items tab (Rule M8).
  t.list.push({ dest: LUBEC_DROP_DEST, rect: s.drop, mark: LUBEC_DROP_MARK, ok: true, why: null, cost: lubecMoveCost(it.carrier, LUBEC_DROP_DEST) })
  return t.list
}

const holds = (r: LubecRect, x: number, y: number) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom

// How far the point is from the box's centre; an open target always comes before a closed one.
const rank = (t: LubecDropTarget, r: LubecRect, x: number, y: number) =>
  Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2) - (t.ok ? 1e6 : 0)

/** The target under the pointer: open targets win, then the nearest centre. */
export function lubecTargetAt(targets: readonly LubecDropTarget[], x: number, y: number): LubecDropTarget | null {
  let best: LubecDropTarget | null = null, bestD = Infinity
  for (const t of targets) {
    const r = t.rect(), d = holds(r, x, y) ? rank(t, r, x, y) : Infinity
    if (d < bestD) { best = t; bestD = d }
  }
  return best
}

const isArranging = (t: LubecDropTarget) => Boolean(t.cells) && t.cost !== null && 'a' in t.cost && t.cost.a === 'backpack' && t.cost.b === 'backpack'

// A move's cost on the chip: "2 actions", "Free (a guess)", or "Move here" for a move that isn't counted.
const moveChip = (cost: LubecDropTarget['cost']) => (cost ? cap1(lubecCostWord(cost)) + (cost.guess ? ' (a guess)' : '') : 'Move here')

/** The chip under the picked-up card: what dropping here costs, or why it can't go here. */
export function lubecDropCostText(t: LubecDropTarget): string {
  if (!t.ok) return t.why ?? ''
  if (t.swap) return `Swap with ${theName(t.swap)}: ${lubecSwapWord(t.cost as LubecSwapCost | null)}`
  return isArranging(t) ? 'Free: only arranging' : moveChip(t.cost)
}
