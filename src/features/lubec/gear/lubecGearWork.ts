// What the item sheet works on. On a sheet it is the character's gear, and the
// places of the shared carriers and of any hidden ones its viewer can see join
// its Move list. While a shared or hidden carrier's detail is open it is that
// carrier's record instead: its things, a change written as a one-record
// transaction, and a Move list that reaches the sheet. That view must never
// reach `onGearChange`, or a hidden carrier's contents would land on a document
// every member can read.

import type { LubecCarrierRecord, LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecHiddenAt, type LubecHiddenCarrier } from '../../ruleSets/lubec/gear/hiddenCarrier'
import { lubecNeedsStrength } from '../../ruleSets/lubec/gear/strengthCheck'
import { LUBEC_STALE_MOVE, type LubecRecordRef } from '../../ruleSets/lubec/gear/containers'
import { lubecCarrierView, type LubecSharedCarrier } from '../../ruleSets/lubec/gear/sharedCarrier'
import { lubecHiddenDrop, lubecSaveHiddenItems, type LubecGearHidden } from './lubecHiddenCarrierWrites'
import type { LubecMoveResult } from './lubecMoveTransaction'
import type { LubecSharedActs, LubecSharedSeat } from './lubecSharedSeat'
import type { LubecMoveGroup } from './moveLabels'
import { lubecCrossDest, lubecCrossToast, lubecFromCarrierGroups, lubecHiddenMoveGroups, lubecSharedMoveGroups, type LubecCrossDest } from './sharedCarrierLabels'
import type { LubecStrengthAsk } from './strengthAsk'
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
  /** The way to the character's hidden carriers, for its owner and the GM. */
  hidden?: LubecGearHidden | null
  /** The hidden carriers this viewer can see. */
  stashes?: readonly LubecHiddenCarrier[]
  /** The hidden carrier whose detail is open, or null. */
  stash?: LubecHiddenCarrier | null
  moves: Moves
  onAsk?: ((ask: LubecStrengthAsk) => void) | null
  toast: (text: string) => void
}

/** The shared carrier a view shows, or null. */
export const lubecOpenShared = (view: LubecGearView, shared: LubecSharedSeat | null): LubecSharedCarrier | null =>
  (view.name === 'carrier' && shared?.carriers.find((c) => c.id === view.carrierId)) || null

/** The hidden carrier a view shows, or null. */
export const lubecOpenHidden = (view: LubecGearView, stashes: readonly LubecHiddenCarrier[]): LubecHiddenCarrier | null =>
  (view.name === 'carrier' ? lubecHiddenAt(stashes, view.carrierId) : null)

type Acting = LubecGearWorkOptions & { acts: LubecSharedActs; carriers: readonly LubecSharedCarrier[]; stashes: readonly LubecHiddenCarrier[] }

/** A carrier's own record: what it is, where it is stored, and how a change and a drop reach it. */
type CarrierWork = {
  carrier: LubecCarrierRecord
  ref: LubecRecordRef
  hidden: boolean
  edit: (items: readonly LubecItem[]) => Promise<LubecMoveResult>
  dropIt: (item: LubecItem) => Promise<LubecMoveResult>
}

const hiddenRef = (hidden: LubecGearHidden, carrierId: string): LubecRecordRef => ({ kind: 'hidden', characterId: hidden.characterId, carrierId })

function destRecord(cross: LubecCrossDest, { acts, hidden }: Acting): LubecRecordRef {
  if (cross.to === 'sheet') return acts.sheet
  return cross.to === 'hidden' && hidden ? hiddenRef(hidden, cross.carrierId) : { kind: 'shared', carrierId: cross.carrierId }
}

// A heavy thing that comes onto the sheet arrives with no roll, and its owner is asked then (Rule E5).
const askOnArrival = ({ onAsk }: Acting, item: LubecItem, cross: LubecCrossDest) => {
  if (cross.to === 'sheet' && lubecNeedsStrength(item, cross.dest, item)) onAsk?.({ kind: 'pending', itemId: item.id })
}

// The thing another player moved first is about to leave this record, and its card with it, so the page says so rather than the card.
const refusedBy = (toast: Acting['toast'], refused: (msg: string) => void) => (msg: string) =>
  (msg === LUBEC_STALE_MOVE ? toast(msg) : refused(msg))

