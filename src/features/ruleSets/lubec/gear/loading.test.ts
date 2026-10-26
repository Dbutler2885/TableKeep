/**
 * Supplies, loading and boxes (Rules K4, K5 and L1 to L9, spec 12.3), against
 * the prototype's checks 25 and 26: starting from Wayne Gardner's sample, the
 * revolver loads from the box once his other hand is free, unloads into it,
 * loads again from the loose rounds, which are used up, and the box gives and
 * takes rounds and stays when it is empty.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, type LubecGear, type LubecItem } from './gearRecord'
import {
  lubecBoxFill,
  lubecBoxFillPlan,
  lubecFill,
  lubecLandPlan,
  lubecLoadInto,
  lubecReload,
  lubecReloadAndFire,
  lubecReloadPlan,
  lubecUnload,
} from './loading'
import { LUBEC_SUPPLIES, lubecMakeSupply, lubecSupplies, lubecSupplyKey } from './supplies'

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Partial<LubecItem> = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

// Wayne Gardner's things on him, from the prototype's sample, with B's own ids.
const ON_HIM = [
  T('1', 'backpack', 0, 'Flashlight', 1, { kind: 'holder', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2 }),
  T('2', 'backpack', 0, 'Small anvil', 1, { weight: 'heavy', check: 'fail' }),
  T('3', 'backpack', 0, 'Peanut butter sandwich', 1, { kind: 'consumable', qty: 2, per: 2 }),
  T('4', 'backpack', 0, 'D batteries', 1, { kind: 'consumable', qty: 2, per: 4, fits: 'dcell' }),
  T('5', 'backpack', 0, 'Wool watch cap', 1),
  T('6', 'backpack', 1, 'Box of .38 rounds', 1, { kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 12 }),
  T('7', 'backpack', 2, 'Photocopied 1898 map', 1),
  T('36', 'backpack', null, 'Timex watch', 0),
  T('8', 'hands', 0, "Grandpa's revolver", 1, { kind: 'weapon', mode: 'firearm', impact: 1, wounds: ['gun'], capacity: 6, loaded: 0, takes: 'a38' }),
  T('9', 'hands', 1, 'Walkie-talkie', 1),
  T('10', 'body', 0, 'Rain slicker', 1),
  T('11', 'body', 1, 'Pocketknife', 0, { kind: 'weapon', mode: 'melee', wounds: ['cut', 'pierce'] }),
]
const CAR = { id: 'car', name: 'Family car, the Ford wagon', type: 'car', pockets: [{ name: 'Trunk and back seat', slots: 200, max: 8 }] }

const gearOf = (items: unknown[]): LubecGear => parseLubecGear({ items, carriers: [CAR] })
const sample = () => gearOf(ON_HIM)
const without = (gear: LubecGear, ...ids: string[]): LubecGear => ({ ...gear, items: gear.items.filter((i) => !ids.includes(i.id)) })
const withItem = (gear: LubecGear, item: unknown): LubecGear => ({ ...gear, items: [...gear.items, gearOf([item]).items[0]] })
const byId = (gear: LubecGear, id: string): LubecItem => gear.items.find((i) => i.id === id) as LubecItem
const has = (gear: LubecGear, id: string) => gear.items.some((i) => i.id === id)
const draws = (take: readonly (readonly [LubecItem, number])[]) => take.map(([i, n]) => [i.id, n])
const ids = (items: readonly LubecItem[]) => items.map((i) => i.id)
const SUPPLIES = LUBEC_SUPPLIES
let made = 0
const newId = () => `new-${++made}`

// The walkie-talkie dropped, so the revolver's other hand is empty to fetch rounds.
const handFree = () => without(sample(), '9')

describe('the reload plan (Rules L3 and L4)', () => {
  it('refuses while the other hand holds something else', () => {
    expect(lubecReloadPlan(sample(), byId(sample(), '8'))).toMatchObject({ ok: false, why: 'busy-hand', holds: { name: 'Walkie-talkie' } })
  })

  it('costs 3 actions with the rounds in the backpack, and fills to capacity', () => {
    const gear = handFree()
    const p = lubecReloadPlan(gear, byId(gear, '8'))
    expect(p).toMatchObject({ ok: true, have: 12, put: 6, n: 3, from: 'backpack' })
    expect(p.ok && draws(p.take)).toEqual([['6', 6]])
  })

  it('costs 1 action with them in the other hand and 2 on the body', () => {
    const inHand = withItem(handFree(), T('r', 'hands', 1, '.38 rounds', 0, { kind: 'consumable', qty: 6, fits: 'a38' }))
    expect(lubecReloadPlan(inHand, byId(inHand, '8'))).toMatchObject({ ok: true, n: 1, from: 'hands' })
    const onBody = withItem(without(handFree(), '10'), T('r', 'body', 0, '.38 rounds', 0, { kind: 'consumable', qty: 6, fits: 'a38' }))
    expect(lubecReloadPlan(onBody, byId(onBody, '8'))).toMatchObject({ ok: true, n: 2, from: 'body' })
  })

  it('draws the nearest first, and the farthest place drawn from sets the cost', () => {
    const gear = withItem(handFree(), T('r', 'hands', 1, '.38 rounds', 0, { kind: 'consumable', qty: 4, fits: 'a38' }))
    const p = lubecReloadPlan(gear, byId(gear, '8'))
    expect(p.ok && [draws(p.take), p.n, p.from]).toEqual([[['r', 4], ['6', 2]], 3, 'backpack'])
  })

  it('draws first from the box or stack the player loaded from (Rule L5)', () => {
    const gear = withItem(handFree(), T('r', 'hands', 1, '.38 rounds', 0, { kind: 'consumable', qty: 4, fits: 'a38' }))
    const p = lubecReloadPlan(gear, byId(gear, '8'), '6')
    expect(p.ok && [draws(p.take), p.n]).toEqual([[['6', 6]], 3])
  })

  it('does not count rounds in a carrier', () => {
    const gear = withItem(without(handFree(), '6'), T('c', 'car', 0, 'Box of .38 rounds', 1, { kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 50 }))
    expect(lubecReloadPlan(gear, byId(gear, '8'))).toEqual({ ok: false, why: 'none-on-you' })
  })

  it('refuses a thing out of hand, and one already full', () => {
    expect(lubecReloadPlan(sample(), byId(sample(), '1'))).toEqual({ ok: false, why: 'not-in-hand' })
    const gear = handFree()
    expect(lubecReloadPlan(gear, { ...byId(gear, '8'), loaded: 6 })).toEqual({ ok: false, why: 'full' })
  })

  it('loads a flashlight the same way, from batteries on you (Rule L4)', () => {
    const gear = { ...handFree(), items: handFree().items.map((i) => (i.id === '1' ? { ...i, carrier: 'hands', slot: 1, pocket: undefined, loaded: 0 } : i)) }
    const p = lubecReloadPlan(without(gear, '8'), byId(gear, '1'))
    expect(p.ok && [draws(p.take), p.n]).toEqual([[['4', 2]], 3])
  })
})

describe('loading (B check 25)', () => {
  it('loads the revolver from the box, which stays with 6 left', () => {
    const r = lubecReload(handFree(), byId(handFree(), '8'), '6')
    expect(r.ok && [byId(r.gear, '8').loaded, byId(r.gear, '6').loaded, r.item.loaded, ids(r.gone)]).toEqual([6, 6, 6, []])
  })

  it('uses up a loose stack it empties, and keeps a box it empties (Rules K4, K5)', () => {
    const gear = withItem(handFree(), T('r', 'hands', 1, '.38 rounds', 0, { kind: 'consumable', qty: 6, fits: 'a38' }))
    const r = lubecReload(gear, byId(gear, '8'), 'r')
    expect(r.ok && [byId(r.gear, '8').loaded, has(r.gear, 'r'), ids(r.gone)]).toEqual([6, false, ['r']])
    const box = { ...handFree(), items: handFree().items.map((i) => (i.id === '6' ? { ...i, loaded: 4 } : i)) }
    const emptied = lubecReload(box, byId(box, '8'))
    expect(emptied.ok && [byId(emptied.gear, '8').loaded, byId(emptied.gear, '6').loaded]).toEqual([4, 0])
  })

  it('changes nothing when it refuses', () => {
    expect(lubecReload(sample(), byId(sample(), '8'))).toMatchObject({ ok: false, why: 'busy-hand' })
  })
})

describe('Reload and fire (Rule L9)', () => {
  it('loads, fires and uses a round in one action', () => {
    const r = lubecReloadAndFire(handFree(), byId(handFree(), '8'))
    expect(r.ok && [byId(r.gear, '8').loaded, byId(r.gear, '6').loaded, r.item.loaded]).toEqual([5, 6, 5])
  })

  it('stops where loading stops', () => {
    expect(lubecReloadAndFire(sample(), byId(sample(), '8'))).toMatchObject({ ok: false, why: 'busy-hand' })
  })

  it('stops a holder, which loads but cannot fire', () => {
    const gear = { ...handFree(), items: without(handFree(), '8').items.map((i) => (i.id === '1' ? { ...i, carrier: 'hands', slot: 0, loaded: 0 } : i)) }
    expect(lubecReloadAndFire(gear, byId(gear, '1'))).toEqual({ ok: false, why: 'gone' })
  })
})

describe('what loads from a supply (Rule L5)', () => {
  it('is a gun or a loaded holder on you that takes it, never another box', () => {
    expect(ids(lubecLoadInto(sample(), byId(sample(), '6')))).toEqual(['8'])
    expect(ids(lubecLoadInto(sample(), byId(sample(), '4')))).toEqual(['1'])
    const two = withItem(sample(), T('900', 'backpack', null, 'Derringer', 0, { kind: 'weapon', mode: 'firearm', wounds: ['gun'], capacity: 2, loaded: 0, takes: 'a38' }))
    expect(ids(lubecLoadInto(two, byId(two, '6')))).toEqual(['8', '900'])
    const parked = withItem(two, T('901', 'car', 0, 'Rifle', 2, { kind: 'weapon', mode: 'firearm', wounds: ['gun'], capacity: 5, takes: 'a38' }))
    expect(ids(lubecLoadInto(parked, byId(parked, '6')))).toEqual(['8', '900'])
  })
})

describe('unloading (Rule L6)', () => {
  const loadedGun = () => {
    const r = lubecReload(handFree(), byId(handFree(), '8'), '6')
    if (!r.ok) throw new Error('the revolver did not load')
    return r.gear
  }

  it('lands the rounds loose in the free hand, free, when that is cheaper than the box', () => {
    const gear = loadedGun()
    const r = lubecUnload(gear, byId(gear, '8'), 6, SUPPLIES, newId)
    expect(r.ok && r.plan).toMatchObject({ pour: false, cost: 0, placed: { carrier: 'hands', slot: 1 } })
    const loose = r.ok ? r.gear.items.find((i) => i.kind === 'consumable' && i.fits === 'a38') : undefined
    expect([byId(r.ok ? r.gear : gear, '8').loaded, loose && [loose.name, loose.qty, loose.size, loose.carrier, loose.slot, 'pocket' in loose]]).toEqual([0, ['.38 rounds', 6, 0, 'hands', 1, false]])
  })

  it('goes into a stack of the same supply that has room', () => {
    const gear = handFree()
    const flashlight = byId(gear, '1')
    const r = lubecUnload(gear, flashlight, 2, SUPPLIES, newId)
    expect(r.ok && [r.plan, byId(r.gear, '1').loaded, byId(r.gear, '4').qty]).toEqual([{ ok: true, n: 2, pour: false, cost: 0, into: byId(gear, '4') }, 0, 4])
  })

  it('goes into a box with room before a new stack that costs the same, when the hands are full', () => {
    const full = withItem(loadedGun(), T('w2', 'hands', 1, 'Walkie-talkie', 1))
    expect(lubecLandPlan(full, byId(full, '8'), 6, SUPPLIES)).toMatchObject({ ok: true, pour: false, cost: 2, into: { id: '6' } })
  })

  it('pours out what can\'t be loose, like water', () => {
    const gear = withItem(sample(), T('c', 'body', 0, 'Canteen', 1, { kind: 'holder', hold: 'fill', takes: 'water', capacity: 4, loaded: 3 }))
    const r = lubecUnload(gear, byId(gear, 'c'), 3, SUPPLIES, newId)
    expect(r.ok && [r.plan, byId(r.gear, 'c').loaded, r.gear.items.length]).toEqual([{ ok: true, n: 3, pour: true }, 0, gear.items.length])
  })

  it('refuses when there is no room on you', () => {
    const big = withItem(sample(), T('b', 'backpack', null, 'Box of batteries', 0, { kind: 'holder', hold: 'box', takes: 'dcell', capacity: 40, loaded: 40 }))
    const gear = { ...big, items: big.items.filter((i) => i.id !== '4') }
    expect(lubecUnload(gear, byId(gear, 'b'), 10, SUPPLIES, newId)).toEqual({ ok: false, n: 10, why: 'no-room' })
  })

  it('puts a new stack of a 1-slot supply in the thing\'s own pocket first, free', () => {
    const gear = without(sample(), '4')
    const p = lubecLandPlan(gear, byId(gear, '1'), 2, SUPPLIES)
    expect(p).toMatchObject({ ok: true, cost: 0, draft: { name: 'D batteries', size: 1, per: 4, fits: 'dcell', qty: 2 }, placed: { carrier: 'backpack', pocket: 0 } })
  })

  it('puts it in a free hand, at what that move costs, when its own carrier has no room', () => {
    const gear = without(withItem(sample(), T('m', 'backpack', 0, 'Mittens', 1)), '4', '9')
    expect(lubecLandPlan(gear, byId(gear, '1'), 2, SUPPLIES)).toMatchObject({ ok: true, cost: 2, placed: { carrier: 'hands', slot: 1 } })
  })
})

describe('a box (Rules L6 and L7)', () => {
  it('gives some out into small stuff, free, and takes the loose ones back, which are used up', () => {
    const gear = handFree()
    const out = lubecUnload(gear, byId(gear, '6'), 4, SUPPLIES, newId)
    if (!out.ok) throw new Error('nothing came out')
    const loose = out.gear.items.find((i) => i.kind === 'consumable' && i.fits === 'a38') as LubecItem
    expect([byId(out.gear, '6').loaded, loose.qty, loose.carrier, loose.pocket]).toEqual([8, 4, 'backpack', null])
    const plan = lubecBoxFillPlan(out.gear, byId(out.gear, '6'))
    expect(plan.ok && [draws(plan.take), plan.put, plan.cost?.n]).toEqual([[[loose.id, 4]], 4, 0])
    const back = lubecBoxFill(out.gear, byId(out.gear, '6'))
    expect(back.ok && [byId(back.gear, '6').loaded, has(back.gear, loose.id), ids(back.gone)]).toEqual([12, false, [loose.id]])
  })

  it('takes only what fits, leaving the rest loose', () => {
    const gear = withItem(sample(), T('r', 'backpack', null, '.38 rounds', 0, { kind: 'consumable', qty: 40, fits: 'a38' }))
    const back = lubecBoxFill(gear, byId(gear, '6'))
    expect(back.ok && [byId(back.gear, '6').loaded, byId(back.gear, 'r').qty, ids(back.gone)]).toEqual([50, 2, []])
  })

  it('counts a move from a hand into the backpack, and none from a carrier', () => {
    const gear = withItem(handFree(), T('r', 'hands', 1, '.38 rounds', 0, { kind: 'consumable', qty: 3, fits: 'a38' }))
    expect(lubecBoxFillPlan(gear, byId(gear, '6'))).toMatchObject({ ok: true, cost: { n: 2 } })
    const carGear = withItem(withItem(sample(), T('cb', 'car', 0, 'Box', 1, { kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 0 })), T('cr', 'car', 0, '.38 rounds', 0, { kind: 'consumable', qty: 3, fits: 'a38' }))
    expect(lubecBoxFillPlan(carGear, byId(carGear, 'cb'))).toMatchObject({ ok: true, put: 3, cost: null })
  })

  it('has nothing to take with no loose ones on you', () => {
    expect(lubecBoxFillPlan(sample(), byId(sample(), '6'))).toEqual({ ok: false, why: 'no-loose' })
    expect(lubecBoxFill(sample(), byId(sample(), '6'))).toEqual({ ok: false, why: 'no-loose' })
  })
})

describe('filling (Rule L8)', () => {
  it('fills a holder to the top, at the table', () => {
    const gear = withItem(sample(), T('c', 'body', 0, 'Canteen', 1, { kind: 'holder', hold: 'fill', takes: 'water', capacity: 4, loaded: 0 }))
    expect(byId(lubecFill(gear, byId(gear, 'c')), 'c').loaded).toBe(4)
  })
})

describe('making a supply (Rule L1)', () => {
  it('matches a supply by id, and a made one with the same name in other letters is the same supply', () => {
    const first = lubecMakeSupply(sample(), 'Film', () => 'film-1')
    expect(first).toMatchObject({ ok: true, made: true, supply: { id: 'film-1', name: 'Film' } })
    const gear = first.ok ? first.gear : sample()
    expect(gear.supplies).toEqual([{ id: 'film-1', name: 'Film' }])
    const again = lubecMakeSupply(gear, '  fILM ', () => 'film-2')
    expect(again).toEqual({ ok: true, gear, supply: { id: 'film-1', name: 'Film' }, made: false })
    expect(lubecMakeSupply(gear, '.38 ROUNDS', () => 'x')).toMatchObject({ ok: true, made: false, supply: { id: 'a38' } })
    expect(lubecSupplies(gear).at(-1)).toEqual({ id: 'film-1', name: 'Film' })
  })

  it('keeps the name as typed, trimmed, and refuses no name', () => {
    expect(lubecMakeSupply(sample(), '  Lantern   oil ', () => 'l')).toMatchObject({ ok: true, supply: { id: 'l', name: 'Lantern   oil' } })
    expect(lubecMakeSupply(sample(), '   ', () => 'x')).toEqual({ ok: false })
    expect(lubecSupplyKey(' Lantern   OIL ')).toBe('lantern oil')
  })
})
