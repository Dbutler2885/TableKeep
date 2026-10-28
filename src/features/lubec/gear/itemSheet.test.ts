/** The item sheet's states and its save: the submit rules first, then the place, with the prototype's toasts. */
import { describe, expect, it } from 'vitest'
import { emptyLubecGear, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecWithMode } from './itemForm'
import { lubecAddSheet, lubecBackSheet, lubecCardSheet, lubecEditSheet, lubecFormNeedsStrength, lubecRefusedForm, lubecSaveForm, type LubecFormSheet } from './itemSheet'

const counter = () => {
  let n = 0
  return () => `id-${++n}`
}

const T = (id: string, extra: Partial<LubecItem> = {}): LubecItem =>
  ({ id, kind: 'thing', name: id, note: '', size: 1, weight: 'normal', qty: 1, per: 1, carrier: 'backpack', pocket: 0, ...extra })

const gearOf = (...items: LubecItem[]): LubecGear => ({ ...emptyLubecGear(), items })

const named = (form: LubecFormSheet, name: string, extra: Partial<LubecFormSheet['fields']> = {}): LubecFormSheet => ({ ...form, fields: { ...form.fields, name, ...extra } })

describe('the sheet\'s states', () => {
  it('opens the add form at a place, with where Back returns', () => {
    expect(lubecAddSheet('hands#1')).toMatchObject({ mode: 'form', editId: null, dest: 'hands#1', back: null, page: 0, error: null, browsing: null, fields: { dest: 'hands', size: 1 } })
    expect(lubecAddSheet('backpack#small', { mode: 'small' })).toMatchObject({ back: { mode: 'small' }, fields: { size: 0, dest: 'backpack#small' } })
  })

  it('opens the edit form from the item, returning to its card', () => {
    expect(lubecEditSheet(T('rope', { carrier: 'hands', slot: 1, pocket: undefined }), 'hands#1')).toMatchObject({ editId: 'rope', dest: 'hands#1', back: { mode: 'view', itemId: 'rope' }, fields: { name: 'rope', dest: 'hands' } })
  })

  it('goes back to the card, the small stuff list, or closes', () => {
    expect(lubecBackSheet({ mode: 'view', itemId: 'a' })).toEqual(lubecCardSheet('a'))
    expect(lubecBackSheet({ mode: 'small' })).toEqual({ mode: 'small' })
    expect(lubecBackSheet(null)).toBeNull()
  })
})

describe('saving the form', () => {
  it('adds a new item at the place it was opened, with the prototype\'s toast, and closes', () => {
    const saved = lubecSaveForm(gearOf(), named(lubecAddSheet('hands#1'), 'Rope'), counter())
    expect(saved).toEqual({ ok: true, toast: 'Rope: Right hand.', next: null, gear: gearOf({ ...T('id-1', { name: 'Rope' }), carrier: 'hands', slot: 1, pocket: undefined }) })
  })

  it('goes back to small stuff after adding a small thing there', () => {
    const saved = lubecSaveForm(gearOf(), named(lubecAddSheet('backpack#small', { mode: 'small' }), 'Key'), counter())
    expect(saved.ok && [saved.toast, saved.next]).toEqual(['Key: Backpack, small stuff.', { mode: 'small' }])
  })

  it('tries the place picked in "Put it" when it is not the one it was opened at', () => {
    const saved = lubecSaveForm(gearOf(), named(lubecAddSheet('hands#1'), 'Rope', { dest: 'body' }), counter())
    expect(saved.ok && saved.toast).toBe('Rope: Body slot.')
  })

  it('says how many stacks a count made', () => {
    const saved = lubecSaveForm(gearOf(), named(lubecAddSheet('backpack#0'), 'Rocks', { qty: '3' }), counter())
    expect(saved.ok && saved.toast).toBe('Rocks: 3 stacks, backpack, main pocket.')
  })

  it('saves an edit, returning to the item\'s card', () => {
    const rope = T('rope')
    const saved = lubecSaveForm(gearOf(rope), named(lubecEditSheet(rope, 'backpack#0'), 'Long rope'), counter())
    expect(saved.ok && [saved.toast, saved.next, saved.gear.items[0].name]).toEqual(['Saved Long rope.', lubecCardSheet('rope'), 'Long rope'])
    const more = lubecSaveForm(gearOf(rope), named(lubecEditSheet(rope, 'backpack#0'), 'Rope', { qty: '3' }), counter())
    expect(more.ok && more.toast).toBe('Saved Rope, and 2 more stacks.')
    const one = lubecSaveForm(gearOf(rope), named(lubecEditSheet(rope, 'backpack#0'), 'Rope', { qty: '2' }), counter())
    expect(one.ok && one.toast).toBe('Saved Rope, and 1 more stack.')
  })

  it('refuses with the submit rules first, naming the page they point at', () => {
    expect(lubecSaveForm(gearOf(), lubecAddSheet('backpack#0'), counter())).toEqual({ ok: false, msg: 'Give it a name.', page: 'top' })
    const gun = lubecSaveForm(gearOf(), { ...lubecAddSheet('backpack#0'), fields: lubecWithMode({ ...lubecAddSheet('backpack#0').fields, kind: 'weapon', name: 'Gun' }, 'firearm') }, counter())
    expect(gun).toEqual({ ok: false, msg: "Pick the ammo it takes. If it isn't on the list, make a supply.", page: 'kind' })
  })

  it('refuses a place the placement rule refuses, on no page in particular, for a new item and an edit', () => {
    const full = gearOf(T('a', { carrier: 'body', slot: 0, pocket: undefined }), T('b', { carrier: 'body', slot: 1, pocket: undefined }))
    expect(lubecSaveForm(full, named(lubecAddSheet('body'), 'Hat'), counter())).toEqual({ ok: false, msg: 'Both body slots are full.' })
    const rope = T('rope')
    expect(lubecSaveForm(gearOf(rope), named(lubecEditSheet(rope, 'backpack#0'), 'Rope', { dest: 'backpack#1', size: 2 }), counter())).toEqual({
      ok: false, msg: 'Front pocket, left takes things up to 1 slot. This one is 2.',
    })
  })
})

