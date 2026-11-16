import type { SheetEdit, SheetValue } from '../../character/characterStore/sheetIntentionTypes'
import { lubecDetachedItem, type LubecDetachedItem } from '../../ruleSets/lubec/gear/detachedItems'
import { parseLubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecHeldIn } from '../../ruleSets/lubec/gear/held'
import { assertLubecItemOwnership } from '../../ruleSets/lubec/gear/itemIdentity'
import { lubecDropWords, type LubecHand, type LubecWoundDrop } from '../../ruleSets/lubec/woundCards'
import type { CombatAttack, CombatState } from './engine/types'
import type { CombatWound } from './woundTypes'

// A wound's drop, carried out where the wound reaches the sheet: the thing the
// struck hand holds leaves the sheet and lands on the Floor in the same commit
// as the wound's cards, so the sheet and the Floor never both own it and a
// retried delivery finds the receipt instead of dropping twice. The hand is
// read as the sheet stands at delivery, before this wound's cards are added.

/** What the delivery takes out of the hand: the item's removal from the sheet, and the record that lands on the Floor. */
export type CombatPlannedDrop = { hand: LubecHand; held: string | null; edits: SheetEdit[]; detached: LubecDetachedItem | null }

type RawItem = { id: string; [key: string]: unknown }

const rawItemsOf = (raw: Record<string, unknown>): RawItem[] => {
  const items = ((raw.lubec as { gear?: { items?: unknown } } | undefined)?.gear?.items)
  return Array.isArray(items) ? items.filter((item): item is RawItem => typeof item === 'object' && item !== null && typeof (item as RawItem).id === 'string') : []
}

/** The whole stack in the struck hand, a two-handed thing included, comes off the sheet; an empty hand is nothing. */
export function planWoundDrop(raw: Record<string, unknown>, hand: LubecHand): CombatPlannedDrop {
  const gear = parseLubecGear((raw.lubec as { gear?: unknown } | undefined)?.gear)
  const item = lubecHeldIn(gear, hand)
  const stored = item && rawItemsOf(raw).find((entry) => entry.id === item.id)
  if (!item || !stored) return { hand, held: null, edits: [], detached: null }
  const removal: SheetEdit = { kind: 'remove', path: ['lubec', 'gear', 'items', { recordId: item.id }], base: { exists: true, value: stored as unknown as SheetValue } }
  // The Floor record is written whole into the fight; a parsed field left undefined has no place in it.
  const detached = JSON.parse(JSON.stringify(lubecDetachedItem(item, gear.supplies))) as LubecDetachedItem
  return { hand, held: item.name, edits: [removal], detached }
}

/** The drop as it came to be, for the Results and the cards' wound detail. */
export const deliveredDrop = (planned: CombatPlannedDrop, landed: LubecWoundDrop | undefined): LubecWoundDrop =>
  ({ ...landed, hand: planned.hand, held: planned.held })

/** The wound's Results line, rewritten from the drop it landed with to the drop it came to, on the attack that queued it. */
function withDropLine(attack: CombatAttack | null | undefined, wound: CombatWound, landed: string, delivered: string): CombatAttack | null | undefined {
  if (!attack || attack.woundId !== wound.id || !attack.rowSections) return attack
  const rowSections = attack.rowSections.map((section) => ({ ...section, items: section.items.map((item) => (item === landed ? delivered : item)) }))
  return { ...attack, rowSections }
}

/** The fight after the drop: the dropped record on the Floor, and the Results naming what fell. */
export function withWoundDrop(state: CombatState, wound: CombatWound, planned: CombatPlannedDrop): CombatState {
  const floor = planned.detached ? [...state.floor, planned.detached] : state.floor
  assertLubecItemOwnership(floor.map((record) => record.item))
  const landed = lubecDropWords(wound.drop ?? { hand: planned.hand })
  const delivered = lubecDropWords(deliveredDrop(planned, wound.drop))
  return {
    ...state, floor,
    attack: withDropLine(state.attack, wound, landed, delivered) ?? null,
    ...(state.lastAttack ? { lastAttack: withDropLine(state.lastAttack, wound, landed, delivered) ?? null } : {}),
  }
}
