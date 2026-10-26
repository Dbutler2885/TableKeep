// The item sheet, copied from the inventory prototype (B's one item dialog):
// one sheet with four modes of the same shape, the card, small stuff, the
// add and edit form, and the stock picker. These are its states and its
// save, pure: gear in, the next gear and B's toast out. A save that brings a
// heavy thing onto you carries the Strength roll it asked for (Rule E5).

import { addLubecItem, editLubecItem } from '../../ruleSets/lubec/gear/addItem'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { draftProblem, type LubecItemDraft } from '../../ruleSets/lubec/gear/stacks'
import { lubecNeedsStrength, type LubecCheck } from '../../ruleSets/lubec/gear/strengthCheck'
import { addedToast } from './gearLabels'
import { selectValue } from './itemLabels'
import { lubecDraftOf, lubecFieldPage, lubecFieldsOf, lubecNewFields, type LubecItemFields } from './itemForm'

/** Where the form's Back (or Cancel) returns: the card it was opened from, the small stuff list, or nowhere. */
export type LubecSheetBack = { mode: 'view'; itemId: string } | { mode: 'small' } | null

/** The form: a new item or one being edited, the place it was opened at, and what the player has filled in. */
export type LubecFormSheet = {
  mode: 'form'
  editId: string | null
  /** The place it was opened at, kept so the hand or pocket asked for is the one tried first. */
  dest: string
  back: LubecSheetBack
  fields: LubecItemFields
  /** The page shown on a phone. */
  page: number
  error: string | null
  /** The stock picker over the form, with the search it opened with; null while the form shows. */
  browsing: string | null
}

/** The card, with its Move panel open or not. */
export type LubecCardSheet = { mode: 'view'; itemId: string; error: string | null; move?: boolean }

export type LubecItemSheetState = LubecCardSheet | { mode: 'small' } | LubecFormSheet

export const lubecCardSheet = (itemId: string): LubecItemSheetState => ({ mode: 'view', itemId, error: null })

const formSheet = (dest: string, editId: string | null, back: LubecSheetBack, fields: LubecItemFields): LubecFormSheet =>
  ({ mode: 'form', editId, dest, back, fields, page: 0, error: null, browsing: null })

/** The add form, opened at `dest`. */
export const lubecAddSheet = (dest: string, back: LubecSheetBack = null): LubecFormSheet => formSheet(dest, null, back, lubecNewFields(selectValue(dest)))

/** The edit form for `item`, at `dest`, the place it is; Back returns to its card. */
export const lubecEditSheet = (item: LubecItem, dest: string): LubecFormSheet =>
  formSheet(dest, item.id, { mode: 'view', itemId: item.id }, lubecFieldsOf(item, selectValue(dest)))

/** Where the sheet goes back to, or null to close it. */
export const lubecBackSheet = (back: LubecSheetBack): LubecItemSheetState | null => (back?.mode === 'view' ? lubecCardSheet(back.itemId) : back)

export type LubecFormSaved =
  | { ok: true; gear: LubecGear; toast: string; next: LubecItemSheetState | null }
  | { ok: false; msg: string; page?: 'top' | 'kind' }

// The place asked for, unless the player picked another in "Put it".
const destOf = (form: LubecFormSheet) => (form.fields.dest === selectValue(form.dest) ? form.dest : form.fields.dest)

const savedToast = (name: string, extra: number) =>
  (extra ? `Saved ${name}, and ${extra} more stack${extra > 1 ? 's' : ''}.` : `Saved ${name}.`)

function saveEdit(gear: LubecGear, form: LubecFormSheet, editing: LubecItem, draft: LubecItemDraft, newId: () => string): LubecFormSaved {
  const edited = editLubecItem(gear, editing, destOf(form), draft, newId)
  if (!edited.ok) return edited
  return { ok: true, gear: edited.gear, toast: savedToast(draft.name, edited.extra), next: lubecCardSheet(editing.id) }
}

function saveNew(gear: LubecGear, form: LubecFormSheet, draft: LubecItemDraft, newId: () => string): LubecFormSaved {
  const added = addLubecItem(gear, destOf(form), draft, newId)
  if (!added.ok) return added
  return { ok: true, gear: added.gear, toast: addedToast(added.first, added.stacks), next: lubecBackSheet(form.back) }
}

// A save that asks for a Strength roll records its answer, or none yet, in place of the roll recorded before.
const unchecked = (i: LubecItem): LubecItem => Object.fromEntries(Object.entries(i).filter(([key]) => key !== 'check')) as LubecItem

// The draft the form saves, with the Strength roll it carries, if any.
const draftWith = (form: LubecFormSheet, check: LubecCheck | null): LubecItemDraft =>
  ({ ...lubecDraftOf(form.fields), ...(check ? { check } : {}) })

/**
 * The form's Add it or Save: the submit rules first, so a phone turns to the page they point at, then the place.
 * `check` is the Strength roll the save asked for, recorded on every stack it makes.
 */
export function lubecSaveForm(gear: LubecGear, form: LubecFormSheet, newId: () => string, check: LubecCheck | null = null): LubecFormSaved {
  const draft = draftWith(form, check)
  const problem = draftProblem(draft)
  if (problem) return { ok: false, msg: problem.msg, page: lubecFieldPage(problem.field) }
  const editing = gear.items.find((x) => x.id === form.editId)
  if (!editing) return saveNew(gear, form, draft, newId)
  return saveEdit(gear, form, lubecFormNeedsStrength(gear, form) ? unchecked(editing) : editing, draft, newId)
}

/** Rule E5: whether the form's save brings a heavy thing onto you, or makes one on you heavier, and so asks for a Strength roll first. */
export function lubecFormNeedsStrength(gear: LubecGear, form: LubecFormSheet): boolean {
  const was = gear.items.find((x) => x.id === form.editId) ?? null
  return lubecNeedsStrength(lubecDraftOf(form.fields), destOf(form), was)
}
