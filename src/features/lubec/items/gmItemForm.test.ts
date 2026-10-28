/**
 * The GM's add and edit form (spec 8.2): the player's form and its rules,
 * saving a campaign item, which has no place.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import { lubecLibraryAddSheet, lubecLibraryEditSheet, lubecSaveLibraryForm } from './gmItemForm'

const lantern = parseLubecGmItem({
  id: 'lantern', kind: 'thing', name: 'Brass lantern', size: 2, qty: 1, weight: 'normal', note: 'Smells of kerosene.',
  status: 'library', createdAt: { seconds: 5, nanoseconds: 0 },
}, 'lantern')

describe('saving the form as a campaign item', () => {
  it('adds a new one under a new id, with no place', () => {
    const form = lubecLibraryAddSheet()
    const saved = lubecSaveLibraryForm({ ...form, fields: { ...form.fields, name: '  Harbor map ', note: 'Hand-drawn.' } }, null, () => 'new-1')

    expect(saved).toEqual({
      ok: true,
      toast: 'Harbor map: added to the campaign items.',
      item: { kind: 'thing', name: 'Harbor map', note: 'Hand-drawn.', size: 1, weight: 'normal', qty: 1, per: 1, id: 'new-1', status: 'library' },
    })
  })

  it('edits one in place, keeping when it was first made', () => {
    const form = lubecLibraryEditSheet(lantern)
    const saved = lubecSaveLibraryForm({ ...form, fields: { ...form.fields, weight: 'heavy' } }, lantern, () => 'unused')

    expect(saved.ok && saved.item).toMatchObject({ id: 'lantern', name: 'Brass lantern', weight: 'heavy', status: 'library', createdAt: { seconds: 5 } })
    expect(saved.ok && saved.toast).toBe('Saved Brass lantern.')
    expect(saved.ok && saved.item).not.toHaveProperty('carrier')
  })

  it('refuses what the player\'s form refuses, and says which page', () => {
    const form = lubecLibraryAddSheet()

    expect(lubecSaveLibraryForm(form, null, () => 'x')).toEqual({ ok: false, msg: expect.any(String), page: 'top' })
  })
})
