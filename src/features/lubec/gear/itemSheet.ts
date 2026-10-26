// The item sheet, copied from the inventory prototype (B's one item dialog):
// one sheet with four modes of the same shape, the card, small stuff, the
// add and edit form, and the stock picker, and B's "which piece?" prompt. These are its states and its
// save, pure: gear in, the next gear and B's toast out.

import { addLubecItem, editLubecItem } from '../../ruleSets/lubec/gear/addItem'
import type { LubecGear, LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { draftProblem } from '../../ruleSets/lubec/gear/stacks'
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

export type LubecItemSheetState =
  | { mode: 'view'; itemId: string; error: string | null }
  | { mode: 'small' }
  /** Which of the pieces of armor worn on a part to open, asked when there is more than one. */
  | { mode: 'pieces'; part: string }
  | LubecFormSheet

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

function saveEdit(gear: LubecGear, form: LubecFormSheet, editing: LubecItem, newId: () => string): LubecFormSaved {
  const draft = lubecDraftOf(form.fields)
  const edited = editLubecItem(gear, editing, destOf(form), draft, newId)
  if (!edited.ok) return edited
  return { ok: true, gear: edited.gear, toast: savedToast(draft.name, edited.extra), next: lubecCardSheet(editing.id) }
}

function saveNew(gear: LubecGear, form: LubecFormSheet, newId: () => string): LubecFormSaved {
  const added = addLubecItem(gear, destOf(form), lubecDraftOf(form.fields), newId)
  if (!added.ok) return added
  return { ok: true, gear: added.gear, toast: addedToast(added.first, added.stacks), next: lubecBackSheet(form.back) }
}

/** The form's Add it or Save: the submit rules first, so a phone turns to the page they point at, then the place. */
export function lubecSaveForm(gear: LubecGear, form: LubecFormSheet, newId: () => string): LubecFormSaved {
  const problem = draftProblem(lubecDraftOf(form.fields))
  if (problem) return { ok: false, msg: problem.msg, page: lubecFieldPage(problem.field) }
  const editing = gear.items.find((x) => x.id === form.editId)
  return editing ? saveEdit(gear, form, editing, newId) : saveNew(gear, form, newId)
}
