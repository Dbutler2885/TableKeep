/**
 * Where things go on you (Rules S4, W1 to W6 and C1), against the
 * prototype's sample: Wayne Gardner's backpack, hands, body and worn armor,
 * his bedroom chest, the family car and Dad's duffel bag. The refusals are
 * B's wording, word for word.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, type LubecGear, type LubecItem } from './gearRecord'
import {
  bodyTaken,
  bothHands,
  capacity,
  carrierOf,
  FOOTPRINTS,
  handsTaken,
  inventoryFull,
  itemsIn,
  onYou,
  packMain,
  place,
  pocketUsed,
  used,
} from './placement'
import { placeStacks, type LubecItemDraft, type LubecPlaceRule } from './stacks'

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Partial<LubecItem> = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

const P = (name: string, slots: number, max: number) => ({ name, slots, max })

const SAMPLE_ITEMS = [
  T('i1', 'backpack', 0, 'Flashlight', 1, { kind: 'holder', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2 }),
  T('i2', 'backpack', 0, 'Small anvil', 1, { weight: 'heavy', check: 'fail' }),
  T('i3', 'backpack', 0, 'Peanut butter sandwich', 1, { kind: 'consumable', qty: 2, per: 2 }),
  T('i4', 'backpack', 0, 'D batteries', 1, { kind: 'consumable', qty: 2, per: 4, fits: 'dcell' }),
  T('i5', 'backpack', 0, 'Wool watch cap', 1),
  T('i6', 'backpack', 1, 'Box of .38 rounds', 1, { kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 12 }),
  T('i7', 'backpack', 2, 'Photocopied 1898 map', 1),
  T('i36', 'backpack', null, 'Timex watch', 0),
  T('i37', 'backpack', null, 'House key', 0),
  T('i38', 'backpack', null, 'Marbles', 0, { qty: 12 }),
  T('i8', 'hands', 0, "Grandpa's revolver", 1, { kind: 'weapon', mode: 'firearm', capacity: 6, loaded: 0, takes: 'a38' }),
  T('i9', 'hands', 1, 'Walkie-talkie', 1),
  T('i10', 'body', 0, 'Rain slicker', 1),
  T('i11', 'body', 1, 'Pocketknife', 0, { kind: 'weapon', mode: 'melee', wounds: ['cut', 'pierce'] }),
  T('i12', 'worn', null, 'Leather work gloves', 1, { kind: 'armor', armor: { cut: 1, pierce: 0, blunt: 1, gun: 0 }, locs: ['hand-L', 'hand-R'] }),
  T('i13', 'worn', null, 'Hockey helmet', 2, { kind: 'armor', armor: { cut: 1, pierce: 1, blunt: 2, gun: 0 }, locs: ['head'] }),
  T('i14', 'chest', 0, 'Baseball glove', 1),
  T('i18', 'chest', 0, 'Sleeping bag', 2),
  T('i20', 'chest', 0, 'Snowmobile suit', 4, {
    kind: 'armor', armor: { cut: 1, pierce: 0, blunt: 1, gun: 0 }, exclusive: true,
    locs: ['torso', 'upperarm-L', 'upperarm-R', 'forearm-L', 'forearm-R', 'waist', 'groin', 'thigh-L', 'thigh-R', 'shin-L', 'shin-R'],
  }),
  T('i28', 'car', 0, 'Baseball bat', 2, { kind: 'weapon', mode: 'melee', wounds: ['blunt'] }),
  T('i29', 'car', 0, 'Buster, the family dog', 8),
  T('i30', 'car', 1, 'Road map of Maine', 1),
  T('i33', 'car', 0, 'Mushroom anchor', 2, { weight: 'extra' }),
]

const SAMPLE_CARRIERS = [
  { id: 'chest', name: 'Bedroom chest', type: 'chest', pockets: [P('Chest', 12, 8)] },
  { id: 'duffel', name: "Dad's duffel bag", type: 'duffel', pockets: [P('Main', 8, 8)] },
  { id: 'car', name: 'Family car, the Ford wagon', type: 'car', pockets: [P('Trunk and back seat', 200, 8), P('Glove box', 2, 1)] },
  { id: 'mlocker', name: "Marie's locker", type: 'locker', pockets: [P('Locker', 6, 4), P('Top shelf', 2, 1)] },
]

const gearOf = (items: unknown[]): LubecGear => parseLubecGear({ items, carriers: SAMPLE_CARRIERS })
const sample = (): LubecGear => gearOf(SAMPLE_ITEMS)
/** The sample less the items in `places`. */
const without = (...places: string[]): LubecGear => gearOf(SAMPLE_ITEMS.filter((i) => !places.includes(i.carrier)))
const byId = (gear: LubecGear, id: string): LubecItem => gear.items.find((i) => i.id === id) as LubecItem