const moveAcross = (acting: Acting, from: LubecRecordRef) => (item: LubecItem, value: string, refused: (msg: string) => void) => {
  const { acts, gear, carriers, stashes, moves, toast } = acting
  const cross = lubecCrossDest(value)
  if (!cross) return false
  moves.carry({
    item,
    refused: refusedBy(toast, refused),
    said: lubecCrossToast(item, cross, gear, [...carriers, ...stashes]),
    failed: `Could not move ${item.name}. Nothing changed.`,
    task: async () => {
      const r = await acts.move(item, from, destRecord(cross, acting), cross.dest)
      if (r.ok) askOnArrival(acting, item, cross)
      return r
    },
  })
  return true
}

const onSheet = (acting: Acting): LubecGearWork => ({
  gear: acting.gear,
  change: acting.moves.change,
  drop: acting.moves.drop,
  inCarrier: false,
  across: {
    groups: (item) => lubecMoveGroups(acting.gear, item, [...lubecSharedMoveGroups(acting.carriers), ...lubecHiddenMoveGroups(acting.stashes)]),
    move: moveAcross(acting, acting.acts.sheet),
  },
})

// A change of the things in the carrier goes to its record, and a supply made on the way is the sheet's.
const changeCarrier = ({ gear, moves, toast }: Acting, { edit }: CarrierWork, view: LubecGear) => (next: LubecGear) => {
  if (next.supplies !== view.supplies) moves.change?.({ ...gear, supplies: next.supplies })
  if (next.items !== view.items) moves.carry({ task: () => edit(next.items), refused: toast, failed: 'Could not save that. Nothing changed.' })
}

const dropFrom = ({ moves, toast }: Acting, { dropIt }: CarrierWork): LubecDropIt => (item, refused, said) =>
  moves.drop(item, refusedBy(toast, refused), said, () => dropIt(item))

function inCarrier(acting: Acting, work: CarrierWork): LubecGearWork {
  const { carrier, ref, hidden } = work
  const view = lubecCarrierView(carrier, acting.gear.supplies)
  const from = { sheet: acting.gear, open: carrier, hidden, others: acting.carriers.filter((c) => c.id !== carrier.id), stashes: acting.stashes.filter((c) => c.id !== carrier.id) }
  return {
    gear: view,
    change: changeCarrier(acting, work, view),
    drop: dropFrom(acting, work),
    inCarrier: true,
    across: { groups: (item) => lubecFromCarrierGroups(from, item), move: moveAcross(acting, ref) },
  }
}

const sharedWork = (acts: LubecSharedActs, open: LubecSharedCarrier): CarrierWork => ({
  carrier: open,
  ref: { kind: 'shared', carrierId: open.id },
  hidden: false,
  edit: (items) => acts.editItems(open, items),
  dropIt: (item) => acts.drop(item, open.id),
})

const hiddenWork = (hidden: LubecGearHidden, stash: LubecHiddenCarrier): CarrierWork => ({
  carrier: stash,
  ref: hiddenRef(hidden, stash.id),
  hidden: true,
  edit: (items) => lubecSaveHiddenItems(hidden, stash, items),
  dropIt: lubecHiddenDrop(hidden, stash.id),
})

const NO_STASHES: readonly LubecHiddenCarrier[] = []

const carrierWorkOf = ({ acts, open, hidden, stash }: Acting): CarrierWork | null => {
  if (open) return sharedWork(acts, open)
  return hidden && stash ? hiddenWork(hidden, stash) : null
}

/** What the item sheet works on for this viewer: the character's gear, or the open shared or hidden carrier's. */
export function lubecGearWork(options: LubecGearWorkOptions): LubecGearWork {
  const { gear, moves, shared } = options
  if (!shared?.acts || !moves.change) return { gear, change: moves.change, drop: moves.drop, across: null, inCarrier: false }
  const acting = { ...options, acts: shared.acts, carriers: shared.carriers, stashes: options.stashes ?? NO_STASHES }
  const work = carrierWorkOf(acting)
  return work ? inCarrier(acting, work) : onSheet(acting)
}
