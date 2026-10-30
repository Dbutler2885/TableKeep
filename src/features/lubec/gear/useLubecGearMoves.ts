import { useRef, useState } from 'react'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecPackLayout } from './backpackSlots'
import type { LubecDropTarget } from './dragGeometry'
import { lubecDragMove } from './gearMoves'
import type { LubecItemSheetState } from './itemSheet'
import type { LubecGearDrop } from './lubecGearDrop'
import type { LubecMoveResult } from './lubecMoveTransaction'
import { lubecDroppedToast } from './moveLabels'
import { lubecAskFirst, type LubecStrengthAsk } from './strengthAsk'
import { useLubecDrag } from './useLubecDrag'
import { useLubecPackCrop } from './useLubecPackCrop'

type Toast = { show: (text: string) => void; hide: () => void }

export type LubecGearMovesOptions = {
  gear: LubecGear
  /** Saves the character's next gear; null for a viewer who may only look. */
  onGearChange: ((gear: LubecGear) => void) | null
  /** Drops a thing to the GM's Items tab; null for a viewer who may only look. */
  onDrop: LubecGearDrop
  toast: Toast
  setSheet: (update: (sheet: LubecItemSheetState | null) => LubecItemSheetState | null) => void
  /** Asks the character's owner for a Strength roll before a heavy thing comes onto them; null when nobody is asked. */
  onAsk?: ((ask: LubecStrengthAsk) => void) | null
}

/** Drops a thing; a refusal goes to `refused`, and `said` replaces the drop's own toast. `from` drops it from a record other than the sheet. */
export type LubecDropIt = (item: LubecItem, refused: (msg: string) => void, said?: string, from?: () => Promise<LubecMoveResult>) => void

/** A write that leaves the sheet's own save: what it is, and what to say. When `item` is given it has left the record, so its card closes. */
export type LubecCarried = { task: () => Promise<LubecMoveResult>; refused: (msg: string) => void; failed: string; item?: LubecItem; said?: string }

/** Carries out a write across records, holding every other gear edit until it lands. */
export type LubecGearCarryOut = (carried: LubecCarried) => void

const cannotDrop = (item: LubecItem) => `Could not drop ${item.name}. Nothing changed.`

// The thing has left the sheet, so its card closes.
const withoutCardOf = (itemId: string) => (sheet: LubecItemSheetState | null) =>
  (sheet?.mode === 'view' && sheet.itemId === itemId ? null : sheet)

type CarryRun = Pick<LubecGearMovesOptions, 'toast' | 'setSheet'> & { setBusy: (busy: boolean) => void }

async function runCarried({ toast, setSheet, setBusy }: CarryRun, { task, refused, failed, item, said }: LubecCarried) {
  setBusy(true)
  const r = await task().catch(() => ({ ok: false as const, msg: failed }))
  setBusy(false)
  if (!r.ok) return refused(r.msg)
  if (item) setSheet(withoutCardOf(item.id))
  if (said) toast.show(said)
}

// A write across records waits on its transaction, and the page shows "Moving..." and takes no other gear edit.
function useLubecGearCarry({ onDrop, toast, setSheet }: Pick<LubecGearMovesOptions, 'onDrop' | 'toast' | 'setSheet'>) {
  const [busy, setBusy] = useState(false)
  const carry: LubecGearCarryOut = (carried) => {
    if (!busy) void runCarried({ toast, setSheet, setBusy }, carried)
  }
  const drop: LubecDropIt = (item, refused, said, from) => {
    const task = from ?? (onDrop && (() => onDrop(item)))
    if (task) carry({ task, item, refused, failed: cannotDrop(item), said: said ?? lubecDroppedToast(item) })
  }
  return { busy, carry, drop }
}

type LetGo = { gear: LubecGear; change: ((gear: LubecGear) => void) | null; drop: LubecDropIt; toast: Toast; onAsk: LubecGearMovesOptions['onAsk'] }

// Letting go of a dragged thing: a drop, a refusal in the toast, or one commit with its toast.
// A heavy thing let go onto you asks its owner first (Rule E5).
function letGo({ gear, change, drop, toast, onAsk }: LetGo, it: LubecItem, hot: LubecDropTarget) {
  const r = lubecAskFirst(gear, lubecDragMove(gear, it, hot), onAsk, null)
  if (!r) return
  if (r.kind === 'drop') return drop(it, toast.show)
  if (r.kind === 'refused') return toast.show(r.msg)
  change?.(r.gear)
  toast.show(r.toast)
}

// Every gear edit waits while a move is being saved.
const heldWhile = (busy: boolean, onGearChange: LubecGearMovesOptions['onGearChange']) =>
  onGearChange && ((next: LubecGear) => { if (!busy) onGearChange(next) })

/**
 * The Gear page's moves: a move inside the character's own record is one
 * commit through `onGearChange`; a drop or a move across records waits on its
 * transaction and holds every other gear edit until it lands; and drag and drop
 * on the On you view (Rule M7) does either, by what it was let go on.
 */
export function useLubecGearMoves({ gear, onGearChange, onDrop, toast, setSheet, onAsk = null }: LubecGearMovesOptions) {
  const onYou = useRef<HTMLElement | null>(null)
  const { busy, carry, drop } = useLubecGearCarry({ onDrop, toast, setSheet })
  const change = heldWhile(busy, onGearChange)
  const spots = lubecPackLayout(useLubecPackCrop()).main
  const onLetGo = (it: LubecItem, hot: LubecDropTarget) => letGo({ gear, change, drop, toast, onAsk }, it, hot)
  const drag = useLubecDrag({ root: onYou, gear, spots, enabled: Boolean(change) && !busy, onStart: toast.hide, onLetGo })
  return { onYou, busy, change, drop, carry, drag }
}