const draft = (fields: Partial<LubecItemDraft>): LubecItemDraft =>
  ({ kind: 'thing', name: 'Thing', note: '', size: 1, weight: 'normal', qty: 1, ...fields })

describe('the "on you" test', () => {
  it('is the backpack, the hands, the body and worn armor, and never a carrier', () => {
    const gear = sample()
    expect(['i1', 'i36', 'i8', 'i10', 'i12'].map((id) => onYou(byId(gear, id)))).toEqual([true, true, true, true, true])
    expect(['i14', 'i28'].map((id) => onYou(byId(gear, id)))).toEqual([false, false])
  })
})

describe('the places a thing can go', () => {
  it('builds the backpack, hands, body and worn armor, which are never stored', () => {
    const gear = sample()
    expect(carrierOf(gear, 'backpack')).toMatchObject({ kind: 'pack', name: 'Backpack' })
    expect(capacity(carrierOf(gear, 'backpack')?.pockets ?? [])).toBe(7)
    expect(['hands', 'body', 'worn'].map((id) => carrierOf(gear, id)?.kind)).toEqual(['hands', 'body', 'worn'])
  })

  it('reads a personal carrier off the gear, and knows no other', () => {
    const gear = sample()
    expect(carrierOf(gear, 'duffel')).toMatchObject({ kind: 'made', name: "Dad's duffel bag", pockets: [P('Main', 8, 8)] })
    expect(carrierOf(gear, 'skiff')).toBeUndefined()
    expect(carrierOf(gear, 'toString')).toBeUndefined()
  })

  it('counts what is in a place, a pocket, and a pocket less the thing being moved', () => {
    const gear = sample()
    expect(itemsIn(gear, 'hands').map((i) => i.id)).toEqual(['i8', 'i9'])
    expect(used(gear, 'backpack')).toBe(7)
    expect(pocketUsed(gear, 'backpack', 0)).toBe(5)
    expect(pocketUsed(gear, 'backpack', 0, 'i2')).toBe(4)
    expect(used(gear, 'chest')).toBe(7)
  })
})

