// The words of a shared carrier, and the Move list across records. B kept every
// carrier on one page, so its `destinationOptions` needed nothing more; here a
// shared carrier is a record of its own, so a place in it, seen from a sheet, and
// a place on the sheet, seen from it, each say which record they are in.

import { lubecCarrierGear } from '../../ruleSets/lubec/gear/containers'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecSharedCarrier } from '../../ruleSets/lubec/gear/sharedCarrier'
import { lubecCarrierDestinations, lubecCarrierWhere } from './carrierLabels'
import { whereText } from './gearLabels'
import { lubecDestinations, type LubecDestination } from './itemLabels'
import { lubecAwayFrom, LUBEC_ELSEWHERE, type LubecMoveGroup, type LubecMoveOption } from './moveLabels'

/** Who can get into a shared carrier (B's `accessText`): everyone. */
export const LUBEC_SHARED_ACCESS = 'The whole group'

/** The owner line when the owning character is gone, or is the GM's, whom a player never sees. */
export const LUBEC_SHARED_NO_OWNER = 'Someone at the table'

const SHARED = 'shared:'
const SHEET = 'sheet:'

/** A Move-list choice that leaves the record the thing is in. */
export type LubecCrossDest = { to: 'sheet'; dest: string } | { to: 'shared'; carrierId: string; dest: string }

/** The record and the place a Move-list choice names, or null for a place in the same record. */
export function lubecCrossDest(value: string): LubecCrossDest | null {
  if (value.startsWith(SHEET)) return { to: 'sheet', dest: value.slice(SHEET.length) }
  if (!value.startsWith(SHARED)) return null
  const dest = value.slice(SHARED.length)
  return { to: 'shared', carrierId: dest.split('#')[0], dest }
}

const leading = (prefix: string, places: readonly LubecDestination[]): LubecMoveOption[] =>
  places.map((p) => ({ ...p, value: `${prefix}${p.value}`, disabled: false }))

const sharedPlaces = (carriers: readonly LubecSharedCarrier[]): LubecMoveOption[] =>
  carriers.flatMap((c) => leading(SHARED, lubecCarrierDestinations(lubecCarrierGear(c))))

/** The group a sheet's card adds to its Move list: every pocket of every shared carrier, or none. */
export const lubecSharedMoveGroups = (carriers: readonly LubecSharedCarrier[]): LubecMoveGroup[] =>
  (carriers.length ? [{ label: 'Shared carriers', options: sharedPlaces(carriers) }] : [])

type FromCarrier = { sheet: LubecGear; open: LubecSharedCarrier; others: readonly LubecSharedCarrier[] }

/** The Move list of a thing in a shared carrier: onto the sheet, into its personal carriers, to another pocket or carrier, or dropped. */
export function lubecFromCarrierGroups({ sheet, open, others }: FromCarrier, item: LubecItem): LubecMoveGroup[] {
  const personal = lubecCarrierDestinations(sheet)
  return [
    { label: 'On you', options: leading(SHEET, lubecDestinations(sheet, item.kind)) },
    ...(personal.length ? [{ label: 'Carriers', options: leading(SHEET, personal) }] : []),
    { label: 'Shared carriers', options: [...lubecAwayFrom(item, lubecCarrierDestinations(lubecCarrierGear(open))), ...sharedPlaces(others)] },
    LUBEC_ELSEWHERE,
  ]
}

const placeIn = (item: LubecItem, dest: string): LubecItem => {
  const [carrier, sub] = dest.split('#')
  const at = sub === undefined || sub === 'small' ? undefined : Number(sub)
  return { ...item, carrier, pocket: at ?? null, slot: at ?? 0 }
}

/** The toast after a move across records: where the thing is now, as a move on the sheet says it. */
export function lubecCrossToast(item: LubecItem, cross: LubecCrossDest, gear: LubecGear, carriers: readonly LubecSharedCarrier[]): string {
  const at = placeIn(item, cross.dest)
  if (cross.to === 'sheet') return `${item.name}: ${whereText(at, gear)}.`
  const carrier = carriers.find((c) => c.id === cross.carrierId)
  return `${item.name}: ${carrier ? lubecCarrierWhere(carrier, at.pocket) : 'moved'}.`
}

const thingsWord = (n: number) => `${n} thing${n === 1 ? '' : 's'}`

/** What the delete prompt says about what is in the carrier. */
export const lubecSharedDeleteText = (carrier: Pick<LubecSharedCarrier, 'items'>): string =>
  `${thingsWord(carrier.items.length)} in it will go to the GM's Items tab as dropped.`

/** The toast after a shared carrier is added. */
export const lubecSharedAddedToast = (c: Pick<LubecSharedCarrier, 'name'>): string => `${c.name} is shared with the table.`

/** The toast after a shared carrier is deleted. */
export const lubecSharedDeletedToast = (c: Pick<LubecSharedCarrier, 'name'>): string => `${c.name} deleted.`
