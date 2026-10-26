// Drag and drop on the On you view (Rule M7), the pointer handling copied
// from the inventory prototype (B 3984-4199) around the pure geometry in
// `dragGeometry.ts`. Press a thing and drag it somewhere else. A mouse picks
// it up after a few pixels; a finger holds still for a moment first, so a
// swipe still scrolls the page. A tap still opens the card, and the card's
// Move button stays for keyboards and screen readers.

import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecPackSpot } from './backpackSlots'
import {
  LUBEC_HANDS_MARK,
  LUBEC_WORN_MARK,
  lubecDropTargets,
  lubecInset,
  lubecTargetAt,
  type LubecDropSurface,
  type LubecDropTarget,
  type LubecRect,
} from './dragGeometry'
import { lubecMarkOf, type LubecDragView, type LubecDropMark } from './lubecDragMarks'

// A finger holds still this long before a thing is picked up (B's DRAG_HOLD_MS).
export const LUBEC_DRAG_HOLD_MS = 260
// How far a mouse moves before it picks a thing up, and how far a finger may wander before the hold is a scroll.
const MOUSE_SLOP = 5
const FINGER_SLOP = 8
// Near the top or bottom of the window the page scrolls, so a phone can reach everything.
const EDGE = 56

type Box = { left: number; top: number; width: number; height: number }

/** A press on a thing, before and while it is dragged. */
type Press = {
  it: LubecItem
  src: HTMLElement
  x0: number
  y0: number
  pid: number
  touch: boolean
  started: boolean
  timer?: ReturnType<typeof setTimeout>
  targets: LubecDropTarget[]
  hot: LubecDropTarget | null
  /** The picked-up card's size, and where on it the pointer grabbed it. */
  size0: { w: number; h: number }
  grab: { x: number; y: number }
  x: number
  y: number
  ghost: Box | null
  /** What scrolls the page under the view: the shell keeps the window itself still. */
  scroller: Element
  scroll: number
  raf: number | null
}

export type LubecDragOptions = {
  /** The On you view, whose boxes are marked `data-item` and `data-drop`. */
  root: RefObject<HTMLElement | null>
  gear: LubecGear
  /** The main pocket's five boxes, in percent of the pack box. */
  spots: readonly LubecPackSpot[]
  /** False for a viewer who may only look, and while a move is being saved. */
  enabled: boolean
  /** A thing was picked up. */
  onStart: () => void
  /** A thing was let go over `hot`. */
  onLetGo: (it: LubecItem, hot: LubecDropTarget) => void
}

const NO_RECT: LubecRect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }

const rectOf = (el: Element | null) => (el ? () => el.getBoundingClientRect() : null)

/** The page's boxes, measured whenever the geometry asks, so a scroll under a finger keeps them right. */
function surfaceOf(root: HTMLElement, dropZone: RefObject<HTMLElement | null>, spots: readonly LubecPackSpot[]): LubecDropSurface {
  const boxes = [...root.querySelectorAll<HTMLElement>('[data-drop], [data-item]')].map((el) => ({
    mark: lubecMarkOf(el.dataset.drop, el.dataset.item),
    dest: el.dataset.drop ?? null,
    itemId: el.dataset.item ?? null,
    rect: () => el.getBoundingClientRect(),
  }))
  return {
    pack: rectOf(root.querySelector('.pack')) ?? (() => NO_RECT),
    spots,
    boxes,
    hands: rectOf(root.querySelector(`[data-mark="${LUBEC_HANDS_MARK}"]`)),
    worn: rectOf(root.querySelector(`[data-mark="${LUBEC_WORN_MARK}"]`)),
    // The drop zone is drawn once the drag starts, so it is measured when the pointer first moves.
    drop: () => dropZone.current?.getBoundingClientRect() ?? NO_RECT,
  }
}

/** Open boxes of the main pocket get their own marks; the other targets light up themselves. */
function marksOf(targets: readonly LubecDropTarget[]) {
  const marks: Record<string, LubecDropMark> = {}
  const cells = new Set<number>()
  for (const t of targets) {
    if (t.cells && t.ok) t.cells.forEach((k) => cells.add(k))
    if (t.mark) marks[t.mark] = !t.ok ? 'no' : t.swap ? 'swap' : 'ok'
  }
  return { marks, cells: [...cells].sort() }
}

/** Where the picked-up card goes: it snaps to the shape of the place it would land in, or follows the pointer. */
function ghostBoxOf(p: Press, t: LubecDropTarget | null): Box {
  if (t?.ok) {
    const r = lubecInset(t.rect(), 3)
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }
  const { w, h } = p.size0
  return { left: p.x - p.grab.x * w, top: p.y - p.grab.y * h, width: w, height: h }
}