describe('hands (Rule W3)', () => {
  it('takes both hands for anything over 1 slot, heavy, extra heavy or with hands: 2', () => {
    expect(bothHands(draft({ size: 2 }))).toBe(true)
    expect(bothHands(draft({ size: 4 }))).toBe(true)
    expect(bothHands(draft({ weight: 'heavy' }))).toBe(true)
    expect(bothHands(draft({ weight: 'extra' }))).toBe(true)
    expect(bothHands(draft({ hands: 2 }))).toBe(true)
    expect(bothHands(draft({}))).toBe(false)
    expect(bothHands(draft({ size: 0 }))).toBe(false)
    expect(bothHands(draft({ hands: 1 }))).toBe(false)
  })

  it('puts a two-handed thing in both empty hands', () => {
    const gear = without('hands')
    for (const it of [draft({ size: 2 }), draft({ weight: 'heavy' }), draft({ weight: 'extra' }), draft({ hands: 2 })]) {
      expect(place(gear, 'hands', it)).toEqual({ ok: true, carrier: 'hands', slot: 0 })
    }
    const held = gearOf([...SAMPLE_ITEMS.filter((i) => i.carrier !== 'hands'), T('i40', 'hands', 0, 'Slingshot', 1, { hands: 2 })])
    expect([...handsTaken(held)]).toEqual([0, 1])
  })

  it.each([
    [draft({ size: 2 }), 'A 2-slot thing takes both hands. Empty both hands first.'],
    [draft({ size: 4, weight: 'heavy' }), 'A 4-slot thing takes both hands. Empty both hands first.'],
    [draft({ weight: 'heavy' }), 'A heavy thing takes both hands. Empty both hands first.'],
    [draft({ weight: 'extra' }), 'An extra-heavy thing takes both hands. Empty both hands first.'],
    [draft({ hands: 2 }), 'A two-handed thing takes both hands. Empty both hands first.'],
  ])('refuses a two-handed thing while a hand is full: %#', (it, msg) => {
    const oneHand = gearOf(SAMPLE_ITEMS.filter((i) => i.id !== 'i9'))
    expect(place(oneHand, 'hands', it)).toEqual({ ok: false, msg })
  })

  it('puts a one-handed thing in the hand asked for, else the first free one', () => {
    const gear = gearOf(SAMPLE_ITEMS.filter((i) => i.id !== 'i8'))
    expect(place(gear, 'hands#0', draft({}))).toEqual({ ok: true, carrier: 'hands', slot: 0 })
    expect(place(gear, 'hands#1', draft({}))).toEqual({ ok: true, carrier: 'hands', slot: 0 })
    expect(place(gear, 'hands', draft({}))).toEqual({ ok: true, carrier: 'hands', slot: 0 })
    expect(place(without('hands'), 'hands#1', draft({}))).toEqual({ ok: true, carrier: 'hands', slot: 1 })
    expect(place(without('hands'), 'hands#7', draft({}))).toEqual({ ok: true, carrier: 'hands', slot: 0 })
  })

  it('refuses a third thing', () => {
    expect(place(sample(), 'hands', draft({}))).toEqual({ ok: false, msg: 'Both hands are full.' })
    expect(place(sample(), 'hands#0', draft({ size: 0 }))).toEqual({ ok: false, msg: 'Both hands are full.' })
  })

  it('sets the thing being moved aside, so it can change hands', () => {
    expect([...handsTaken(sample(), 'i8')]).toEqual([1])
    const oneHand = gearOf(SAMPLE_ITEMS.filter((i) => i.id !== 'i9'))
    expect(place(oneHand, 'hands#1', byId(oneHand, 'i8'), 'i8')).toEqual({ ok: true, carrier: 'hands', slot: 1 })
  })

  it('counts a held thing with no readable slot in neither hand', () => {
    const gear = gearOf([T('i40', 'hands', null, 'Lost glove', 1)])
    expect(handsTaken(gear).size).toBe(0)
  })
})

describe('body slots (Rule W4)', () => {
  it('take 1-slot things only', () => {
    const gear = without('body')
    expect(place(gear, 'body', draft({ size: 2 }))).toEqual({ ok: false, msg: 'Body slots take 1-slot things only. Try both hands, the backpack or a carrier.' })
    expect(place(gear, 'body', draft({ size: 1 }))).toEqual({ ok: true, carrier: 'body', slot: 0 })
    expect(place(gear, 'body#1', draft({ size: 1 }))).toEqual({ ok: true, carrier: 'body', slot: 1 })
  })

  it('refuses a third thing, and lets the thing being moved change slots', () => {
    expect(place(sample(), 'body', draft({}))).toEqual({ ok: false, msg: 'Both body slots are full.' })
    expect([...bodyTaken(sample(), 'i10')]).toEqual([1])
    expect(place(sample(), 'body#0', byId(sample(), 'i11'), 'i11')).toEqual({ ok: true, carrier: 'body', slot: 1 })
  })
})

