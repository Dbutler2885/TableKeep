/**
 * What a move asked for on the Gear page comes to: the card's Move it and
 * Swap, and letting go of a dragged thing (Rule M7), each the next gear and
 * its toast, a refusal in the prototype's words, or a drop.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecDropTarget } from './dragGeometry'
import { lubecCardMove, lubecDragMove } from './gearMoves'

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Partial<LubecItem> = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

const gearOf = (...items: unknown[]): LubecGear => parseLubecGear({ items })
const byId = (gear: LubecGear, id: string): LubecItem => gear.items.find((i) => i.id === id) as LubecItem

const gear = gearOf(
  T('f', 'backpack', 0, 'Flashlight', 1, { cells: [4] }),
  T('c', 'backpack', 0, 'Wool watch cap', 1),
  T('r', 'hands', 0, "Grandpa's revolver", 1),
  T('w', 'hands', 1, 'Walkie-talkie', 1),
)

const target = (fields: Partial<LubecDropTarget>): LubecDropTarget =>
  ({ dest: 'hands', rect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }), mark: null, ok: true, why: null, cost: null, ...fields })

describe('the card\'s Move it and Swap', () => {
  it('moves the thing in one commit, with its toast', () => {
    const r = lubecCardMove(gear, byId(gear, 'r'), 'body')
    expect(r.kind === 'done' && [byId(r.gear, 'r').carrier, r.toast]).toEqual(['body', "Grandpa's revolver: Body slot. 1 action."])
  })

  it('swaps on a "Swap with" choice', () => {
    const r = lubecCardMove(gear, byId(gear, 'r'), 'swap:f')
    expect(r.kind === 'done' && r.toast).toBe("Grandpa's revolver: Backpack, main pocket. Flashlight: Left hand. 4 actions (a guess).")
  })

  it('refuses with the swap hint when the thing could swap instead (Rule M9)', () => {
    expect(lubecCardMove(gear, byId(gear, 'f'), 'hands')).toEqual({
      kind: 'refused', msg: 'Both hands are full. Or swap it: pick "Swap with" a thing in this list, or drag it onto one.',
    })
  })

  it('refuses a swap in the swap\'s own words', () => {
    const heavy = gearOf(T('a', 'backpack', 0, 'Small anvil', 1, { weight: 'heavy' }), T('w', 'hands', 1, 'Walkie-talkie', 1), T('r', 'hands', 0, 'Rope', 1))
    expect(lubecCardMove(heavy, byId(heavy, 'a'), 'swap:w')).toEqual({ kind: 'refused', msg: 'A heavy thing takes both hands. Empty both hands first.' })
  })

  it('hands a drop on to the move between records', () => {
    expect(lubecCardMove(gear, byId(gear, 'f'), 'drop')).toEqual({ kind: 'drop' })
  })
})

describe('letting go of a dragged thing (Rule M7)', () => {
  it('says why when it is let go where it can\'t go', () => {
    expect(lubecDragMove(gear, byId(gear, 'f'), target({ ok: false, why: 'Both hands are full.' }))).toEqual({ kind: 'refused', msg: 'Both hands are full.' })
  })

  it('swaps when it is let go on a thing it can swap with', () => {
    const r = lubecDragMove(gear, byId(gear, 'w'), target({ swap: byId(gear, 'c'), dest: 'backpack#0' }))
    expect(r.kind === 'done' && [byId(r.gear, 'w').carrier, byId(r.gear, 'c').slot]).toEqual(['backpack', 1])
  })

  it('arranges a thing inside the main pocket for free', () => {
    const r = lubecDragMove(gear, byId(gear, 'f'), target({ dest: 'backpack#0', cells: [0] }))
    expect(r.kind === 'done' && [byId(r.gear, 'f').cells, r.toast]).toEqual([[0], 'Flashlight: arranged. Free.'])
  })

  it('moves a thing into the boxes it was let go on, at what the Move button would cost', () => {
    const roomy = gearOf(T('r', 'hands', 0, "Grandpa's revolver", 1))
    const r = lubecDragMove(roomy, byId(roomy, 'r'), target({ dest: 'backpack#0', cells: [2] }))
    expect(r.kind === 'done' && [byId(r.gear, 'r').cells, r.toast]).toEqual([[2], "Grandpa's revolver: Backpack, main pocket. 2 actions."])
  })

  it('packs the main pocket afresh when there is room but not in one piece', () => {
    const split = gearOf(T('x', 'backpack', 0, 'Cap', 1, { cells: [0] }), T('y', 'backpack', 0, 'Map', 1, { cells: [3] }), T('bat', 'hands', 0, 'Baseball bat', 2))
    const r = lubecDragMove(split, byId(split, 'bat'), target({ dest: 'backpack#0', repack: true }))
    expect(r.kind === 'done' && r.gear.items.map((i) => [i.id, i.carrier, i.cells])).toEqual([['x', 'backpack', undefined], ['y', 'backpack', undefined], ['bat', 'backpack', undefined]])
  })

  it('hands a drop on to the move between records', () => {
    expect(lubecDragMove(gear, byId(gear, 'f'), target({ dest: 'drop' }))).toEqual({ kind: 'drop' })
  })
})
