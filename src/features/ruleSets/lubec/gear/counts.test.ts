/**
 * The counts on an item's card: a consumable steps down to used up and leaves
 * the sheet (Rule K4), a full stack refuses + (Rule S3), and a holder's
 * contents step between empty and full and stay at 0 (Rule K5).
 */
import { describe, expect, it } from 'vitest'
import { lubecUseOne, stepLubecLoaded, stepLubecQty } from './counts'
import { emptyLubecGear, type LubecGear, type LubecItem } from './gearRecord'

const item = (extra: Partial<LubecItem>): LubecItem =>
  ({ id: 'i', kind: 'thing', name: 'Marbles', note: '', size: 1, weight: 'normal', qty: 1, carrier: 'backpack', pocket: 0, ...extra })

const gearOf = (...items: LubecItem[]): LubecGear => ({ ...emptyLubecGear(), items })

describe('stepping a count', () => {
  const sandwich = item({ kind: 'consumable', name: 'Peanut butter sandwich', qty: 2, per: 2 })
  const other = item({ id: 'o', name: 'Rope' })

  it('takes one off and keeps the item while some are left', () => {
    expect(stepLubecQty(gearOf(sandwich, other), sandwich, -1)).toEqual({ ok: true, gone: false, gear: gearOf({ ...sandwich, qty: 1 }, other) })
  })

  it('uses up a consumable at 0, which leaves the sheet', () => {
    expect(stepLubecQty(gearOf({ ...sandwich, qty: 1 }, other), { ...sandwich, qty: 1 }, -1)).toEqual({ ok: true, gone: true, gear: gearOf(other) })
  })

  it('keeps anything else at 0, and never goes below it', () => {
    const marbles = item({ qty: 0, size: 0 })
    expect(stepLubecQty(gearOf(marbles), marbles, -1)).toEqual({ ok: true, gone: false, gear: gearOf(marbles) })
  })

  it('refuses + on a full stack, with the prototype\'s words', () => {
    expect(stepLubecQty(gearOf(sandwich), sandwich, 1)).toEqual({ ok: false, msg: 'This stack is full: 2 fit in one slot. Add another stack for more.' })
    const box = item({ kind: 'consumable', size: 2, per: 3, qty: 3 })
    expect(stepLubecQty(gearOf(box), box, 1)).toEqual({ ok: false, msg: 'This stack is full: 3 fit in 2 slots. Add another stack for more.' })
    expect(stepLubecQty(gearOf({ ...sandwich, qty: 1 }), { ...sandwich, qty: 1 }, 1)).toEqual({ ok: true, gone: false, gear: gearOf({ ...sandwich, qty: 2 }) })
  })

  it('uses one with "Use one", and the last one is used up (Rule L10)', () => {
    expect(lubecUseOne(gearOf(sandwich), sandwich)).toEqual({ ok: true, gone: false, gear: gearOf({ ...sandwich, qty: 1 }) })
    expect(lubecUseOne(gearOf({ ...sandwich, qty: 1 }), { ...sandwich, qty: 1 })).toEqual({ ok: true, gone: true, gear: gearOf() })
  })
})

describe('stepping a holder\'s contents', () => {
  const box = item({ kind: 'holder', name: 'Box of .38 rounds', hold: 'box', takes: 'a38', capacity: 50, loaded: 1 })

  it('steps between empty and full, and a box at 0 stays on the sheet', () => {
    expect(stepLubecLoaded(gearOf(box), box, -1)).toEqual(gearOf({ ...box, loaded: 0 }))
    expect(stepLubecLoaded(gearOf({ ...box, loaded: 0 }), { ...box, loaded: 0 }, -1)).toEqual(gearOf({ ...box, loaded: 0 }))
    expect(stepLubecLoaded(gearOf({ ...box, loaded: 50 }), { ...box, loaded: 50 }, 1)).toEqual(gearOf({ ...box, loaded: 50 }))
  })

  it('reads a holder with no numbers stored as empty and full at once', () => {
    const bare = item({ kind: 'holder' })
    expect(stepLubecLoaded(gearOf(bare), bare, 1)).toEqual(gearOf({ ...bare, loaded: 0 }))
  })
})