describe('small stuff (Rule S4)', () => {
  it('takes no slot in a bag, however full, but takes a hand or body slot when held', () => {
    const gear = sample()
    expect(place(gear, 'backpack#small', draft({ size: 0 }))).toEqual({ ok: true, carrier: 'backpack', pocket: null })
    expect(place(gear, 'backpack', draft({ size: 0, qty: 40 }))).toEqual({ ok: true, carrier: 'backpack', pocket: null })
    expect(place(gear, 'chest#small', draft({ size: 0 }))).toEqual({ ok: true, carrier: 'chest', pocket: null })
    expect(bodyTaken(gear).has(1)).toBe(true) // the pocketknife, small, on the body
    expect(place(without('hands'), 'hands', draft({ size: 0 }))).toEqual({ ok: true, carrier: 'hands', slot: 0 })
  })

  it('takes only small things', () => {
    expect(place(sample(), 'backpack#small', draft({ size: 1 }))).toEqual({ ok: false, msg: 'Only small things go in small stuff. Pick a pocket, or make it Small.' })
  })
})

describe('the backpack (Rule W1)', () => {
  it('never takes an 8-slot thing', () => {
    expect(place(without('backpack'), 'backpack', draft({ size: 8 }))).toEqual({
      ok: false, msg: 'An 8-slot thing never fits in a backpack. Hold it in both hands, or put it on a carrier such as a strap.',
    })
    expect(place(without('backpack'), 'backpack#0', draft({ size: 8 })).ok).toBe(false)
  })

  it('has a main pocket of 5 slots for things up to 4', () => {
    const empty = without('backpack')
    expect(place(empty, 'backpack', draft({ size: 4 }))).toEqual({ ok: true, carrier: 'backpack', pocket: 0 })
    const rifle = gearOf([T('i40', 'backpack', 0, 'Rifle', 4)])
    expect(place(rifle, 'backpack#0', draft({ size: 1 }))).toEqual({ ok: true, carrier: 'backpack', pocket: 0 })
    expect(place(rifle, 'backpack#0', draft({ size: 2 }))).toEqual({ ok: false, msg: 'Main pocket is full: 1 of 5 free, and this needs 2.' })
  })

  it('fills the main pocket, then the front pockets', () => {
    const gear = gearOf(SAMPLE_ITEMS.filter((i) => !['i5', 'i6', 'i7'].includes(i.id)))
    expect(place(gear, 'backpack', draft({}))).toEqual({ ok: true, carrier: 'backpack', pocket: 0 })
    const mainFull = gearOf(SAMPLE_ITEMS.filter((i) => !['i6', 'i7'].includes(i.id)))
    expect(place(mainFull, 'backpack', draft({}))).toEqual({ ok: true, carrier: 'backpack', pocket: 1 })
  })

  it('names the front pocket that is too small, or full', () => {
    const gear = sample()
    expect(place(gear, 'backpack#1', draft({ size: 2 }))).toEqual({ ok: false, msg: 'Front pocket, left takes things up to 1 slot. This one is 2.' })
    expect(place(gear, 'backpack#2', draft({}))).toEqual({ ok: false, msg: 'Front pocket, right is full: 0 of 1 free, and this needs 1.' })
  })

  it('says when no pocket has room', () => {
    expect(place(sample(), 'backpack', draft({}))).toEqual({ ok: false, msg: 'No pocket in Backpack has room for a 1-slot thing.' })
  })

  it('sets the thing being moved aside, so it can move inside the backpack', () => {
    expect(place(sample(), 'backpack#0', byId(sample(), 'i5'), 'i5')).toEqual({ ok: true, carrier: 'backpack', pocket: 0 })
  })
})

describe('carriers (Rule C1)', () => {
  it('fit a thing inside one pocket', () => {
    const gear = sample()
    expect(place(gear, 'duffel', draft({ size: 8 }))).toEqual({ ok: true, carrier: 'duffel', pocket: 0 })
    expect(place(gear, 'car', draft({ size: 2 }))).toEqual({ ok: true, carrier: 'car', pocket: 0 })
    expect(place(gear, 'car#1', draft({}))).toEqual({ ok: true, carrier: 'car', pocket: 1 })
  })

  it('name the pocket that is too small, in slots', () => {
    expect(place(sample(), 'car#1', draft({ size: 2 }))).toEqual({ ok: false, msg: 'Glove box takes things up to 1 slot. This one is 2.' })
    expect(place(sample(), 'mlocker#0', draft({ size: 8 }))).toEqual({ ok: false, msg: 'Locker takes things up to 4 slots. This one is 8.' })
  })

  it('say when no pocket has room', () => {
    const full = gearOf([T('i40', 'duffel', 0, 'Toboggan', 8)])
    expect(place(full, 'duffel', draft({}))).toEqual({ ok: false, msg: "No pocket in Dad's duffel bag has room for a 1-slot thing." })
  })

  it('refuse a place that is not on the sheet', () => {
    const msg = 'That place is not on this sheet any more. Pick another.'
    expect(place(sample(), 'skiff', draft({}))).toEqual({ ok: false, msg })
    expect(place(sample(), 'car#5', draft({}))).toEqual({ ok: false, msg })
    expect(place(sample(), 'car#x', draft({}))).toEqual({ ok: false, msg })
  })
})

