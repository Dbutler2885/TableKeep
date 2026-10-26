// What a move asked for on the Gear page comes to, copied from the inventory
// prototype (B's Move button and `dropIt`): the next gear and its toast, a
// refusal in B's words, or a drop, which leaves the character's record and
// so is carried out by `lubecMoveBetween` rather than committed here.

import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecArrangeItem, lubecInMain, lubecMoveItem, lubecRepackMain } from '../../ruleSets/lubec/gear/moves'
import { lubecSwapItems } from '../../ruleSets/lubec/gear/swap'
import type { LubecDropTarget } from './dragGeometry'
import {
  LUBEC_DROP_DEST,
  lubecArrangedToast,
  lubecMovedToast,
  lubecRefusal,
  lubecSwapOf,
  lubecSwappedToast,
} from './moveLabels'

export type LubecGearMove =
  | { kind: 'done'; gear: LubecGear; toast: string }
  | { kind: 'refused'; msg: string }
  | { kind: 'drop' }

const refused = (msg: string): LubecGearMove => ({ kind: 'refused', msg })

function swapped(gear: LubecGear, i: LubecItem, o: LubecItem): LubecGearMove {
  const s = lubecSwapItems(gear, i, o)
  return s.ok ? { kind: 'done', gear: s.gear, toast: lubecSwappedToast(s.a, s.b, s.cost) } : refused(s.msg)
}

function moved(gear: LubecGear, i: LubecItem, dest: string, cells: readonly number[] | null): LubecGearMove {
  const m = lubecMoveItem(gear, i.id, dest, cells)
  return m.ok ? { kind: 'done', gear: m.gear, toast: lubecMovedToast(m.item, i.carrier, dest) } : refused(m.msg)
}

/** The card's Move it or Swap, for the choice `value` in its Move list. A refused move points at swapping when it could. */
export function lubecCardMove(gear: LubecGear, i: LubecItem, value: string): LubecGearMove {
  if (value === LUBEC_DROP_DEST) return { kind: 'drop' }
  const o = lubecSwapOf(gear, value)
  if (o) return swapped(gear, i, o)
  const m = moved(gear, i, value, null)
  return m.kind === 'refused' ? refused(lubecRefusal(gear, i, m.msg)) : m
}

// A move to a place in the record: arranging inside the main pocket is free and isn't a move.
function placed(gear: LubecGear, it: LubecItem, hot: LubecDropTarget): LubecGearMove {
  const packed = hot.repack ? lubecRepackMain(gear) : gear
  if (hot.cells && lubecInMain(it)) return { kind: 'done', gear: lubecArrangeItem(packed, it.id, hot.cells), toast: lubecArrangedToast(it) }
  return moved(packed, it, hot.dest, hot.cells ?? null)
}

/** Letting go of a dragged thing over `hot`: it costs exactly what the Move button would (Rule M7). */
export function lubecDragMove(gear: LubecGear, it: LubecItem, hot: LubecDropTarget): LubecGearMove {
  if (!hot.ok) return refused(hot.why ?? '')
  if (hot.swap) return swapped(gear, it, hot.swap)
  return hot.dest === LUBEC_DROP_DEST ? { kind: 'drop' } : placed(gear, it, hot)
}