function placeGhost(ghost: HTMLElement | null, box: Box | null) {
  if (!ghost || !box) return
  Object.assign(ghost.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` })
}

const scrolls = (el: Element) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight

/** The nearest box that scrolls the view, or the page's own scrolling element. */
function scrollerOf(el: Element): Element {
  for (let at = el.parentElement; at; at = at.parentElement) if (scrolls(at)) return at
  return document.scrollingElement ?? document.documentElement
}

// While the pointer is near the top or bottom of the window, the page scrolls, and the target under it is found again.
function scrollWhileNearEdge(p: Press, aim: () => void) {
  const tick = () => {
    if (!p.scroll) {
      p.raf = null
      return
    }
    p.scroller.scrollBy(0, p.scroll * 10)
    aim()
    p.raf = requestAnimationFrame(tick)
  }
  p.raf = requestAnimationFrame(tick)
}

function pressOf(e: PointerEvent, it: LubecItem, src: HTMLElement): Press {
  const r = src.getBoundingClientRect()
  return {
    it, src, x0: e.clientX, y0: e.clientY, pid: e.pointerId, touch: e.pointerType !== 'mouse', started: false,
    targets: [], hot: null,
    size0: { w: Math.min(r.width, 260), h: Math.min(r.height, 120) },
    grab: { x: r.width ? (e.clientX - r.left) / r.width : 0, y: r.height ? (e.clientY - r.top) / r.height : 0 },
    x: e.clientX, y: e.clientY, ghost: null, scroller: scrollerOf(src), scroll: 0, raf: null,
  }
}

const isMainPress = (e: PointerEvent) => e.button === 0 && e.isPrimary

const itemBoxUnder = (e: PointerEvent) => (e.target instanceof Element ? e.target.closest<HTMLElement>('[data-item]') : null)

// The box of a thing on the On you view under a press with the main button.
function pressedBox(e: PointerEvent, root: HTMLElement | null): HTMLElement | null {
  if (!root || !isMainPress(e)) return null
  const src = itemBoxUnder(e)
  return src && root.contains(src) ? src : null
}

// The thing under a press on the On you view, if it is one the player may drag.
function pressedItem(e: PointerEvent, root: HTMLElement | null, gear: LubecGear): { it: LubecItem; src: HTMLElement } | null {
  const src = pressedBox(e, root)
  const it = src && gear.items.find((x) => x.id === src.dataset.item)
  return src && it ? { it, src } : null
}

const tooFar = (p: Press, e: PointerEvent) => Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > (p.touch ? FINGER_SLOP : MOUSE_SLOP)

const edgeScroll = (y: number) => {
  if (y < EDGE) return -1
  return y > window.innerHeight - EDGE ? 1 : 0
}

/** A drag's state between events: the press, the latest options, and what the page draws for it. */
type Drag = {
  press: Press | null
  /** True for the moment after a drag ends, so the click that follows isn't a tap. */
  justEnded: boolean
  opts: LubecDragOptions
  ghost: RefObject<HTMLDivElement | null>
  dropZone: RefObject<HTMLDivElement | null>
  setView: Dispatch<SetStateAction<LubecDragView | null>>
}

function endDrag(d: Drag) {
  const p = d.press
  if (!p) return
  clearTimeout(p.timer)
  if (p.raf !== null) cancelAnimationFrame(p.raf)
  d.press = null
  if (!p.started) return
  document.body.classList.remove('lubec-dragging')
  d.setView(null)
  d.justEnded = true
  setTimeout(() => { d.justEnded = false }, 0)
}

// The target under the pointer, its highlight, and the picked-up card on it or under the pointer.
function aimAt(d: Drag, p: Press) {
  const t = lubecTargetAt(p.targets, p.x, p.y)
  if (t !== p.hot) {
    p.hot = t
    d.setView((v) => (v ? { ...v, hot: t } : v))
  }
  p.ghost = ghostBoxOf(p, t)
  placeGhost(d.ghost.current, p.ghost)
}

function moveTo(d: Drag, x: number, y: number) {
  const p = d.press
  if (!p?.started) return
  p.x = x
  p.y = y
  aimAt(d, p)
  p.scroll = edgeScroll(y)
  if (p.scroll && p.raf === null) scrollWhileNearEdge(p, () => aimAt(d, p))
}

function startDrag(d: Drag) {
  const p = d.press, root = d.opts.root.current
  if (!p || !root) return
  p.started = true
  p.targets = lubecDropTargets(d.opts.gear, p.it, surfaceOf(root, d.dropZone, d.opts.spots))
  const src = lubecMarkOf(p.src.dataset.drop, p.src.dataset.item)
  d.setView({ itemId: p.it.id, src, ...marksOf(p.targets), hot: null, layer: root.closest<HTMLElement>('.shell-root') })
  document.body.classList.add('lubec-dragging')
  navigator.vibrate?.(8)
  d.opts.onStart()
}

// A finger holds still for a moment before the thing is picked up.
function holdThenStart(d: Drag, p: Press) {
  p.timer = setTimeout(() => {
    if (d.press !== p || p.started) return
    startDrag(d)
    moveTo(d, p.x0, p.y0)
  }, LUBEC_DRAG_HOLD_MS)
}

function onDown(d: Drag, e: PointerEvent) {
  if (d.press || !d.opts.enabled) return
  const hit = pressedItem(e, d.opts.root.current, d.opts.gear)
  if (!hit) return
  d.press = pressOf(e, hit.it, hit.src)
  if (d.press.touch) holdThenStart(d, d.press)
}

const ownPress = (d: Drag, e: PointerEvent): Press | null => (d.press && e.pointerId === d.press.pid ? d.press : null)

function onPointerMove(d: Drag, e: PointerEvent) {
  const p = ownPress(d, e)
  if (!p) return
  if (!p.started) {
    if (!tooFar(p, e)) return
    // A finger that moves before the hold is scrolling.
    if (p.touch) return endDrag(d)
    startDrag(d)
  }
  e.preventDefault()
  moveTo(d, e.clientX, e.clientY)
}

function onUp(d: Drag, e: PointerEvent) {
  const p = ownPress(d, e)
  if (!p) return
  endDrag(d)
  if (p.started && p.hot) d.opts.onLetGo(p.it, p.hot)
}

function onCancel(d: Drag, e: PointerEvent) {
  if (ownPress(d, e)) endDrag(d)
}

// While a finger drags, the page doesn't scroll under it, and a long press doesn't open the phone's menu.
function onBlock(d: Drag, e: Event) {
  if (d.press && (e.type !== 'touchmove' || d.press.started)) e.preventDefault()
}

function onEscape(d: Drag, e: KeyboardEvent) {
  if (e.key === 'Escape' && d.press?.started) endDrag(d)
}

// The click that follows a drag isn't a tap.
function onClickAfterDrag(d: Drag, e: MouseEvent) {
  if (!d.justEnded) return
  e.stopPropagation()
  e.preventDefault()
}

type Listener = [type: string, handle: (d: Drag, e: never) => void, options?: AddEventListenerOptions]

const LISTENERS: readonly Listener[] = [
  ['pointerdown', onDown], ['pointermove', onPointerMove], ['pointerup', onUp], ['pointercancel', onCancel],
  ['touchmove', onBlock, { passive: false }], ['contextmenu', onBlock], ['dragstart', onBlock], ['keydown', onEscape],
  ['click', onClickAfterDrag, { capture: true }],
]

/** Listens on the document for the whole drag, as B does, and lets a drag go when the view goes. */
function listen(d: Drag) {
  const bound = LISTENERS.map(([type, handle, options]) => [type, (e: Event) => handle(d, e as never), options] as const)
  bound.forEach(([type, fn, options]) => document.addEventListener(type, fn, options))
  return () => {
    bound.forEach(([type, fn, options]) => document.removeEventListener(type, fn, options))
    endDrag(d)
  }
}

/**
 * The pointer handling of drag and drop on the On you view: the press, the
 * finger's hold, the picked-up card that follows the pointer or snaps to a
 * place, the highlights, the page scrolling near the window's edges, and the
 * let-go. Returns the drag going on, for the view's highlights, the ref of
 * the picked-up card, which it moves itself so a drag never redraws the page,
 * and the ref of the drop zone, which it measures.
 */
export function useLubecDrag(opts: LubecDragOptions) {
  const ghost = useRef<HTMLDivElement | null>(null)
  const dropZone = useRef<HTMLDivElement | null>(null)
  const [view, setView] = useState<LubecDragView | null>(null)
  const drag = useRef<Drag>({ press: null, justEnded: false, opts, ghost, dropZone, setView })

  // Every event reads the options of the latest render.
  useLayoutEffect(() => {
    drag.current.opts = opts
  })

  useEffect(() => listen(drag.current), [])

  // The picked-up card is drawn after the drag starts; it takes the place the pointer already gave it.
  useLayoutEffect(() => {
    if (view) placeGhost(ghost.current, drag.current.press?.ghost ?? null)
  }, [view])

  return { view, ghost, dropZone }
}
