/**
 * Drag and drop's geometry (Rule M7), with made-up rectangles: the main
 * pocket's boxes on the screen, every place a thing could be dropped and what
 * the chip says over it, and the target under a point. The walkie-talkie's
 * targets are the prototype's check 27, word for word.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecPackSpot } from './backpackSlots'
import {
  LUBEC_DROP_MARK,
  LUBEC_HANDS_MARK,
  lubecCellsRect,
  lubecDropCostText,
  lubecDropTargets,
  lubecInset,
  lubecTargetAt,
  type LubecDropBox,
  type LubecDropSurface,
  type LubecDropTarget,
  type LubecRect,
} from './dragGeometry'

const rect = (left: number, top: number, width: number, height: number): LubecRect =>
  ({ left, top, width, height, right: left + width, bottom: top + height })

// A pack box of 200 by 300 at (100, 50); its main pocket's boxes are a 2x2 block over one box.
const PACK = rect(100, 50, 200, 300)
const SPOTS: LubecPackSpot[] = [
  { x: 10, y: 10, w: 40, h: 20 }, { x: 50, y: 10, w: 40, h: 20 },
  { x: 10, y: 30, w: 40, h: 20 }, { x: 50, y: 30, w: 40, h: 20 },
  { x: 10, y: 50, w: 80, h: 20 },
]

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Partial<LubecItem> = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

const FULL = [
  T('i1', 'backpack', 0, 'Flashlight', 1),
  T('i2', 'backpack', 0, 'Small anvil', 1, { weight: 'heavy', check: 'fail' }),
  T('i3', 'backpack', 0, 'Peanut butter sandwich', 1, { kind: 'consumable', qty: 2, per: 2 }),
  T('i4', 'backpack', 0, 'D batteries', 1, { kind: 'consumable', qty: 2, per: 4 }),
  T('i5', 'backpack', 0, 'Wool watch cap', 1),
  T('i6', 'backpack', 1, 'Box of .38 rounds', 1, { kind: 'holder', hold: 'box', capacity: 50, loaded: 12 }),
  T('i7', 'backpack', 2, 'Photocopied 1898 map', 1),
  T('i8', 'hands', 0, "Grandpa's revolver", 1, { kind: 'weapon', mode: 'firearm', capacity: 6, loaded: 0 }),
  T('i9', 'hands', 1, 'Walkie-talkie', 1),
  T('i10', 'body', 0, 'Rain slicker', 1),
  T('i11', 'body', 1, 'Pocketknife', 0, { kind: 'weapon', mode: 'melee', wounds: ['cut', 'pierce'] }),
]

const gearOf = (items: unknown[]): LubecGear => parseLubecGear({ items })
const byId = (gear: LubecGear, id: string): LubecItem => gear.items.find((i) => i.id === id) as LubecItem

// The boxes the page marks, as the On you view draws them: main-pocket things by id, the rest by their place.
function boxesOf(gear: LubecGear): LubecDropBox[] {
  const at = (n: number) => () => rect(400 + n * 50, 500, 40, 40)
  const main = gear.items.filter((i) => i.carrier === 'backpack' && i.pocket === 0)
  const placed = (dest: string) => gear.items.find((i) => `${i.carrier}#${i.carrier === 'backpack' ? i.pocket : i.slot}` === dest)
  const places = ['backpack#1', 'backpack#2', 'backpack#small', 'hands#0', 'hands#1', 'body#0', 'body#1']
  return [
    ...main.map((i, n) => ({ mark: `item:${i.id}`, dest: null, itemId: i.id, rect: at(n) })),
    ...places.map((dest, n) => ({ mark: dest, dest, itemId: dest === 'backpack#small' ? null : placed(dest)?.id ?? null, rect: at(10 + n) })),
  ]
}

const surfaceOf = (gear: LubecGear): LubecDropSurface => ({
  pack: () => PACK, spots: SPOTS, boxes: boxesOf(gear), hands: () => rect(700, 500, 120, 40), worn: null, drop: () => rect(300, 900, 200, 50),
})

const targetsFor = (gear: LubecGear, id: string) => lubecDropTargets(gear, byId(gear, id), surfaceOf(gear))

describe('the main pocket\'s boxes on the screen', () => {
  it('reads a box from the pack\'s box and the box\'s percents', () => {
    expect(lubecCellsRect(PACK, SPOTS, [0])).toEqual(rect(120, 80, 80, 60))
  })

  it('covers several boxes with one rectangle', () => {
    expect(lubecCellsRect(PACK, SPOTS, [0, 1, 2, 3])).toEqual(rect(120, 80, 160, 120))
    expect(lubecCellsRect(PACK, SPOTS, [0, 2])).toEqual(rect(120, 80, 80, 120))
  })

  it('insets a rectangle on every side', () => {
    expect(lubecInset(rect(10, 10, 40, 20), 3)).toEqual(rect(13, 13, 34, 14))
  })
})

describe('where a dragged thing could go (B check 27)', () => {
  it('lets the walkie-talkie swap with everything on him but the anvil, and otherwise only drop', () => {
    const targets = targetsFor(gearOf(FULL), 'i9')
    expect(targets.filter((t) => t.swap).map((t) => `${t.swap?.name}${t.ok ? ` ${lubecDropCostText(t)}` : ` NO ${t.why}`}`)).toEqual([
      'Flashlight Swap with the flashlight: 4 actions (a guess)',
      "Small anvil NO Small anvil can't go where Walkie-talkie was. A heavy thing takes both hands. Empty both hands first.",
      'Peanut butter sandwich Swap with the peanut butter sandwich: 4 actions (a guess)',
      'D batteries Swap with the D batteries: 4 actions (a guess)',
      'Wool watch cap Swap with the wool watch cap: 4 actions (a guess)',
      'Box of .38 rounds Swap with the box of .38 rounds: 4 actions (a guess)',
      'Photocopied 1898 map Swap with the photocopied 1898 map: 4 actions (a guess)',
      "Grandpa's revolver Swap with Grandpa's revolver: free (a guess)",
      'Rain slicker Swap with the rain slicker: 1 action (a guess)',
      'Pocketknife Swap with the pocketknife: 1 action (a guess)',
    ])
    expect(targets.filter((t) => !t.swap && t.ok).map((t) => t.dest)).toEqual(['drop'])
  })

  it('lights each open box of the main pocket on its own, and the boxes a thing already sits in not at all', () => {
    const gear = gearOf([T('a', 'backpack', 0, 'Wool watch cap', 1), T('h', 'hands', 0, 'Walkie-talkie', 1)])
    const fromHand = targetsFor(gear, 'h').filter((t) => t.cells)
    expect(fromHand.map((t) => [t.cells, lubecDropCostText(t)])).toEqual([[[0], '2 actions'], [[1], '2 actions'], [[2], '2 actions'], [[3], '2 actions']])
    expect(targetsFor(gear, 'a').filter((t) => t.cells).map((t) => [t.cells, lubecDropCostText(t)])).toEqual([
      [[0], 'Free: only arranging'], [[1], 'Free: only arranging'], [[2], 'Free: only arranging'], [[3], 'Free: only arranging'],
    ])
  })

  it('lights pairs of boxes for a 2-slot thing, and the whole pocket when there is room but not in one piece', () => {
    const roomy = gearOf([T('b', 'body', 0, 'Rope', 1), T('bat', 'hands', 0, 'Baseball bat', 2)])
    expect(targetsFor(roomy, 'bat').filter((t) => t.cells).map((t) => t.cells)).toEqual([[0, 1], [2, 3], [0, 2], [1, 3]])
    const split = gearOf([
      T('x', 'backpack', 0, 'Cap', 1, { cells: [0] }), T('y', 'backpack', 0, 'Map', 1, { cells: [3] }), T('bat', 'hands', 0, 'Baseball bat', 2),
    ])
    expect(targetsFor(split, 'bat').filter((t) => t.dest === 'backpack#0' && !t.swap).map((t) => [t.repack, t.ok])).toEqual([[true, true]])
  })

  it('offers both hands as one place to a thing that takes both, and never a single hand', () => {
    const gear = gearOf([T('bat', 'backpack', 0, 'Baseball bat', 2)])
    const targets = targetsFor(gear, 'bat')
    expect(targets.some((t) => t.dest.startsWith('hands#'))).toBe(false)
    expect(targets.find((t) => t.mark === LUBEC_HANDS_MARK)).toMatchObject({ dest: 'hands', ok: true })
  })

  it('sends a small thing only to the small stuff in the backpack', () => {
    const gear = gearOf([T('k', 'hands', 0, 'House key', 0)])
    const pack = targetsFor(gear, 'k').filter((t) => t.dest.startsWith('backpack'))
    expect(pack.map((t) => t.dest)).toEqual(['backpack#small'])
  })

  it('says a thing is there when neither can swap', () => {
    const gear = gearOf([T('k', 'backpack', null, 'House key', 0), T('h', 'hands', 0, 'Walkie-talkie', 1)])
    expect(lubecDropTargets(gear, byId(gear, 'h'), surfaceOf(gear)).find((t) => t.dest === 'hands#0')).toBeUndefined()
    const worn = gearOf([T('g', 'worn', null, 'Gloves', 1, { kind: 'armor', locs: ['hand-L'] }), T('h', 'hands', 0, 'Walkie-talkie', 1)])
    expect(targetsFor(worn, 'g').find((t) => t.dest === 'hands#0')).toMatchObject({ ok: false, why: 'Walkie-talkie is there.' })
  })

  it('offers armor not yet worn the worn armor\'s drawing, and no one else', () => {
    const gear = gearOf([T('g', 'backpack', 1, 'Gloves', 1, { kind: 'armor', locs: ['hand-L'] }), T('h', 'hands', 0, 'Walkie-talkie', 1)])
    const worn = { ...surfaceOf(gear), worn: () => rect(900, 500, 100, 200) }
    expect(lubecDropTargets(gear, byId(gear, 'g'), worn).find((t) => t.dest === 'worn')).toMatchObject({ ok: true, mark: 'worn' })
    expect(lubecDropTargets(gear, byId(gear, 'h'), worn).some((t) => t.dest === 'worn')).toBe(false)
  })

  it('always offers the drop, at what dropping from there costs (Rule M4)', () => {
    const gear = gearOf(FULL)
    const drop = (id: string) => targetsFor(gear, id).find((t) => t.mark === LUBEC_DROP_MARK) as LubecDropTarget
    expect([lubecDropCostText(drop('i1')), lubecDropCostText(drop('i9')), lubecDropCostText(drop('i10'))]).toEqual(['2 actions', 'Free', 'Free'])
  })
})

describe('the target under the pointer', () => {
  const t = (dest: string, r: LubecRect, ok: boolean): LubecDropTarget => ({ dest, rect: () => r, mark: dest, ok, why: ok ? null : 'No.', cost: null })

  it('is the one whose box holds the point, and nothing outside every box', () => {
    const targets = [t('a', rect(0, 0, 10, 10), true), t('b', rect(20, 0, 10, 10), true)]
    expect(lubecTargetAt(targets, 25, 5)?.dest).toBe('b')
    expect(lubecTargetAt(targets, 15, 5)).toBeNull()
  })

  it('prefers an open place to a closed one over the same point, then the nearest centre', () => {
    const closed = t('closed', rect(0, 0, 10, 10), false), open = t('open', rect(0, 0, 40, 40), true)
    expect(lubecTargetAt([closed, open], 5, 5)?.dest).toBe('open')
    const near = t('near', rect(0, 0, 12, 12), true), far = t('far', rect(0, 0, 40, 40), true)
    expect(lubecTargetAt([far, near], 6, 6)?.dest).toBe('near')
  })

  it('says why a closed place won\'t take it, and "Move here" for a move that isn\'t counted', () => {
    expect(lubecDropCostText(t('x', rect(0, 0, 1, 1), false))).toBe('No.')
    expect(lubecDropCostText(t('x', rect(0, 0, 1, 1), true))).toBe('Move here')
  })
})
