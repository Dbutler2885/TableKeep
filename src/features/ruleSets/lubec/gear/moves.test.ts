/**
 * What moving a thing costs (Rules M1 to M6), cell by cell against the
 * sentence the table carries out. B's `ground` column is the drop, whose
 * destination is the GM's Items tab.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, type LubecGear, type LubecItem } from './gearRecord'
import { MOVE_COST, MOVE_GUESS } from './gearRules'
import { lubecCostText } from './moveCost'
import { lubecArrangeItem, lubecMoveItem, lubecRepackMain } from './moves'
import { packMain } from './placement'

// "Body to hand free, hand to body 1, anything into or out of the backpack 2, hand to worn 1, body to worn 2.
// Taking armor off costs what putting it on does. Dropping from a hand or the body is free, from the backpack 2.
// Moving things around inside the backpack is free: it's only arranging.
// Moving a thing to the other hand is a guess."
const SENTENCE: [from: string, to: string, cost: number, clause: string][] = [
  ['body', 'hands', 0, 'Body to hand free'],
  ['hands', 'body', 1, 'hand to body 1'],
  ['hands', 'backpack', 2, 'anything into the backpack 2'],
  ['body', 'backpack', 2, 'anything into the backpack 2'],
  ['worn', 'backpack', 2, 'anything into the backpack 2'],
  ['backpack', 'hands', 2, 'anything out of the backpack 2'],
  ['backpack', 'body', 2, 'anything out of the backpack 2'],
  ['backpack', 'worn', 2, 'anything out of the backpack 2'],
  ['hands', 'worn', 1, 'hand to worn 1'],
  ['body', 'worn', 2, 'body to worn 2'],
  ['worn', 'hands', 1, 'taking armor off costs what putting it on does: worn to hand 1'],
  ['worn', 'body', 2, 'taking armor off costs what putting it on does: worn to body 2'],
  ['hands', 'drop', 0, 'Dropping from a hand is free'],
  ['body', 'drop', 0, 'Dropping from the body is free'],
  ['backpack', 'drop', 2, 'Dropping from the backpack 2'],
  ['worn', 'drop', 1, 'Dropping worn armor costs what taking it off into a hand does: 1'],
  ['backpack', 'backpack', 0, 'Moving things around inside the backpack is free'],
  ['hands', 'hands', 0, 'Moving a thing to the other hand is a guess'],
]

describe('the move costs (Rules M1 to M6)', () => {
  it.each(SENTENCE)('%s to %s costs %i: %s', (from, to, cost) => {
    expect(MOVE_COST[from as keyof typeof MOVE_COST][to as 'drop']).toBe(cost)
  })

  it('has no cell the sentence does not give', () => {
    const cells = Object.entries(MOVE_COST).flatMap(([from, row]) => Object.keys(row).map((to) => `${from}>${to}`))
    expect(cells.sort()).toEqual(SENTENCE.map(([from, to]) => `${from}>${to}`).sort())
  })

  it('names the drop as a column of its own, and no ground', () => {
    for (const row of Object.values(MOVE_COST)) {
      expect(row).toHaveProperty('drop')
      expect(row).not.toHaveProperty('ground')
    }
  })

  it('has no row for the drop: nothing is moved out of the GM Items tab here', () => {
    expect(Object.keys(MOVE_COST)).toEqual(['hands', 'body', 'backpack', 'worn'])
  })

  it('marks the one guess: a thing to the other hand (Rule M5)', () => {
    expect([...MOVE_GUESS]).toEqual(['hands>hands'])
  })
})

describe('every cell of the table in the sheet\'s words', () => {
  const SENTENCES: Record<string, string> = {
    'body>hands': 'From the body to a hand: free.',
    'hands>body': 'From a hand to the body: 1 action.',
    'hands>backpack': 'From a hand to the backpack: 2 actions.',
    'body>backpack': 'From the body to the backpack: 2 actions.',
    'worn>backpack': 'Taking it off into the backpack: 2 actions.',
    'backpack>hands': 'From the backpack to a hand: 2 actions.',
    'backpack>body': 'From the backpack to the body: 2 actions.',
    'backpack>worn': 'Putting it on from the backpack: 2 actions.',
    'hands>worn': 'Putting it on from a hand: 1 action.',
    'body>worn': 'Putting it on from the body: 2 actions.',
    'worn>hands': 'Taking it off into a hand: 1 action.',
    'worn>body': 'Taking it off onto the body: 2 actions.',
    'hands>drop': 'Dropping it from a hand: free.',
    'body>drop': 'Dropping it from the body: free.',
    'backpack>drop': 'Dropping it from the backpack: 2 actions.',
    'worn>drop': 'Dropping it once it is off: 1 action.',
    'backpack>backpack': "Moving it inside the backpack: free. It's only arranging.",
    'hands>hands': 'Moving it to the other hand: free. (A guess.)',
  }

  it.each(SENTENCE)('%s to %s reads as the table says', (from, to) => {
    expect(lubecCostText(from, to)).toBe(SENTENCES[`${from}>${to}`])
  })
})

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Partial<LubecItem> = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

const CHEST = { id: 'chest', name: 'Bedroom chest', type: 'chest', pockets: [{ name: 'Chest', slots: 12, max: 8 }] }

const gearOf = (...items: unknown[]): LubecGear => parseLubecGear({ items, carriers: [CHEST] })
const byId = (gear: LubecGear, id: string): LubecItem => gear.items.find((i) => i.id === id) as LubecItem

describe('a move inside the character\'s own record (B\'s moveItem)', () => {
  const gear = gearOf(
    T('a', 'backpack', 0, 'Wool watch cap', 1, { cells: [4] }),
    T('b', 'hands', 1, 'Walkie-talkie', 1),
    T('c', 'backpack', 0, 'Small anvil', 1, { weight: 'heavy', check: 'fail' }),
  )

  it('puts the thing in the first free hand or body slot the rule finds, and keeps the rest of it', () => {
    const r = lubecMoveItem(gear, 'a', 'hands')
    expect(r.ok && r.item).toEqual({ ...byId(gear, 'a'), carrier: 'hands', slot: 0, pocket: undefined, cells: undefined })
    expect(r.ok && Object.keys(r.item)).not.toContain('pocket')
  })

  it('keeps every thing in the order it was added, so the main pocket packs the same', () => {
    const r = lubecMoveItem(gear, 'b', 'body#1')
    expect(r.ok && r.gear.items.map((i) => [i.id, i.carrier, i.slot])).toEqual([['a', 'backpack', undefined], ['b', 'body', 1], ['c', 'backpack', undefined]])
  })

  it('keeps the boxes a dragged thing was dropped on in the main pocket, and lets them go anywhere else (Rule W2)', () => {
    const into = lubecMoveItem(gear, 'b', 'backpack#0', [0])
    expect(into.ok && into.item.cells).toEqual([0])
    const out = lubecMoveItem(gear, 'a', 'body', [0])
    expect(out.ok && 'cells' in out.item).toBe(false)
  })

  it('keeps a recorded Strength roll while the thing stays on you, and drops it in a carrier (Rule E5)', () => {
    const held = lubecMoveItem(gearOf(T('c', 'backpack', 0, 'Small anvil', 1, { weight: 'heavy', check: 'fail' })), 'c', 'hands')
    expect(held.ok && held.item.check).toBe('fail')
    const stowed = lubecMoveItem(gear, 'c', 'chest')
    expect(stowed.ok && [stowed.item.carrier, stowed.item.pocket, 'check' in stowed.item]).toEqual(['chest', 0, false])
  })

  it('refuses in the placement rule\'s words, and changes nothing', () => {
    expect(lubecMoveItem(gear, 'c', 'hands')).toEqual({ ok: false, msg: 'A heavy thing takes both hands. Empty both hands first.' })
    expect(lubecMoveItem(gear, 'a', 'backpack#small')).toEqual({ ok: false, msg: 'Only small things go in small stuff. Pick a pocket, or make it Small.' })
  })

  it('says so when the thing is gone', () => {
    expect(lubecMoveItem(gear, 'nope', 'hands')).toEqual({ ok: false, msg: 'That is not on this sheet any more.' })
  })
})

describe('arranging inside the main pocket (Rules W2 and M2)', () => {
  const gear = gearOf(T('a', 'backpack', 0, 'Flashlight', 1, { cells: [4] }), T('b', 'backpack', 0, 'Wool watch cap', 1), T('h', 'hands', 0, 'Walkie-talkie', 1))

  it('puts the thing in the boxes it was dropped on, and packs the rest around it', () => {
    const next = lubecArrangeItem(gear, 'a', [3])
    expect(byId(next, 'a').cells).toEqual([3])
    expect(packMain(next)?.placed.map((p) => [p.item.id, p.at])).toEqual([['a', [3]], ['b', [4]]])
  })

  it('lets go of every arrangement in the main pocket to pack it afresh, and leaves the rest alone', () => {
    const next = lubecRepackMain(lubecArrangeItem(gear, 'b', [0]))
    expect(next.items.map((i) => 'cells' in i)).toEqual([false, false, false])
    expect(byId(next, 'h')).toBe(byId(gear, 'h'))
  })
})
