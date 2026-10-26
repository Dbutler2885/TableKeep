/**
 * Swapping (Rule M9), against the prototype's check 27: starting from Wayne
 * Gardner's full sample, nothing on him could move until two things could
 * trade places. The refusals are B's, word for word.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, type LubecGear, type LubecItem } from './gearRecord'
import { lubecMoveItem } from './moves'
import { handsTaken, inventoryFull, pocketUsed } from './placement'
import { lubecCanSwap, lubecCellsOf, lubecSpotOf, lubecSwapCandidates, lubecSwapCost, lubecSwapItems, lubecSwapWord } from './swap'

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Partial<LubecItem> = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

// Wayne Gardner's things on him, from the prototype's sample: a full backpack, full hands and full body slots.
const ON_HIM = [
  T('i1', 'backpack', 0, 'Flashlight', 1, { kind: 'holder', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2 }),
  T('i2', 'backpack', 0, 'Small anvil', 1, { weight: 'heavy', check: 'fail' }),
  T('i3', 'backpack', 0, 'Peanut butter sandwich', 1, { kind: 'consumable', qty: 2, per: 2 }),
  T('i4', 'backpack', 0, 'D batteries', 1, { kind: 'consumable', qty: 2, per: 4, fits: 'dcell' }),
  T('i5', 'backpack', 0, 'Wool watch cap', 1),
  T('i6', 'backpack', 1, 'Box of .38 rounds', 1, { kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 12 }),
  T('i7', 'backpack', 2, 'Photocopied 1898 map', 1),
  T('i36', 'backpack', null, 'Timex watch', 0),
  T('i8', 'hands', 0, "Grandpa's revolver", 1, { kind: 'weapon', mode: 'firearm', capacity: 6, loaded: 0, takes: 'a38' }),
  T('i9', 'hands', 1, 'Walkie-talkie', 1),
  T('i10', 'body', 0, 'Rain slicker', 1),
  T('i11', 'body', 1, 'Pocketknife', 0, { kind: 'weapon', mode: 'melee', wounds: ['cut', 'pierce'] }),
  T('i12', 'worn', null, 'Leather work gloves', 1, { kind: 'armor', locs: ['hand-L', 'hand-R'] }),
  T('i28', 'car', 0, 'Baseball bat', 2, { kind: 'weapon', mode: 'melee', wounds: ['blunt'] }),
]
const CAR = { id: 'car', name: 'Family car, the Ford wagon', type: 'car', pockets: [{ name: 'Trunk and back seat', slots: 200, max: 8 }] }

const gearOf = (items: unknown[]): LubecGear => parseLubecGear({ items, carriers: [CAR] })
const sample = () => gearOf(ON_HIM)
const byId = (gear: LubecGear, id: string): LubecItem => gear.items.find((i) => i.id === id) as LubecItem
const swap = (gear: LubecGear, a: string, b: string) => lubecSwapItems(gear, byId(gear, a), byId(gear, b))
const where = (gear: LubecGear, id: string) => {
  const { carrier, pocket, slot } = byId(gear, id)
  return { carrier, pocket, slot }
}

describe('which things can swap (Rule M9)', () => {
  it('is anything in the hands, the body slots or a backpack pocket, but never small stuff loose in the backpack', () => {
    const gear = sample()
    expect(['i1', 'i6', 'i8', 'i11', 'i36', 'i12', 'i28'].map((id) => lubecCanSwap(byId(gear, id)))).toEqual([true, true, true, true, false, false, false])
  })

  it('names each thing\'s exact place as a destination', () => {
    const gear = sample()
    expect(['i1', 'i6', 'i9', 'i10'].map((id) => lubecSpotOf(byId(gear, id)))).toEqual(['backpack#0', 'backpack#1', 'hands#1', 'body#0'])
  })

  it('offers the revolver every other thing on him, and greys out the anvil', () => {
    const gear = sample()
    const revolver = byId(gear, 'i8')
    const offered = lubecSwapCandidates(gear, revolver).map((o) => `${lubecSwapItems(gear, revolver, o).ok ? '' : '[x] '}${o.name}`)
    expect(offered).toEqual([
      'Flashlight', '[x] Small anvil', 'Peanut butter sandwich', 'D batteries', 'Wool watch cap', 'Box of .38 rounds', 'Photocopied 1898 map',
      'Walkie-talkie', 'Rain slicker', 'Pocketknife',
    ])
  })

  it('offers inside the main pocket only a thing of the same size', () => {
    const gear = gearOf([...ON_HIM.filter((i) => i.id !== 'i2'), T('i29', 'backpack', 0, 'Sleeping bag', 0)])
    const bag = { ...byId(gear, 'i29'), size: 2 as const }
    expect(lubecSwapCandidates({ ...gear, items: gear.items.map((i) => (i.id === 'i29' ? bag : i)) }, bag).map((o) => o.id)).not.toContain('i1')
  })
})

describe('swapping (B check 27)', () => {
  it('refuses a plain move when everything is full', () => {
    const r = lubecMoveItem(sample(), 'i8', 'backpack#0')
    expect(r).toEqual({ ok: false, msg: 'Main pocket is full: 0 of 5 free, and this needs 1.' })
  })

  it('swaps the revolver in the left hand with the flashlight in the main pocket, for both moves added up', () => {
    const gear = sample()
    const r = swap(gear, 'i8', 'i1')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect([where(r.gear, 'i8'), where(r.gear, 'i1')]).toEqual([
      { carrier: 'backpack', pocket: 0, slot: undefined },
      { carrier: 'hands', pocket: undefined, slot: 0 },
    ])
    expect(lubecSwapWord(r.cost)).toBe('4 actions (a guess)')
    expect(inventoryFull(r.gear)).toBe(true)
  })

  it('refuses the heavy anvil into one hand while the other is full', () => {
    expect(swap(sample(), 'i2', 'i9')).toEqual({ ok: false, msg: 'A heavy thing takes both hands. Empty both hands first.' })
  })

  it('names the other thing when it is the one that can\'t go back', () => {
    expect(swap(sample(), 'i9', 'i2')).toEqual({ ok: false, msg: "Small anvil can't go where Walkie-talkie was. A heavy thing takes both hands. Empty both hands first." })
  })

  it('swaps the small pocketknife on the body with the wool cap, which takes its body slot', () => {
    const r = swap(sample(), 'i11', 'i5')
    expect(r.ok && [where(r.gear, 'i11'), where(r.gear, 'i5')]).toEqual([
      { carrier: 'backpack', pocket: null, slot: undefined },
      { carrier: 'body', pocket: undefined, slot: 1 },
    ])
  })

  it('swaps two things inside the main pocket for free, trading their boxes', () => {
    const gear = sample()
    const before = [lubecCellsOf(gear, byId(gear, 'i3')), lubecCellsOf(gear, byId(gear, 'i4'))]
    const r = swap(gear, 'i3', 'i4')
    expect(before).toEqual([[1], [2]])
    expect(r.ok && [lubecCellsOf(r.gear, byId(r.gear, 'i3')), lubecCellsOf(r.gear, byId(r.gear, 'i4'))]).toEqual([[2], [1]])
    expect(r.ok && lubecSwapWord(r.cost)).toBe('free, only arranging')
  })

  it('swaps the map in a front pocket with the walkie-talkie in the right hand', () => {
    const r = swap(sample(), 'i7', 'i9')
    expect(r.ok && [where(r.gear, 'i7'), where(r.gear, 'i9')]).toEqual([
      { carrier: 'hands', pocket: undefined, slot: 1 },
      { carrier: 'backpack', pocket: 2, slot: undefined },
    ])
  })

  describe('the bat held in both hands', () => {
    const batInHands = (items = ON_HIM) => gearOf(items.map((i) => {
      if (i.id === 'i8' || i.id === 'i9') return { ...i, carrier: 'car', pocket: 0, slot: undefined }
      return i.id === 'i28' ? { ...i, carrier: 'hands', slot: 0, pocket: undefined } : i
    }))

    it('refuses a front pocket, and a full main pocket', () => {
      expect(swap(batInHands(), 'i28', 'i6')).toEqual({ ok: false, msg: 'Front pocket, left takes things up to 1 slot. This one is 2.' })
      expect(swap(batInHands(), 'i28', 'i1')).toEqual({ ok: false, msg: 'Main pocket is full: 1 of 5 free, and this needs 2.' })
    })

    it('swaps with the flashlight once the main pocket has room', () => {
      const gear = batInHands(ON_HIM.map((i) => (i.id === 'i3' ? { ...i, carrier: 'car', pocket: 0 } : i)))
      const r = swap(gear, 'i28', 'i1')
      expect(r.ok && [where(r.gear, 'i28').carrier, where(r.gear, 'i1').carrier, handsTaken(r.gear).size, pocketUsed(r.gear, 'backpack', 0)]).toEqual(['backpack', 'hands', 1, 5])
    })
  })

  it('keeps every other thing where it was, in the order they were added', () => {
    const gear = sample()
    const r = swap(gear, 'i8', 'i1')
    expect(r.ok && r.gear.items.map((i) => i.id)).toEqual(gear.items.map((i) => i.id))
  })

  it('keeps a recorded Strength roll, since both stay on you', () => {
    const r = swap(sample(), 'i2', 'i5')
    expect(r.ok && byId(r.gear, 'i2').check).toBe('fail')
  })
})

describe('what a swap costs', () => {
  it('adds both moves up, a guess unless both stay in the backpack', () => {
    const gear = sample()
    const cost = (a: string, b: string) => lubecSwapWord(lubecSwapCost(byId(gear, a), byId(gear, b)))
    expect([cost('i9', 'i8'), cost('i9', 'i10'), cost('i9', 'i1'), cost('i1', 'i6')]).toEqual(['free (a guess)', '1 action (a guess)', '4 actions (a guess)', 'free, only arranging'])
  })

  it('counts nothing to or from a carrier (Rule M6)', () => {
    const gear = sample()
    expect(lubecSwapCost(byId(gear, 'i28'), byId(gear, 'i1'))).toBeNull()
    expect(lubecSwapWord(null)).toBe('')
  })
})
