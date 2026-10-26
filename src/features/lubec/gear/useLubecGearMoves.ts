import { useRef, useState } from 'react'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecPackLayout } from './backpackSlots'
import type { LubecDropTarget } from './dragGeometry'
import { lubecDragMove } from './gearMoves'
import type { LubecItemSheetState } from './itemSheet'
import type { LubecGearDrop } from './lubecGearDrop'
import { lubecDroppedToast } from './moveLabels'
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
}

const cannotDrop = (item: LubecItem) => ({ ok: false as const, msg: `Could not drop ${item.name}. Nothing changed.` })

// The thing has left the sheet, so its card closes.
const withoutCardOf = (itemId: string) => (sheet: LubecItemSheetState | null) =>
  (sheet?.mode === 'view' && sheet.itemId === itemId ? null : sheet)

type DropRun = Pick<LubecGearMovesOptions, 'toast' | 'setSheet'> & { onDrop: Exclude<LubecGearDrop, null>; setBusy: (busy: boolean) => void }

async function runDrop({ onDrop, toast, setSheet, setBusy }: DropRun, item: LubecItem, refused: (msg: string) => void) {
  setBusy(true)
  const r = await onDrop(item).catch(() => cannotDrop(item))
  setBusy(false)
  if (!r.ok) return refused(r.msg)
  setSheet(withoutCardOf(item.id))
  toast.show(lubecDroppedToast(item))
}

// A drop crosses two records, so it waits on the transaction, and the page shows "Moving..." and takes no other gear edit.
function useLubecGearDrop({ onDrop, toast, setSheet }: Pick<LubecGearMovesOptions, 'onDrop' | 'toast' | 'setSheet'>) {
  const [busy, setBusy] = useState(false)
  const drop = (item: LubecItem, refused: (msg: string) => void) => {
    if (onDrop && !busy) void runDrop({ onDrop, toast, setSheet, setBusy }, item, refused)
  }
  return { busy, drop }
}

type LetGo = { gear: LubecGear; change: ((gear: LubecGear) => void) | null; drop: (item: LubecItem, refused: (msg: string) => void) => void; toast: Toast }

// Letting go of a dragged thing: a drop, a refusal in the toast, or one commit with its toast.
function letGo({ gear, change, drop, toast }: LetGo, it: LubecItem, hot: LubecDropTarget) {
  const r = lubecDragMove(gear, it, hot)
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
 * commit through `onGearChange`; a drop waits on `lubecMoveBetween` and holds
 * every other gear edit until it lands; and drag and drop on the On you view
 * (Rule M7) does either, by what it was let go on.
 */
export function useLubecGearMoves({ gear, onGearChange, onDrop, toast, setSheet }: LubecGearMovesOptions) {
  const onYou = useRef<HTMLElement | null>(null)
  const { busy, drop } = useLubecGearDrop({ onDrop, toast, setSheet })
  const change = heldWhile(busy, onGearChange)
  const spots = lubecPackLayout(useLubecPackCrop()).main
  const onLetGo = (it: LubecItem, hot: LubecDropTarget) => letGo({ gear, change, drop, toast }, it, hot)
  const drag = useLubecDrag({ root: onYou, gear, spots, enabled: Boolean(change) && !busy, onStart: toast.hide, onLetGo })
  return { onYou, busy, change, drop, drag }
}
