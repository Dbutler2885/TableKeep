// The add and edit form in the GM Items tab (spec 8.2): the player's form,
// with its "where it goes" left out, because a campaign item has no place.
// Its save is pure: the form in, the campaign item to write out, or the
// form's own refusal.

import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import { draftProblem } from '../../ruleSets/lubec/gear/stacks'
import { lubecDraftOf, lubecFieldPage } from '../gear/itemForm'
import { lubecAddSheet, lubecEditSheet, type LubecFormSheet } from '../gear/itemSheet'

// The form keeps a place it was opened at; an item with no place opens at the backpack and never uses it.
const NO_PLACE = 'backpack#0'

/** The form for a new campaign item. */
export const lubecLibraryAddSheet = (): LubecFormSheet => lubecAddSheet(NO_PLACE)

/** The form for editing a campaign item; Back returns to its card. */
export const lubecLibraryEditSheet = (item: LubecGmItem): LubecFormSheet => lubecEditSheet(item, NO_PLACE)

export type LubecLibrarySaved = { ok: true; item: LubecGmItem; toast: string } | { ok: false; msg: string; page: 'top' | 'kind' }

// An edit keeps when the item was first made, so it keeps its place in the picker's order.
const madeAt = (was: LubecGmItem | null) => (was && 'createdAt' in was ? { createdAt: was.createdAt } : {})

/** The form's Add it or Save: the form's own rules first, then the campaign item, a new one or `was` as edited. */
export function lubecSaveLibraryForm(form: LubecFormSheet, was: LubecGmItem | null, newId: () => string): LubecLibrarySaved {
  const draft = lubecDraftOf(form.fields)
  const problem = draftProblem(draft)
  if (problem) return { ok: false, msg: problem.msg, page: lubecFieldPage(problem.field) }
  const item = { ...draft, id: was?.id ?? newId(), status: 'library', ...madeAt(was) } as LubecGmItem & LubecItem
  return { ok: true, item, toast: was ? `Saved ${draft.name}.` : `${draft.name}: added to the campaign items.` }
}