describe('worn armor (Rules W5, A1 and A3)', () => {
  it('is armor only', () => {
    expect(place(sample(), 'worn', draft({ name: 'Wool sweater' }))).toEqual({ ok: false, msg: 'Only armor is worn. Clothes and other things go in a body slot.' })
  })

  it('takes armor with a free layer', () => {
    expect(place(sample(), 'worn', draft({ kind: 'armor', name: 'Wool sweater', locs: ['torso'] }))).toEqual({ ok: true, carrier: 'worn' })
  })

  it('refuses armor with no free layer', () => {
    const suitOn = gearOf(SAMPLE_ITEMS.map((i) => (i.id === 'i20' ? { ...i, carrier: 'worn', pocket: null } : i)))
    expect(place(suitOn, 'worn', draft({ kind: 'armor', name: 'Wool sweater', locs: ['torso'] }))).toEqual({
      ok: false, msg: 'No free layer on the torso: 3 of 3 taken by Snowmobile suit. Take something off first.',
    })
  })
})

describe('placing stacks with the placement rule', () => {
  it('fills the chosen pocket first, then the same carrier\'s others', () => {
    const rule: LubecPlaceRule = place
    const plan = placeStacks(without('backpack'), 'backpack#1', draft({ size: 1, qty: 3, per: 1 }), [1, 1, 1], {
      place: rule, destinations: ['backpack', 'backpack#0', 'backpack#1', 'backpack#2', 'backpack#small'],
    })
    expect(plan).toEqual({ ok: true, list: [
      { ok: true, carrier: 'backpack', pocket: 1 },
      { ok: true, carrier: 'backpack', pocket: 0 },
      { ok: true, carrier: 'backpack', pocket: 0 },
    ] })
  })
})

const mainOf = (...items: ReturnType<typeof T>[]) => packMain(gearOf(items))
const layout = (main: ReturnType<typeof packMain>) => main?.placed.map(({ item, at }) => [item.name, at])