describe('saving a heavy thing onto you (Rule E5)', () => {
  const anvil = (dest: string, extra: Partial<LubecFormSheet['fields']> = {}) => named(lubecAddSheet(dest), 'Small anvil', { weight: 'heavy', ...extra })

  it('asks for a Strength roll for a heavy thing added onto you, and not for a normal one', () => {
    expect(lubecFormNeedsStrength(gearOf(), anvil('backpack#0'))).toBe(true)
    expect(lubecFormNeedsStrength(gearOf(), anvil('hands#0', { weight: 'extra' }))).toBe(true)
    expect(lubecFormNeedsStrength(gearOf(), named(lubecAddSheet('backpack#0'), 'Rope'))).toBe(false)
  })

  it('asks again on an edit only when the weight on you changes', () => {
    const block = T('block', { weight: 'heavy', check: 'fail' })
    expect(lubecFormNeedsStrength(gearOf(block), named(lubecEditSheet(block, 'backpack#0'), 'Cinder block'))).toBe(false)
    expect(lubecFormNeedsStrength(gearOf(block), named(lubecEditSheet(block, 'backpack#0'), 'block', { weight: 'extra' }))).toBe(true)
  })

  it('records the roll on every stack it adds', () => {
    const saved = lubecSaveForm(gearOf(), anvil('backpack#0', { qty: '2' }), counter(), 'fail')
    expect(saved.ok && saved.gear.items.map((i) => i.check)).toEqual(['fail', 'fail'])
  })

  it('replaces the roll recorded before when an edit asks again, and keeps it when it does not', () => {
    const block = T('block', { weight: 'heavy', check: 'fail' })
    const heavier = lubecSaveForm(gearOf(block), named(lubecEditSheet(block, 'backpack#0'), 'block', { weight: 'extra' }), counter(), 'pass')
    expect(heavier.ok && heavier.gear.items[0].check).toBe('pass')
    const unasked = lubecSaveForm(gearOf(block), named(lubecEditSheet(block, 'backpack#0'), 'block', { weight: 'extra' }), counter())
    expect(unasked.ok && unasked.gear.items[0]).not.toHaveProperty('check')
    const renamed = lubecSaveForm(gearOf(block), named(lubecEditSheet(block, 'backpack#0'), 'Cinder block'), counter())
    expect(renamed.ok && renamed.gear.items[0].check).toBe('fail')
  })
})

describe('a refused save', () => {
  it('keeps the form with the refusal, turning a phone to the page it points at', () => {
    const form = { ...lubecAddSheet('backpack#0'), fields: { ...lubecAddSheet('backpack#0').fields, kind: 'weapon' as const }, page: 2 }

    expect(lubecRefusedForm(form, { msg: 'Pick at least one wound.', page: 'kind' }, true)).toMatchObject({ error: 'Pick at least one wound.', page: 1 })
    expect(lubecRefusedForm(form, { msg: 'Name it.', page: 'top' }, false)).toMatchObject({ error: 'Name it.', page: 2 })
    expect(lubecRefusedForm(form, { msg: 'No room there.' }, true)).toMatchObject({ error: 'No room there.', page: 2 })
  })
})
