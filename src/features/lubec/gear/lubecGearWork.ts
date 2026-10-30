// What the item sheet works on. On a sheet it is the character's gear, and a
// shared carrier's places join its Move list. While a shared carrier's detail
// is open it is that carrier's record instead: its things, a change written as
// a one-record transaction, and a Move list that reaches the sheet.

import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { LUBEC_STALE_MOVE, type LubecRecordRef } from '../../ruleSets/lubec/gear/containers'
import { lubecCarrierView, type LubecSharedCarrier } from '../../ruleSets/lubec/gear/sharedCarrier'
import type { LubecSharedActs, LubecSharedSeat } from './lubecSharedSeat'
import type { LubecMoveGroup } from './moveLabels'
import { lubecCrossDest, lubecCrossToast, lubecFromCarrierGroups, lubecSharedMoveGroups, type LubecCrossDest } from './sharedCarrierLabels'
import type { LubecDropIt, LubecGearCarryOut } from './useLubecGearMoves'
import type { LubecGearView } from './useLubecCarriers'
import { lubecMoveGroups } from './moveLabels'

/** The moves that leave the record the sheet works on. */
export type LubecGearAcross = {
  /** The card's Move list for a thing. */
  groups: (item: LubecItem) => LubecMoveGroup[]
  /** Carries out a Move-list choice that leaves the record, or says it does not. */
  move: (item: LubecItem, value: string, refused: (msg: string) => void) => boolean
}

export type LubecGearWork = {
  gear: LubecGear
  change: ((gear: LubecGear) => void) | null
  drop: LubecDropIt
  across: LubecGearAcross | null
  /** True while the work is on a carrier's record, where "Put it" offers only its pockets and nobody is asked for a Strength roll. */
  inCarrier: boolean
}

type Moves = { change: LubecGearWork['change']; drop: LubecDropIt; carry: LubecGearCarryOut }

export type LubecGearWorkOptions = {
  gear: LubecGear
  shared: LubecSharedSeat | null
  /** The shared carrier whose detail is open, or null. */
  open: LubecSharedCarrier | null
  moves: Moves
  toast: (text: string) => void
}

/** The shared carrier a view shows, or null. */
export const lubecOpenShared = (view: LubecGearView, shared: LubecSharedSeat | null): LubecSharedCarrier | null =>
  (view.name === 'carrier' && shared?.carriers.find((c) => c.id === view.carrierId)) || null

type Acting = LubecGearWorkOptions & { acts: LubecSharedActs; carriers: readonly LubecSharedCarrier[] }

const destRecord = (cross: LubecCrossDest, acts: LubecSharedActs): LubecRecordRef =>
  (cross.to === 'sheet' ? acts.sheet : { kind: 'shared', carrierId: cross.carrierId })

// The thing another player moved first is about to leave this record, and its card with it, so the page says so rather than the card.
const refusedBy = (toast: Acting['toast'], refused: (msg: string) => void) => (msg: string) =>
  (msg === LUBEC_STALE_MOVE ? toast(msg) : refused(msg))

const moveAcross = ({ acts, gear, carriers, moves, toast }: Acting, from: LubecRecordRef) => (item: LubecItem, value: string, refused: (msg: string) => void) => {
  const cross = lubecCrossDest(value)
  if (!cross) return false
  moves.carry({
    item,
    refused: refusedBy(toast, refused),
    said: lubecCrossToast(item, cross, gear, carriers),
    failed: `Could not move ${item.name}. Nothing changed.`,
    task: () => acts.move(item, from, destRecord(cross, acts), cross.dest),
  })
  return true
}

const onSheet = (acting: Acting): LubecGearWork => ({
  gear: acting.gear,
  change: acting.moves.change,
  drop: acting.moves.drop,
  inCarrier: false,
  across: { groups: (item) => lubecMoveGroups(acting.gear, item, lubecSharedMoveGroups(acting.carriers)), move: moveAcross(acting, acting.acts.sheet) },
})

// A change of the things in the carrier goes to its record, and a supply made on the way is the sheet's.
const changeCarrier = ({ acts, gear, moves, toast }: Acting, open: LubecSharedCarrier, view: LubecGear) => (next: LubecGear) => {
  if (next.supplies !== view.supplies) moves.change?.({ ...gear, supplies: next.supplies })
  if (next.items !== view.items) moves.carry({ task: () => acts.editItems(open, next.items), refused: toast, failed: 'Could not save that. Nothing changed.' })
}

const dropFrom = ({ acts, moves, toast }: Acting, open: LubecSharedCarrier): LubecDropIt => (item, refused, said) =>
  moves.drop(item, refusedBy(toast, refused), said, () => acts.drop(item, open.id))

function inCarrier(acting: Acting, open: LubecSharedCarrier): LubecGearWork {
  const view = lubecCarrierView(open, acting.gear.supplies)
  const others = acting.carriers.filter((c) => c.id !== open.id)
  const from = { sheet: acting.gear, open, others }
  return {
    gear: view,
    change: changeCarrier(acting, open, view),
    drop: dropFrom(acting, open),
    inCarrier: true,
    across: { groups: (item) => lubecFromCarrierGroups(from, item), move: moveAcross(acting, { kind: 'shared', carrierId: open.id }) },
  }
}

/** What the item sheet works on for this viewer: the character's gear, or the open shared carrier's. */
export function lubecGearWork(options: LubecGearWorkOptions): LubecGearWork {
  const { gear, moves, shared, open } = options
  if (!shared?.acts || !moves.change) return { gear, change: moves.change, drop: moves.drop, across: null, inCarrier: false }
  const acting = { ...options, acts: shared.acts, carriers: shared.carriers }
  return open ? inCarrier(acting, open) : onSheet(acting)
}
