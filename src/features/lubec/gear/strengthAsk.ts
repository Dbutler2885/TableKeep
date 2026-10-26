// What the Strength prompt asks about and what its Done does, from the
// inventory prototype's call sites of `strengthPrompt` (B's `moveItem`, the
// add form's submit, and the card's switch). The roll itself is the Core
// roller's and is already recorded when Done is pressed; Done is a second
// commit, worked out from the gear as it is then (spec 3.3 and 5.5). Pure:
// the gear and the roll's outcome in, what the page commits and shows out.

import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecCheckOf, lubecStrengthPending, lubecWithCheck, type LubecCheck } from '../../ruleSets/lubec/gear/strengthCheck'
import { lubecHeavyMove, type LubecGearMove, type LubecHeavyMove } from './gearMoves'
import { lubecDraftOf } from './itemForm'
import { lubecSaveForm, type LubecCardSheet, type LubecFormSheet, type LubecItemSheetState } from './itemSheet'
import { lubecTooHeavyDropped, lubecTooHeavyToAdd, lubecTooHeavyToMove } from './strengthLabels'

/**
 * What the prompt asks for: the add or edit form's save, a move (from the
 * card it was asked on, if any), or a thing on you that came with no roll.
 */
export type LubecStrengthAsk =
  | { kind: 'form'; form: LubecFormSheet }
  | { kind: 'move'; move: LubecHeavyMove; card: LubecCardSheet | null }
  | { kind: 'pending'; itemId: string }

/**
 * What Done comes to: the next gear to commit, the item sheet to show (left
 * as it is when undefined), the toast, the thing to drop to the GM's Items
 * tab, and the next thing to ask about.
 */
export type LubecStrengthAnswer = {
  gear?: LubecGear
  sheet?: LubecItemSheetState | null
  toast?: string
  drop?: LubecItem
  next?: LubecStrengthAsk | null
}

const askedId = (ask: Exclude<LubecStrengthAsk, { kind: 'form' }>) => (ask.kind === 'move' ? ask.move.itemId : ask.itemId)

/** The thing the prompt asks about, or null once it has left the sheet. */
export function lubecAskedThing(gear: LubecGear, ask: LubecStrengthAsk): Pick<LubecItem, 'name' | 'weight'> | null {
  if (ask.kind === 'form') return lubecDraftOf(ask.form.fields)
  return gear.items.find((x) => x.id === askedId(ask)) ?? null
}

/**
 * A move that came back asking for a Strength roll is put to the owner, from
 * the card it was asked on, if any, and nothing moves yet (null). With nobody
 * to ask, it moves with no roll recorded, for its owner to make. Any other move is as it came.
 */
export function lubecAskFirst(
  gear: LubecGear, r: LubecGearMove, onAsk: ((ask: LubecStrengthAsk) => void) | null | undefined, card: LubecCardSheet | null,
): Exclude<LubecGearMove, { kind: 'ask' }> | null {
  if (r.kind !== 'ask') return r
  if (!onAsk) return lubecHeavyMove(gear, r.move, null)
  onAsk({ kind: 'move', move: r.move, card })
  return null
}

/** The first thing on you still waiting for its owner to roll, other than `skipId`, as a prompt; null when there is none. */
export function lubecPendingAsk(gear: LubecGear, skipId: string | null = null): LubecStrengthAsk | null {
  const item = lubecStrengthPending(gear).find((x) => x.id !== skipId)
  return item ? { kind: 'pending', itemId: item.id } : null
}

// The form saves with the roll, as the page's own Add it would; an extra heavy failure keeps it open with B's words.
function formAnswer(gear: LubecGear, form: LubecFormSheet, check: LubecCheck | null, newId: () => string): LubecStrengthAnswer {
  if (!check) return { sheet: { ...form, error: lubecTooHeavyToAdd(lubecDraftOf(form.fields)) } }
  const saved = lubecSaveForm(gear, form, newId, check)
  if (!saved.ok) return { sheet: { ...form, error: saved.msg } }
  return { gear: saved.gear, sheet: saved.next, toast: saved.toast }
}

// The move goes ahead with the roll; the card it was asked on shows where the thing is now, or why it could not go.
function moveAnswer(gear: LubecGear, ask: Extract<LubecStrengthAsk, { kind: 'move' }>, item: LubecItem, check: LubecCheck | null): LubecStrengthAnswer {
  if (!check) return { toast: lubecTooHeavyToMove(item) }
  const r = lubecHeavyMove(gear, ask.move, check)
  const card = ask.card
  if (r.kind === 'refused') return card ? { sheet: { ...card, error: r.msg } } : { toast: r.msg }
  return { gear: r.gear, toast: r.toast, sheet: card ? { ...card, error: null, move: false } : undefined }
}

// A thing already on you records the roll, and the next one waiting is asked; failing to carry an extra heavy one drops it.
function pendingAnswer(gear: LubecGear, item: LubecItem, check: LubecCheck | null): LubecStrengthAnswer {
  if (!check) return { drop: item, toast: lubecTooHeavyDropped(item), next: null }
  const next = lubecWithCheck(gear, item.id, check)
  return { gear: next, next: lubecPendingAsk(next, item.id) }
}

/** Done, after a roll that came out `outcome`: what the page commits and shows. Nothing, when the thing has gone. */
export function lubecStrengthDone(gear: LubecGear, ask: LubecStrengthAsk, outcome: 'success' | 'failure', newId: () => string): LubecStrengthAnswer {
  const thing = lubecAskedThing(gear, ask)
  if (!thing) return { next: null }
  const check = lubecCheckOf(thing, outcome)
  if (ask.kind === 'form') return formAnswer(gear, ask.form, check, newId)
  const item = thing as LubecItem
  return ask.kind === 'move' ? moveAnswer(gear, ask, item, check) : pendingAnswer(gear, item, check)
}
