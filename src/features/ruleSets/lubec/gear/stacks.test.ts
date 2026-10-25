/**
 * Stacks, the add form's submit rules and the used-up rule, against the
 * prototype's check 20 and its sample: the family car with its glove box, the
 * duffel bag, the D batteries and the .38 rounds.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, type LubecGear, type LubecItem } from './gearRecord'
import {
  clearUsedUp,
  draftProblem,
  draftStacks,
  isUsedUp,
  MAX_STACKS,
  perOf,
  placeStacks,
  slotsText,
  stackFull,
  stackMates,
  stacksOf,
  usedUp,
  type LubecItemDraft,
  type LubecPlaceRule,
} from './stacks'

// A stand-in for the placement rule that knows only pockets, enough to see where stacks go.
const pocketPlace: LubecPlaceRule = (gear, dest, item) => {
  const [cid, sub] = dest.split('#')
  const carrier = gear.carriers.find((c) => c.id === cid)
  if (!carrier) return { ok: false, msg: `No ${cid} here.` }
  const used = (k: number) => gear.items.filter((i) => i.carrier === cid && i.pocket === k).reduce((n, i) => n + i.size, 0)
  const order = sub != null ? [Number(sub)] : carrier.pockets.map((_, k) => k)
  for (const k of order) {
    const p = carrier.pockets[k]
    if (item.size <= p.max && used(k) + item.size <= p.slots) return { ok: true, carrier: cid, pocket: k }
  }
  return { ok: false, msg: `No pocket in ${carrier.name} has room for a ${item.size}-slot thing.` }
}

const car = {
  id: 'car', name: 'Family car, the Ford wagon', type: 'car',
  pockets: [{ name: 'Trunk and back seat', slots: 200, max: 8 }, { name: 'Glove box', slots: 2, max: 1 }],
}
const duffel = { id: 'duffel', name: "Dad's duffel bag", type: 'duffel', pockets: [{ name: 'Main', slots: 8, max: 8 }] }
const roadMap = { id: 'item-30', kind: 'thing', carrier: 'car', pocket: 1, name: 'Road map of Maine', size: 1, qty: 1, weight: 'normal', note: '' }
const batteries = {
  id: 'item-4', kind: 'consumable', carrier: 'car', pocket: 0, name: 'D batteries', size: 1, qty: 2, per: 4, fits: 'dcell', weight: 'normal',
  note: 'Spares for the flashlight.',
}
const sample = (): LubecGear => parseLubecGear({ carriers: [car, duffel], items: [roadMap, batteries] })
const destinations = ['car', 'car#0', 'car#1', 'car#small', 'duffel', 'duffel#0', 'duffel#small']
const placing = { place: pocketPlace, destinations }

const draft = (fields: Partial<LubecItemDraft>): LubecItemDraft =>
  ({ kind: 'thing', name: 'Arrows', note: '', size: 1, weight: 'normal', qty: 1, ...fields })

const item = (fields: Partial<LubecItem>): LubecItem =>
  ({ id: 'item-1', kind: 'thing', name: 'Thing', note: '', size: 1, weight: 'normal', qty: 1, carrier: 'backpack', pocket: 0, ...fields })

describe('stacks (Rule S3)', () => {
  it('splits 11 at 2 a slot into five of 2 and one of 1', () => {
    expect(stacksOf(11, 2, 1)).toEqual([2, 2, 2, 2, 2, 1])
    expect(draftStacks(draft({ kind: 'consumable', qty: 11, per: 2 }))).toEqual([2, 2, 2, 2, 2, 1])
  })

  it('splits 120 at 50 a slot into 50, 50 and 20, and 30 at 10 into three', () => {
    expect(stacksOf(120, 50, 1)).toEqual([50, 50, 20])
    expect(stacksOf(30, 10, 2)).toEqual([10, 10, 10])
  })

  it('keeps a count that fits in one slot as one stack', () => {
    expect(stacksOf(2, 4, 1)).toEqual([2])
    expect(stacksOf(4, 4, 1)).toEqual([4])
  })

  it('never splits small things (Rule S4)', () => {
    expect(stacksOf(30, 1, 0)).toEqual([30])
    expect(draftStacks(draft({ size: 0, qty: 12 }))).toEqual([12])
  })

  it('makes one stack of armor and of a holder, whatever the count', () => {
    expect(draftStacks(draft({ kind: 'armor', qty: 5, per: 1 }))).toEqual([1])
    expect(draftStacks(draft({ kind: 'holder', qty: 5, per: 1 }))).toEqual([1])
  })

  it('reads a draft with no number to a slot as 1 to a slot', () => {
    expect(draftStacks(draft({ qty: 3 }))).toEqual([1, 1, 1])
  })

  it('reads the number to a slot, or the whole count when none is set', () => {
    expect(perOf({ per: 50, qty: 20 })).toBe(50)
    expect(perOf({ qty: 12 })).toBe(12)
    expect(perOf({ qty: 0 })).toBe(1)
  })

  it('caps one add at 40 stacks', () => {
    expect(MAX_STACKS).toBe(40)
    expect(draftProblem(draft({ qty: 40, per: 1 }))).toBeNull()
    expect(draftProblem(draft({ qty: 41, per: 1 }))).toEqual({
      msg: 'That makes 41 stacks. Keep it to 40 or fewer, or fit more in each slot.',
      field: 'per',
    })
  })

  it('stops a stack\'s plus at its full size', () => {
    expect(stackFull(item({ qty: 1, per: 2 }))).toBeNull()
    expect(stackFull(item({ qty: 2, per: 2 }))).toBe('This stack is full: 2 fit in one slot. Add another stack for more.')
    expect(stackFull(item({ size: 2, qty: 10, per: 10 }))).toBe('This stack is full: 10 fit in 2 slots. Add another stack for more.')
    expect(stackFull(item({ size: 0, qty: 30, per: 1 }))).toBeNull()
    expect(stackFull(item({ qty: 30 }))).toBeNull()
  })

  it('names slots in the singular and plural', () => {
    expect(slotsText(1)).toBe('1 slot')
    expect(slotsText(8)).toBe('8 slots')
  })

  it('finds the stacks added together', () => {
    const a = item({ id: 'a', batch: 'b1' }), b = item({ id: 'b', batch: 'b1' }), c = item({ id: 'c' })
    expect(stackMates([a, b, c], a)).toEqual([a, b])
    expect(stackMates([a, b, c], c)).toEqual([c])
  })
})

describe('placing stacks (Rule S3)', () => {
  it('puts six arrow stacks in the car', () => {
    const plan = placeStacks(sample(), 'car#0', draft({ qty: 11, per: 2 }), stacksOf(11, 2, 1), placing)
    expect(plan).toEqual({ ok: true, list: Array.from({ length: 6 }, () => ({ ok: true, carrier: 'car', pocket: 0 })) })
  })

  it('refuses 30 comics at 1 a slot in the 8-slot duffel, and fits 30 at 10', () => {
    expect(placeStacks(sample(), 'duffel', draft({ name: 'Comics', qty: 30 }), stacksOf(30, 1, 1), placing)).toEqual({
      ok: false,
      msg: 'Only 8 of the 30 stacks fit there (8 slots). Put it somewhere roomier, or fit more in each slot.',
    })
    const plan = placeStacks(sample(), 'duffel', draft({ name: 'Comics', qty: 30, per: 10 }), stacksOf(30, 10, 1), placing)
    expect(plan.ok && plan.list.length).toBe(3)
  })

  it('spills flares from the glove box to the trunk', () => {
    const plan = placeStacks(sample(), 'car#1', draft({ name: 'Flares', qty: 3, per: 1 }), [1, 1, 1], placing)
    expect(plan.ok && plan.list.map((p) => `${p.carrier}#${p.pocket}`)).toEqual(['car#1', 'car#0', 'car#0'])
  })

  it('gives the place rule\'s own refusal when the first stack does not fit', () => {
    const full = parseLubecGear({ carriers: [duffel], items: [item({ carrier: 'duffel', size: 8 })] })
    expect(placeStacks(full, 'duffel', draft({ qty: 2 }), [1, 1], placing)).toEqual({
      ok: false,
      msg: 'No pocket in Dad\'s duffel bag has room for a 1-slot thing.',
    })
  })

  it('never spills into small stuff or another carrier', () => {
    const asked: string[] = []
    const watch: LubecPlaceRule = (gear, dest, one) => {
      asked.push(dest)
      return dest === 'car#1' ? pocketPlace(gear, dest, one) : { ok: false, msg: 'No.' }
    }
    placeStacks(sample(), 'car#1', draft({ qty: 3 }), [1, 1, 1], { place: watch, destinations })
    expect(asked).toEqual(['car#1', 'car#1', 'car', 'car#0'])
  })

  it('sets the edited item aside, so the D batteries edited to 10 at 4 make three stacks', () => {
    const tight = parseLubecGear({ carriers: [duffel], items: [{ ...batteries, carrier: 'duffel', pocket: 0, size: 8 }] })
    const edited = draft({ kind: 'consumable', name: 'D batteries', qty: 10, per: 4, size: 2 })
    expect(placeStacks(tight, 'duffel', edited, stacksOf(10, 4, 2), placing).ok).toBe(false)
    const plan = placeStacks(tight, 'duffel', edited, stacksOf(10, 4, 2), { ...placing, editingId: 'item-4' })
    expect(plan.ok && plan.list.length).toBe(3)
  })
})

describe('the add form\'s submit rules', () => {
  it('asks for a name first', () => {
    expect(draftProblem(draft({ name: '  ', qty: 0 }))).toEqual({ msg: 'Give it a name.', field: 'name' })
  })

  it('asks a weapon how it wounds, and a firearm for its ammo', () => {
    expect(draftProblem(draft({ kind: 'weapon', mode: 'melee', wounds: [] }))).toEqual({
      msg: 'Pick at least one way it wounds: cut, pierce, blunt or gun.',
      field: 'wounds',
    })
    expect(draftProblem(draft({ kind: 'weapon', mode: 'melee', wounds: ['blunt'] }))).toBeNull()
    expect(draftProblem(draft({ kind: 'weapon', mode: 'firearm', wounds: ['gun'] }))).toEqual({
      msg: "Pick the ammo it takes. If it isn't on the list, make a supply.",
      field: 'takes',
    })
    expect(draftProblem(draft({ kind: 'weapon', mode: 'firearm', wounds: ['gun'], takes: 'a38' }))).toBeNull()
  })

  it('asks armor where it covers, and a holder what it holds', () => {
    expect(draftProblem(draft({ kind: 'armor', locs: [] }))).toEqual({ msg: 'Pick at least one place it covers.', field: 'locs' })
    expect(draftProblem(draft({ kind: 'armor', locs: ['torso'] }))).toBeNull()
    expect(draftProblem(draft({ kind: 'holder' }))).toEqual({
      msg: "Pick what it holds. If it isn't on the list, make a supply.",
      field: 'takes',
    })
  })

  it('asks for at least one, and tells a consumable a used-up one leaves the sheet', () => {
    expect(draftProblem(draft({ qty: 0 }))).toEqual({ msg: 'How many? At least 1.', field: 'qty' })
    expect(draftProblem(draft({ kind: 'consumable', qty: 0 }))).toEqual({
      msg: 'How many? At least 1. A used-up one leaves the sheet.',
      field: 'qty',
    })
  })
})

describe('used up (Rule K4)', () => {
  const sandwich = item({ id: 'sandwich', kind: 'consumable', name: 'Sandwich', qty: 0 })
  const looseRounds = item({ id: 'rounds', kind: 'consumable', name: '.38 rounds', size: 0, pocket: null, fits: 'a38', qty: 0 })
  const box = item({ id: 'box', kind: 'holder', hold: 'box', name: 'Box of .38 rounds', takes: 'a38', capacity: 50, loaded: 0 })
  const flashlight = item({ id: 'flashlight', kind: 'holder', hold: 'load', name: 'Flashlight', takes: 'dcell', capacity: 2, loaded: 0 })
  const revolver = item({
    id: 'revolver', kind: 'weapon', mode: 'firearm', name: "Grandpa's revolver", carrier: 'hands', slot: 0, takes: 'a38', capacity: 6, loaded: 0,
  })
  const gear = parseLubecGear({ items: [sandwich, looseRounds, box, flashlight, revolver] })

  it('uses up a consumable at 0, and loose ammo at 0', () => {
    expect(isUsedUp(sandwich)).toBe(true)
    expect(isUsedUp(looseRounds)).toBe(true)
    expect(isUsedUp({ ...sandwich, qty: 1 })).toBe(false)
  })

  it('keeps a box, a holder and a firearm at 0', () => {
    expect([box, flashlight, revolver].map(isUsedUp)).toEqual([false, false, false])
    expect(clearUsedUp(gear).items.map((i) => i.id)).toEqual(['box', 'flashlight', 'revolver'])
  })

  it('takes a used-up item off the sheet, and nothing else', () => {
    expect(usedUp(gear, 'sandwich').items.map((i) => i.id)).toEqual(['rounds', 'box', 'flashlight', 'revolver'])
    expect(gear.items).toHaveLength(5)
  })
})
