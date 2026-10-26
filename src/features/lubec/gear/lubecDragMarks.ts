// What the On you view shows while a thing is dragged (Rule M7), as B lit it
// up: every open place it could go, the things it could swap with, the ones
// it can't go to, the place under the pointer, and the thing itself, faded.
// Each box on the view has a mark, its `data-drop` place or its thing's id,
// and reads its highlight from the drag that is going on.

import { createContext, useContext } from 'react'
import type { LubecDropTarget } from './dragGeometry'

/** How a box is lit while a thing is dragged: an open place, a thing to swap with, or a place it can't go. */
export type LubecDropMark = 'ok' | 'swap' | 'no'

export type LubecDragView = {
  /** The dragged thing. */
  itemId: string
  /** The mark of the box it was picked up from. */
  src: string
  marks: Readonly<Record<string, LubecDropMark>>
  /** The main pocket's open boxes, which get marks of their own. */
  cells: readonly number[]
  /** The target under the pointer. */
  hot: LubecDropTarget | null
  /** Where the picked-up card and the drop zone are drawn: outside the sheet's fit zoom, so they follow the pointer. */
  layer: HTMLElement | null
}

/** A box's mark: its `data-drop` place, or for a thing in the main pocket, which has none, its id. */
export const lubecMarkOf = (dest: string | null | undefined, itemId: string | null | undefined): string =>
  dest ?? `item:${itemId}`

export const LubecDragContext = createContext<LubecDragView | null>(null)

const MARK_CLASS: Readonly<Record<LubecDropMark, string>> = { ok: ' drop-ok', swap: ' drop-swap', no: ' drop-no' }

/** The classes a box with `mark` takes while a thing is dragged: lit, hot under the pointer, or faded as the thing picked up. */
export function lubecDropClass(view: LubecDragView | null, mark: string): string {
  if (!view) return ''
  const lit = view.marks[mark]
  const hot = view.hot?.mark === mark && view.hot.ok ? ' drop-hot' : ''
  return `${lit ? MARK_CLASS[lit] : ''}${hot}${view.src === mark ? ' drag-src' : ''}`
}

/** The drag going on over the On you view, or null. */
export const useLubecDragView = (): LubecDragView | null => useContext(LubecDragContext)

/** The classes the box with `mark` takes from the drag going on. */
export const useLubecDropClass = (mark: string): string => lubecDropClass(useLubecDragView(), mark)
