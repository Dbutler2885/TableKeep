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

it('saves, parses and reopens a negative-Impact throwable, preserving unknown data and clearing obsolete fields', () => {
  const original = parseLubecGmItem({ kind: 'weapon', name: 'Kitchen knife', mode: 'melee', impact: 1, wounds: ['cut', 'pierce'], canThrow: true, thrownImpact: -1, thrownWound: 'pierce', catchChance: 10, catchPutsThrowerOut: true, ranges: [{ band: 'short', distance: 'Across the kitchen', modifier: 12 }], inscription: { text: 'WG' }, status: 'library', createdAt: { seconds: 5 } }, 'knife')
  const saved = lubecSaveLibraryForm(lubecLibraryEditSheet(original), original, () => 'unused')
  expect(saved.ok).toBe(true)
  if (!saved.ok) return
  const reopened = lubecLibraryEditSheet(parseLubecGmItem(saved.item, 'knife'))
  expect(reopened.fields).toMatchObject({ thrownImpact: '-1', thrownWound: 'pierce', catchChance: '10', ranges: [{ distance: 'Across the kitchen', modifier: '12' }] })
  expect(saved.item).toMatchObject({ inscription: { text: 'WG' }, createdAt: { seconds: 5 } })
  const disabled = lubecSaveLibraryForm({ ...reopened, fields: { ...reopened.fields, canThrow: false } }, saved.item, () => 'unused')
  expect(disabled.ok).toBe(true)
  if (!disabled.ok) return
  for (const key of ['canThrow', 'thrownImpact', 'thrownWound', 'catchChance', 'catchPutsThrowerOut', 'ranges']) expect(disabled.item).not.toHaveProperty(key)
  expect(disabled.item).toHaveProperty('inscription', { text: 'WG' })
})