describe('the main pocket (Rule W2)', () => {
  it('has five boxes, and the footprints of each size', () => {
    expect(FOOTPRINTS[4]).toEqual([[0, 1, 2, 3]])
    expect(FOOTPRINTS[2]).toHaveLength(4)
    expect(packMain(sample())?.cells).toHaveLength(5)
  })

  it('packs singles into the box under the block first, in the order they were added', () => {
    const main = packMain(sample())
    expect(layout(main)).toEqual([
      ['Flashlight', [4]], ['Small anvil', [0]], ['Peanut butter sandwich', [1]], ['D batteries', [2]], ['Wool watch cap', [3]],
    ])
    expect(main?.cells.map((c) => c?.id)).toEqual(['i2', 'i3', 'i4', 'i5', 'i1'])
    expect(main?.fresh).toBe(false)
  })

  it('packs a rifle across the block and a single under it', () => {
    expect(layout(mainOf(T('i1', 'backpack', 0, 'Can', 1), T('i2', 'backpack', 0, 'Rifle', 4)))).toEqual([['Rifle', [0, 1, 2, 3]], ['Can', [4]]])
  })

  it('packs a bat first, then singles around it', () => {
    const main = mainOf(T('i1', 'backpack', 0, 'Can', 1), T('i2', 'backpack', 0, 'Bat', 2), T('i3', 'backpack', 0, 'Cup', 1), T('i4', 'backpack', 0, 'Mug', 1))
    expect(layout(main)).toEqual([['Bat', [0, 1]], ['Can', [4]], ['Cup', [2]], ['Mug', [3]]])
  })

  it('packs two bats in the block, side by side', () => {
    const main = mainOf(T('i1', 'backpack', 0, 'Bat', 2), T('i2', 'backpack', 0, 'Oar', 2), T('i3', 'backpack', 0, 'Can', 1))
    expect(layout(main)).toEqual([['Bat', [0, 1]], ['Oar', [2, 3]], ['Can', [4]]])
  })

  it('leaves small stuff and the front pockets out', () => {
    const main = packMain(sample())
    expect(main?.placed.map(({ item }) => item.id)).not.toContain('i36')
    expect(main?.placed.map(({ item }) => item.id)).not.toContain('i6')
  })

  it('keeps the boxes the player arranged, and packs the rest around them', () => {
    const main = mainOf(T('i1', 'backpack', 0, 'Can', 1, { cells: [0] }), T('i2', 'backpack', 0, 'Bat', 2))
    expect(layout(main)).toEqual([['Can', [0]], ['Bat', [2, 3]]])
    expect(main?.fresh).toBe(false)
  })

  it('ignores an arrangement that is not a footprint of the thing', () => {
    const main = mainOf(T('i1', 'backpack', 0, 'Bat', 2, { cells: [1, 2] }))
    expect(layout(main)).toEqual([['Bat', [0, 1]]])
  })

  it('packs fresh when the arrangement leaves no room', () => {
    const main = mainOf(
      T('i1', 'backpack', 0, 'Can', 1, { cells: [0] }),
      T('i2', 'backpack', 0, 'Cup', 1, { cells: [3] }),
      T('i3', 'backpack', 0, 'Bat', 2),
    )
    expect(layout(main)).toEqual([['Bat', [0, 1]], ['Can', [4]], ['Cup', [2]]])
    expect(main?.fresh).toBe(true)
  })

  it('reads stored gear that breaks the base rules as no arrangement', () => {
    expect(mainOf(T('i1', 'backpack', 0, 'Rifle', 4), T('i2', 'backpack', 0, 'Oars', 4))).toBeNull()
    expect(mainOf(T('i1', 'backpack', 0, 'Buster, the family dog', 8))).toBeNull()
  })
})

describe('a full inventory (Rule W6)', () => {
  type Full = { backpack: boolean; body: boolean; hands: boolean }
  const COMBINATIONS: Full[] = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ backpack: Boolean(n & 1), body: Boolean(n & 2), hands: Boolean(n & 4) }))
  // A place that is not full holds one less thing than the sample.
  const LESS: Record<keyof Full, string> = { backpack: 'i7', body: 'i10', hands: 'i9' }
  const gearFor = (full: Full) => gearOf(SAMPLE_ITEMS.filter((i) => !Object.entries(LESS).some(([at, id]) => !full[at as keyof Full] && i.id === id)))

  it.each(COMBINATIONS)('is full only when all three are: %o', (full) => {
    expect(inventoryFull(gearFor(full))).toBe(full.backpack && full.body && full.hands)
  })

  it('counts a two-handed thing as both hands, and small stuff held as a slot', () => {
    const items = SAMPLE_ITEMS.filter((i) => i.carrier !== 'hands')
    expect(inventoryFull(gearOf([...items, T('i40', 'hands', 0, 'Bat', 2)]))).toBe(true)
    expect(inventoryFull(gearOf([...items, T('i40', 'hands', 0, 'Key', 0), T('i41', 'hands', 1, 'Coin', 0)]))).toBe(true)
  })

  it('never counts a carrier', () => {
    const chestFull = gearOf([...SAMPLE_ITEMS.filter((i) => i.id !== 'i7'), T('i40', 'chest', 0, 'Toboggan', 4)])
    expect(inventoryFull(chestFull)).toBe(false)
    expect(inventoryFull(without('chest', 'car'))).toBe(true)
  })
})
