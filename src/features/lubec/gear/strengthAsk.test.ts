/**
 * What the Strength prompt asks about and what its Done does (Rule E5, spec
 * 5.5), from the gear as it is when Done is pressed: the add form's save, a
 * move onto you from a carrier, and a thing that came with no roll.
 */
import { describe, expect, it, vi } from 'vitest'
import { parseLubecGear, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecCardMove, lubecDragMove, lubecHeavyMove, type LubecGearMove } from './gearMoves'
import { lubecAddSheet, lubecCardSheet, type LubecFormSheet } from './itemSheet'
import { lubecAskedThing, lubecAskFirst, lubecPendingAsk, lubecStrengthDone, type LubecStrengthAsk } from './strengthAsk'

const counter = () => {
  let n = 0
  return () => `id-${++n}`
}

const CAR = { id: 'car', name: 'Family car', type: 'car', pockets: [{ name: 'Trunk', slots: 200, max: 8 }] }

const I = (id: string, carrier: string, name: string, extra: Partial<LubecItem> = {}) =>
  ({ id, kind: 'thing', name, note: '', size: 1, qty: 1, weight: 'normal', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: 0 } : { pocket: 0 }), ...extra })

const gearOf = (...items: unknown[]): LubecGear => parseLubecGear({ items, carriers: [CAR] })

const anvilInCar = () => gearOf(I('anvil', 'car', 'Small anvil', { weight: 'heavy' }))
const anchorInCar = () => gearOf(I('anchor', 'car', 'Mushroom anchor', { weight: 'extra' }))
const byId = (gear: LubecGear, id: string) => gear.items.find((x) => x.id === id) as LubecItem

const formFor = (name: string, weight: LubecItem['weight'], dest = 'backpack#0'): LubecFormSheet => {
  const form = lubecAddSheet(dest)
  return { ...form, fields: { ...form.fields, name, weight } }
}

const moveAsk = (itemId: string, card = lubecCardSheet(itemId)): LubecStrengthAsk =>
  ({ kind: 'move', move: { itemId, dest: 'backpack#0', cells: null }, card: card as Extract<LubecStrengthAsk, { kind: 'move' }>['card'] })

describe('a move onto you from a carrier', () => {
  it('asks before a heavy thing comes onto you, by the card or by a drag, and moves a normal thing at once', () => {
    const gear = anvilInCar()
    expect(lubecCardMove(gear, byId(gear, 'anvil'), 'backpack#0')).toEqual({ kind: 'ask', move: { itemId: 'anvil', dest: 'backpack#0', cells: null } })
    expect(lubecDragMove(gear, byId(gear, 'anvil'), { ok: true, dest: 'hands', cells: null } as never)).toMatchObject({ kind: 'ask', move: { dest: 'hands' } })
    const rope = gearOf(I('rope', 'car', 'Rope'))
    expect(lubecCardMove(rope, byId(rope, 'rope'), 'backpack#0')).toMatchObject({ kind: 'done' })
  })

  it('refuses a place that has no room before anyone rolls', () => {
    const gear = gearOf(I('anvil', 'car', 'Small anvil', { weight: 'heavy' }), I('oar', 'hands', 'Oar', { size: 2 }))
    expect(lubecCardMove(gear, byId(gear, 'anvil'), 'hands')).toMatchObject({ kind: 'refused' })
  })

  it('moves with the roll recorded, or with none when nobody was asked', () => {
    const passed = lubecHeavyMove(anvilInCar(), { itemId: 'anvil', dest: 'hands', cells: null }, 'pass')
    expect(passed).toMatchObject({ kind: 'done', toast: 'Small anvil: Both hands.' })
    expect(passed.kind === 'done' && byId(passed.gear, 'anvil')).toMatchObject({ carrier: 'hands', check: 'pass' })
    const unasked = lubecHeavyMove(anvilInCar(), { itemId: 'anvil', dest: 'hands', cells: null }, null)
    expect(unasked.kind === 'done' && byId(unasked.gear, 'anvil')).not.toHaveProperty('check')
    expect(lubecHeavyMove(anvilInCar(), { itemId: 'gone', dest: 'hands', cells: null }, 'pass')).toEqual({ kind: 'refused', msg: 'That is not on this sheet any more.' })
  })
})

describe('asking first', () => {
  const ask: LubecGearMove = { kind: 'ask', move: { itemId: 'anvil', dest: 'hands', cells: null } }

  it('passes any other move through as it came', () => {
    const drop: LubecGearMove = { kind: 'drop' }
    expect(lubecAskFirst(anvilInCar(), drop, vi.fn(), null)).toBe(drop)
  })

  it('puts a heavy move to the owner, from the card it was asked on, and moves nothing yet', () => {
    const onAsk = vi.fn()
    expect(lubecAskFirst(anvilInCar(), ask, onAsk, lubecCardSheet('anvil') as never)).toBeNull()
    expect(onAsk).toHaveBeenCalledExactlyOnceWith({ kind: 'move', move: { itemId: 'anvil', dest: 'hands', cells: null }, card: lubecCardSheet('anvil') })
  })

  it('moves it with no roll when nobody is asked', () => {
    expect(lubecAskFirst(anvilInCar(), ask, null, null)).toMatchObject({ kind: 'done' })
  })
})

