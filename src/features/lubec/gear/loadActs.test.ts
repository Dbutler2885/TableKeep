/**
 * What the card's loading buttons and the empty-weapon prompt do (B check 25):
 * each is one commit with B's toast and the card shown after it, or B's
 * refusal, word for word.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecCardLoadAct, lubecLoadContext, lubecLoadIntoAct, lubecReloadAct, lubecReloadAndFireAct, lubecTakeOutAct } from './loadActs'

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Partial<LubecItem> = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

const ITEMS = [
  T('1', 'backpack', 0, 'Flashlight', 1, { kind: 'holder', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2 }),
  T('4', 'backpack', 0, 'D batteries', 1, { kind: 'consumable', qty: 2, per: 4, fits: 'dcell' }),
  T('6', 'backpack', 1, 'Box of .38 rounds', 1, { kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 12 }),
  T('8', 'hands', 0, "Grandpa's revolver", 1, { kind: 'weapon', mode: 'firearm', wounds: ['gun'], capacity: 6, loaded: 0, takes: 'a38' }),
  T('c', 'body', 0, 'Canteen', 1, { kind: 'holder', hold: 'fill', takes: 'water', capacity: 4, loaded: 4 }),
]

const gearOf = (items: unknown[]): LubecGear => parseLubecGear({ items })
let made = 0
const ctxOf = (gear: LubecGear) => lubecLoadContext(gear, () => `new-${++made}`)
const byId = (gear: LubecGear, id: string): LubecItem => gear.items.find((i) => i.id === id) as LubecItem
const gearAfter = (r: ReturnType<typeof lubecReloadAct>) => (r.ok ? r.gear : null) as LubecGear
const add = (gear: LubecGear, item: unknown): LubecGear => ({ ...gear, items: [...gear.items, gearOf([item]).items[0]] })

describe('loading from the card', () => {
  it('reloads the revolver, saying so', () => {
    const gear = gearOf(ITEMS)
    const r = lubecReloadAct(ctxOf(gear), byId(gear, '8'))
    expect(r).toMatchObject({ ok: true, toast: 'Reloaded.', show: '8' })
    expect(byId(gearAfter(r), '8').loaded).toBe(6)
  })

  it('loads a holder, saying "Loaded."', () => {
    const gear = gearOf([{ ...ITEMS[0], carrier: 'hands', slot: 0, loaded: 0 }, ITEMS[1]])
    expect(lubecReloadAct(ctxOf(gear), byId(gear, '1'))).toMatchObject({ ok: true, toast: 'Loaded.', show: '1' })
  })

  it('refuses in B\'s words', () => {
    const gear = add(gearOf(ITEMS), T('9', 'hands', 1, 'Walkie-talkie', 1))
    expect(lubecReloadAct(ctxOf(gear), byId(gear, '8'))).toEqual({ ok: false, msg: 'Your other hand holds Walkie-talkie. It needs to hold the .38 rounds, or be empty to fetch them.' })
  })

  it('loads the gun from the box, and the card stays on the box', () => {
    const gear = gearOf(ITEMS)
    expect(lubecLoadIntoAct(ctxOf(gear), byId(gear, '6'), byId(gear, '8'))).toMatchObject({ ok: true, toast: "Loaded Grandpa's revolver: 6 of 6.", show: '6' })
  })

  it('shows the gun when the loose stack it loaded from is used up', () => {
    const gear = add(gearOf(ITEMS), T('r', 'hands', 1, '.38 rounds', 0, { kind: 'consumable', qty: 6, fits: 'a38' }))
    expect(lubecLoadIntoAct(ctxOf(gear), byId(gear, 'r'), byId(gear, '8'))).toMatchObject({ ok: true, show: '8' })
    const busy = add(gearOf(ITEMS), T('9', 'hands', 1, 'Walkie-talkie', 1))
    expect(lubecLoadIntoAct(ctxOf(busy), byId(busy, '6'), byId(busy, '8'))).toMatchObject({ ok: false })
  })

  it('unloads, empties, uses one and fills, with B\'s toasts', () => {
    const gear = gearOf(ITEMS)
    expect(lubecCardLoadAct(ctxOf(gear), byId(gear, '1'), { type: 'unload' })).toMatchObject({ ok: true, toast: 'Flashlight: unloaded.', show: '1' })
    const emptied = lubecCardLoadAct(ctxOf(gear), byId(gear, 'c'), { type: 'unload' })
    expect(emptied).toMatchObject({ ok: true, toast: 'Canteen: emptied.' })
    const sip = lubecCardLoadAct(ctxOf(gear), byId(gear, 'c'), { type: 'sip' })
    expect([sip.ok && sip.toast, byId(gearAfter(sip), 'c').loaded]).toEqual([null, 3])
    const fill = lubecCardLoadAct(ctxOf(gearAfter(emptied)), byId(gearAfter(emptied), 'c'), { type: 'fill' })
    expect([fill.ok && fill.toast, byId(gearAfter(fill), 'c').loaded]).toEqual(['Canteen: full.', 4])
  })

  it('loads through the card\'s act, for a reload and for a load into another thing', () => {
    const gear = gearOf(ITEMS)
    expect(lubecCardLoadAct(ctxOf(gear), byId(gear, '8'), { type: 'reload' })).toMatchObject({ ok: true, toast: 'Reloaded.' })
    expect(lubecCardLoadAct(ctxOf(gear), byId(gear, '6'), { type: 'load-into', into: byId(gear, '8') })).toMatchObject({ ok: true, show: '6' })
  })

  it('says when unloading has no room on you', () => {
    const box = T('b', 'backpack', null, 'Box of batteries', 0, { kind: 'holder', hold: 'box', takes: 'dcell', capacity: 40, loaded: 40 })
    const gear = gearOf([box, T('x', 'hands', 0, 'Oar', 4), T('y', 'body', 0, 'Coat', 1), T('z', 'body', 1, 'Hat', 1), T('p', 'backpack', 0, 'Pup tent', 4), T('q', 'backpack', 0, 'Map', 1), T('f1', 'backpack', 1, 'Rope', 1), T('f2', 'backpack', 2, 'Cup', 1)])
    expect(lubecCardLoadAct(ctxOf(gear), byId(gear, 'b'), { type: 'unload' })).toEqual({ ok: false, msg: 'No room on you for 40 loose D batteries. Make room, or put them in a box.' })
  })
})

describe('a box from the card', () => {
  it('takes some out, and puts the loose ones back', () => {
    const gear = gearOf(ITEMS)
    const out = lubecTakeOutAct(ctxOf(gear), byId(gear, '6'), 4)
    expect(out).toMatchObject({ ok: true, toast: 'Took 4 out of Box of .38 rounds.', show: '6' })
    const back = lubecCardLoadAct(ctxOf(gearAfter(out)), byId(gearAfter(out), '6'), { type: 'boxfill' })
    expect(back).toMatchObject({ ok: true, toast: 'Box of .38 rounds: 12 of 50.', show: '6' })
  })

  it('takes out 1 to everything in the box, and nothing else', () => {
    const gear = gearOf(ITEMS)
    for (const n of [0, 13, 2.5, Number.NaN]) expect(lubecTakeOutAct(ctxOf(gear), byId(gear, '6'), n)).toEqual({ ok: false, msg: 'Take out 1 to 12.' })
  })

  it('says there are no loose ones on you', () => {
    const gear = gearOf(ITEMS)
    expect(lubecCardLoadAct(ctxOf(gear), byId(gear, '6'), { type: 'boxfill' })).toEqual({ ok: false, msg: 'No loose .38 rounds on you' })
  })
})

describe('the empty-weapon prompt\'s Reload & fire', () => {
  it('loads, fires and uses a round in one action', () => {
    const gear = gearOf(ITEMS)
    const r = lubecReloadAndFireAct(ctxOf(gear), byId(gear, '8'))
    expect(r).toMatchObject({ ok: true, toast: 'Reloaded and fired. Roll it at the table.', show: '8' })
    expect([byId(gearAfter(r), '8').loaded, byId(gearAfter(r), '6').loaded]).toEqual([5, 6])
  })

  it('refuses in B\'s words when it can\'t load', () => {
    const gear = gearOf([ITEMS[3]])
    expect(lubecReloadAndFireAct(ctxOf(gear), byId(gear, '8'))).toEqual({ ok: false, msg: "No .38 rounds on you. A carrier doesn't count." })
  })
})
