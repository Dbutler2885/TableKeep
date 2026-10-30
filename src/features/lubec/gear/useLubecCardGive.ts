import { useState } from 'react'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecCardSheet, LubecItemSheetState } from './itemSheet'
import { lubecGiveNote, type LubecGearGive, type LubecGiveTarget, type LubecOfferOut } from './lubecGive'
import type { LubecMoveResult } from './lubecMoveTransaction'

/** The card's Give button and what it opens: the panel, or the offer already out. */
export type LubecCardGive = {
  targets: readonly LubecGiveTarget[]
  /** True while the Give panel is open. */
  open: boolean
  /** True while an offer is being made or called off. */
  busy: boolean
  offered: LubecOfferOut | null
  /** The line shown before offering, or null. */
  note: string | null
  onToggle: () => void
  onOffer: (target: LubecGiveTarget, qty: number) => void
  onCancel: (offerId: string) => void
}

type CardContext = {
  sheet: LubecCardSheet
  item: LubecItem
  onSheet: (sheet: LubecItemSheetState | null) => void
  toast: (text: string) => void
}

type GiveRun = { setBusy: (busy: boolean) => void; refused: (msg: string) => void }

// An offer waits on the sheet's save and then the database, so the card says so and takes no second press.
async function runGive({ setBusy, refused }: GiveRun, step: () => Promise<LubecMoveResult>, done: () => void) {
  setBusy(true)
  const r = await step()
  setBusy(false)
  if (r.ok) done()
  else refused(r.msg)
}

/** The card's Give, for a viewer who may give things away; null for anyone else. */
export function useLubecCardGive(give: LubecGearGive | null, { sheet, item, onSheet, toast }: CardContext): LubecCardGive | null {
  const [busy, setBusy] = useState(false)
  if (!give) return null
  const run = { setBusy, refused: (msg: string) => onSheet({ ...sheet, error: msg }) }
  return {
    targets: give.targets,
    open: sheet.give === true,
    busy,
    offered: give.offerOf(item.id),
    note: lubecGiveNote(item, give.hiddenCarriers),
    onToggle: () => onSheet({ ...sheet, error: null, move: false, takeout: false, give: !sheet.give }),
    onOffer: (target, qty) => void runGive(run, () => give.offer(item, target, qty), () => {
      onSheet(null)
      toast(`Offered ${item.name} to ${target.name}.`)
    }),
    onCancel: (offerId) => void runGive(run, () => give.cancel(offerId), () => onSheet({ ...sheet, error: null })),
  }
}