describe('what the prompt asks about', () => {
  it('names the form\'s thing, or the thing moved or waiting, until it has left the sheet', () => {
    const gear = anvilInCar()
    expect(lubecAskedThing(gear, { kind: 'form', form: formFor('Cinder block', 'heavy') })).toMatchObject({ name: 'Cinder block', weight: 'heavy' })
    expect(lubecAskedThing(gear, moveAsk('anvil'))).toMatchObject({ name: 'Small anvil' })
    expect(lubecAskedThing(gear, { kind: 'pending', itemId: 'anvil' })).toMatchObject({ name: 'Small anvil' })
    expect(lubecAskedThing(gear, { kind: 'pending', itemId: 'gone' })).toBeNull()
  })

  it('asks about the first heavy thing on you that came with no roll, skipping the one just answered', () => {
    const gear = gearOf(I('a', 'backpack', 'Small anvil', { weight: 'heavy' }), I('b', 'body', 'Lead pipe', { weight: 'heavy' }))
    expect(lubecPendingAsk(gear)).toEqual({ kind: 'pending', itemId: 'a' })
    expect(lubecPendingAsk(gear, 'a')).toEqual({ kind: 'pending', itemId: 'b' })
    expect(lubecPendingAsk(anvilInCar())).toBeNull()
  })
})

describe('Done', () => {
  it('does nothing once the thing has left the sheet', () => {
    expect(lubecStrengthDone(anvilInCar(), { kind: 'pending', itemId: 'gone' }, 'failure', counter())).toEqual({ next: null })
  })

  it('adds the form\'s heavy thing with the roll, closing the form with its toast', () => {
    const a = lubecStrengthDone(gearOf(), { kind: 'form', form: formFor('Cinder block', 'heavy') }, 'failure', counter())
    expect(a).toMatchObject({ sheet: null, toast: 'Cinder block: Backpack, main pocket.' })
    expect(a.gear?.items).toMatchObject([{ name: 'Cinder block', check: 'fail', carrier: 'backpack', pocket: 0 }])
  })

  it('keeps the form open with B\'s words when an extra heavy thing fails, adding nothing', () => {
    const form = formFor('Mushroom anchor', 'extra')
    expect(lubecStrengthDone(gearOf(), { kind: 'form', form }, 'failure', counter())).toEqual({
      sheet: { ...form, error: "Strength failed: you can't carry Mushroom anchor. Pick a carrier." },
    })
  })

  it('keeps the form open with the refusal when the place filled up while the prompt was open', () => {
    const form = formFor('Cinder block', 'heavy', 'body')
    const full = gearOf(I('a', 'body', 'Rain slicker', { slot: 0 }), I('b', 'body', 'Pocketknife', { slot: 1 }))
    expect(lubecStrengthDone(full, { kind: 'form', form }, 'success', counter())).toEqual({ sheet: { ...form, error: 'Both body slots are full.' } })
  })

  it('moves the thing with the roll, and the card it was asked on shows where it is now', () => {
    const a = lubecStrengthDone(anvilInCar(), moveAsk('anvil'), 'success', counter())
    expect(a).toMatchObject({ toast: 'Small anvil: Backpack, main pocket.', sheet: { mode: 'view', itemId: 'anvil', error: null, move: false } })
    expect(byId(a.gear as LubecGear, 'anvil')).toMatchObject({ carrier: 'backpack', check: 'pass' })
    const dragged = lubecStrengthDone(anvilInCar(), moveAsk('anvil', null as never), 'failure', counter())
    expect(dragged.sheet).toBeUndefined()
    expect(byId(dragged.gear as LubecGear, 'anvil').check).toBe('fail')
  })

  it('says why a move could no longer be made, on the card or in the toast', () => {
    const full = gearOf(I('anvil', 'car', 'Small anvil', { weight: 'heavy' }), ...[0, 1, 2, 3, 4].map((k) => I(`r${k}`, 'backpack', `Rock ${k}`)))
    const msg = 'Main pocket is full: 0 of 5 free, and this needs 1.'
    expect(lubecStrengthDone(full, moveAsk('anvil'), 'success', counter())).toEqual({ sheet: { ...lubecCardSheet('anvil'), error: msg } })
    expect(lubecStrengthDone(full, moveAsk('anvil', null as never), 'success', counter())).toEqual({ toast: msg })
  })

  it('leaves an extra heavy thing that failed where it was, with B\'s words', () => {
    expect(lubecStrengthDone(anchorInCar(), moveAsk('anchor'), 'failure', counter())).toEqual({ toast: 'Too heavy. Mushroom anchor stays where it is.' })
  })

  it('records the roll on a thing that came with none, and asks about the next one waiting', () => {
    const gear = gearOf(I('a', 'backpack', 'Small anvil', { weight: 'heavy' }), I('b', 'body', 'Lead pipe', { weight: 'heavy' }))
    const a = lubecStrengthDone(gear, { kind: 'pending', itemId: 'a' }, 'failure', counter())
    expect(byId(a.gear as LubecGear, 'a').check).toBe('fail')
    expect(a.next).toEqual({ kind: 'pending', itemId: 'b' })
  })

  it('drops an extra heavy thing that came with no roll and failed, to the GM, and asks no more', () => {
    const gear = gearOf(I('a', 'hands', 'Mushroom anchor', { weight: 'extra' }))
    expect(lubecStrengthDone(gear, { kind: 'pending', itemId: 'a' }, 'failure', counter())).toEqual({
      drop: byId(gear, 'a'), toast: 'Too heavy to carry. Mushroom anchor is dropped where you are.', next: null,
    })
  })
})
