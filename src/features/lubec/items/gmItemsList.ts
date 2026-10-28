// What the GM Items tab shows (spec 8.2): the campaign items, which are the
// GM's library and the picker's "This campaign", and the dropped items, each
// in B's row and B's card. Pure: the stored items in, the lists, lines and
// facts out.

import { emptyLubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { KIND_NAMES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecGmItem, LubecGmItemStatus } from '../../ruleSets/lubec/gear/gmItem'
import type { LubecStockItem } from '../../ruleSets/lubec/gear/stock'
import { lubecSupplies } from '../../ruleSets/lubec/gear/supplies'
import { lubecCardFacts, type LubecCardFact } from '../gear/cardFacts'
import { qtyText, weightTagText } from '../gear/gearLabels'

/** Which of the two lists the chips show; 'all' shows both. */
export type LubecItemsFilter = 'all' | LubecGmItemStatus

export const LUBEC_ITEMS_GROUPS: Readonly<Record<LubecGmItemStatus, string>> = { library: 'Campaign items', dropped: 'Dropped' }

export type LubecItemsGroup = { status: LubecGmItemStatus; title: string; list: LubecGmItem[] }

const createdSeconds = (item: LubecGmItem): number => {
  const at = (item as { createdAt?: { seconds?: unknown } }).createdAt?.seconds
  // A write still on its way has no server time yet, and is the newest.
  return typeof at === 'number' ? at : Number.POSITIVE_INFINITY
}

/** The items in the order they were made, oldest first. */
export const lubecGmItemsOldestFirst = (items: readonly LubecGmItem[]): LubecGmItem[] =>
  [...items].sort((a, b) => createdSeconds(a) - createdSeconds(b))

/** The lists the chips show, each newest first: the campaign items, then the dropped items. */
export function lubecItemsGroups(items: readonly LubecGmItem[], filter: LubecItemsFilter): LubecItemsGroup[] {
  const newestFirst = lubecGmItemsOldestFirst(items).reverse()
  return (['library', 'dropped'] as const)
    .filter((status) => filter === 'all' || filter === status)
    .map((status) => ({ status, title: LUBEC_ITEMS_GROUPS[status], list: newestFirst.filter((item) => item.status === status) }))
}

/** "Dropped by Wayne Gardner, from the backpack." Who and where are each left out when the drop did not say. */
export function lubecDroppedLine(item: LubecGmItem): string {
  const who = item.droppedByCharacterName ? ` by ${item.droppedByCharacterName}` : ''
  const from = item.droppedFrom ? `, from ${item.droppedFrom}` : ''
  return `Dropped${who}${from}.`
}

/** The line under a row's name: who dropped it and from where, or where it came from. */
export const lubecItemsRowLine = (item: LubecGmItem): string =>
  (item.status === 'dropped' ? lubecDroppedLine(item) : item.stock ? `From stock: ${item.stock}` : 'Made by hand')

const sizeTag = (item: LubecItem) => (item.size === 0 ? 'Small' : `${item.size} slot${item.size > 1 ? 's' : ''}`)

/** A row's tags, in B's colors: the kind, the size, a heavy weight, and how many. */
export function lubecItemsRowTags(item: LubecGmItem): { text: string; tone: 'blue' | 'ghost' | 'red' }[] {
  const weight = weightTagText(item)
  const qty = qtyText(item)
  return [
    { text: KIND_NAMES[item.kind], tone: 'blue' },
    { text: sizeTag(item), tone: 'ghost' },
    ...(weight ? [{ text: weight, tone: 'red' as const }] : []),
    ...(qty ? [{ text: qty, tone: 'ghost' as const }] : []),
  ]
}

const NOBODY = { strength: null, handle: null }

// What a card works out from who carries it, which an item in the tab has nobody to say.
const CARRIER_FACTS = ['Penalty', 'Handle', 'Reload', 'Where']

// A fact as it reads off anyone: a weapon's minimum Strength without "Yours is", a supply without how much more is on you.
const offAnyone = ({ term, text }: LubecCardFact): LubecCardFact =>
  ({ term, text: term === 'Strength' ? text.replace(/ Yours is.*$/, '') : text.replace(/ \/ \d+ more on you$/, '') })

/**
 * The card's facts for an item in the tab, in B's order. It is on nobody, so
 * every fact reads as it does off you, the counts are read-only, and in place
 * of where it is on a sheet the card says which list it is in.
 */
export function lubecGmItemFacts(item: LubecGmItem): LubecCardFact[] {
  const gear = emptyLubecGear()
  const facts = lubecCardFacts(gear, item, lubecSupplies(gear), NOBODY).filter((f) => !CARRIER_FACTS.includes(f.term)).map(offAnyone)
  return [...facts, { term: 'Where', text: LUBEC_ITEMS_GROUPS[item.status] }]
}

/** The picker's "This campaign": the campaign items as stock entries, oldest first, as Rule T3's filter takes them. */
export const lubecLibraryStock = (items: readonly LubecGmItem[]): LubecStockItem[] =>
  lubecGmItemsOldestFirst(items.filter((item) => item.status === 'library')).map((item) => ({ ...item, sid: item.id }))
