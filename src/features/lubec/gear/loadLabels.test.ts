/**
 * The words of loading (spec 12.2), word for word as the prototype's checks
 * 25 and 26 print them: the card's buttons with the cost or reason under
 * each, the take-out line, the empty-weapon prompt and the load picker.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecLandPlan } from '../../ruleSets/lubec/gear/loading'
import { LUBEC_SUPPLIES } from '../../ruleSets/lubec/gear/supplies'
import { supplyNameIn } from './gearLabels'
import {
  lubecEmptyText,
  lubecEmptyTitle,
  lubecLandText,
  lubecLoadButtons,
  lubecPickRow,
  lubecPickText,
  lubecReloadRefusalText,
  lubecSupplyMadeToast,
  lubecTakeOutCost,
  type LubecLoadButton,
} from './loadLabels'

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Partial<LubecItem> = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

// Wayne Gardner's things on him, from the prototype's sample, with B's own ids.
const ON_HIM = [
  T('1', 'backpack', 0, 'Flashlight', 1, { kind: 'holder', hold: 'load', takes: 'dcell', capacity: 2, loaded: 2 }),
  T('3', 'backpack', 0, 'Peanut butter sandwich', 1, { kind: 'consumable', qty: 2, per: 2 }),
  T('4', 'backpack', 0, 'D batteries', 1, { kind: 'consumable', qty: 2, per: 4, fits: 'dcell' }),
  T('6', 'backpack', 1, 'Box of .38 rounds', 1, { kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 12 }),
  T('8', 'hands', 0, "Grandpa's revolver", 1, { kind: 'weapon', mode: 'firearm', wounds: ['gun'], capacity: 6, loaded: 0, takes: 'a38' }),
  T('9', 'hands', 1, 'Walkie-talkie', 1),
  T('10', 'body', 0, 'Rain slicker', 1),
  T('11', 'body', 1, 'Pocketknife', 0, { kind: 'weapon', mode: 'melee', wounds: ['cut', 'pierce'] }),
]

const gearOf = (items: unknown[]): LubecGear => parseLubecGear({ items })
const sample = () => gearOf(ON_HIM)
const handFree = () => gearOf(ON_HIM.filter((i) => i.id !== '9'))
const change = (gear: LubecGear, id: string, extra: Partial<LubecItem>): LubecGear => ({ ...gear, items: gear.items.map((i) => (i.id === id ? { ...i, ...extra } : i)) })
const add = (gear: LubecGear, item: unknown): LubecGear => ({ ...gear, items: [...gear.items, gearOf([item]).items[0]] })
const byId = (gear: LubecGear, id: string): LubecItem => gear.items.find((i) => i.id === id) as LubecItem
const supplyName = supplyNameIn(LUBEC_SUPPLIES)

// The buttons as B's check prints them: greyed ones marked, the line under each after a slash.
const shown = (b: readonly LubecLoadButton[]) => b.map((x) => `${x.disabled ? '[x] ' : ''}${x.label}${x.sub ? ` / ${x.sub}` : ''}`).join(' | ')
const buttons = (gear: LubecGear, id: string) => shown(lubecLoadButtons({ gear, supplyName }, byId(gear, id), LUBEC_SUPPLIES))

describe('the card\'s loading buttons (B check 25)', () => {
  it('greys out the box\'s Load while the other hand is busy, and says why', () => {
    expect(buttons(sample(), '6')).toBe(
      '[x] Load / Your other hand holds Walkie-talkie. It needs to hold the .38 rounds, or be empty to fetch them. | Take some out | [x] Put loose ones in / No loose .38 rounds on you',
    )
  })

  it('loads the one gun from the box, with its cost', () => {
    expect(buttons(handFree(), '6')).toBe("Load / Grandpa's revolver: 3 actions, .38 rounds in the backpack | Take some out | [x] Put loose ones in / No loose .38 rounds on you")
  })

  it('offers a full revolver Unload only, and an empty one Reload only', () => {
    expect(buttons(change(handFree(), '8', { loaded: 6 }), '8')).toBe('Unload')
    expect(buttons(handFree(), '8')).toBe('Reload')
    expect(buttons(change(handFree(), '8', { loaded: 3 }), '8')).toBe('Reload | Unload')
  })

  it('loads from loose rounds in the other hand for 1 action', () => {
    const gear = add(handFree(), T('r', 'hands', 1, '.38 rounds', 0, { kind: 'consumable', qty: 6, fits: 'a38' }))
    expect(buttons(gear, 'r')).toBe("Load / Grandpa's revolver: 1 action, .38 rounds in your other hand")
  })

  it('says the revolver is full, and puts loose ones back for free', () => {
    const gear = add(change(handFree(), '8', { loaded: 6 }), T('r', 'backpack', null, '.38 rounds', 0, { kind: 'consumable', qty: 4, fits: 'a38' }))
    expect(buttons(change(gear, '6', { loaded: 2 }), '6')).toBe("[x] Load / Grandpa's revolver is full: 6 of 6 loaded. | Take some out | Put loose ones in / free")
  })

  it('unloads the flashlight into the spare batteries, and greys out loading it out of hand', () => {
    expect(buttons(sample(), '1')).toBe('Unload / into the D batteries, free')
    expect(buttons(change(sample(), '1', { loaded: 0 }), '1')).toBe('[x] Load / Take the flashlight in hand first.')
  })

  it('gives a canteen Use one and Empty, and Fill up once it is not full', () => {
    const gear = add(sample(), T('c', 'body', 0, 'Canteen', 1, { kind: 'holder', hold: 'fill', takes: 'water', capacity: 4, loaded: 4 }))
    expect(buttons(gear, 'c')).toBe('Use one | Empty / Pour it out')
    expect(buttons(change(gear, 'c', { loaded: 0 }), 'c')).toBe('Fill up / At the table')
    expect(buttons(change(gear, 'c', { loaded: 2 }), 'c')).toBe('Use one | Fill up / At the table | Empty / Pour it out')
  })

  it('says when a move into a box is not counted', () => {
    const gear = add(add(sample(), T('cb', 'car', 0, 'Box', 1, { kind: 'holder', hold: 'box', takes: 'a38', capacity: 50, loaded: 0 })), T('cr', 'car', 0, '.38 rounds', 0, { kind: 'consumable', qty: 3, fits: 'a38' }))
    expect(buttons(gear, 'cb')).toContain('Put loose ones in / Not counted')
  })

  it('has no buttons for a thing, a melee weapon or a consumable that is no supply', () => {
    expect([buttons(sample(), '10'), buttons(sample(), '11'), buttons(sample(), '3')]).toEqual(['', '', ''])
  })
})

describe('one Load button, a picker for more (B check 26)', () => {
  const twoGuns = () => add(handFree(), T('900', 'backpack', null, 'Derringer', 0, { kind: 'weapon', mode: 'firearm', wounds: ['gun'], capacity: 2, loaded: 0, takes: 'a38' }))

  it('has one Load button that says how many take it and how many are ready', () => {
    expect(buttons(twoGuns(), '6')).toBe('Load / 2 things on you take .38 rounds, 1 ready | Take some out | [x] Put loose ones in / No loose .38 rounds on you')
    // Two guns in hand: each fills the hand the other would fetch rounds with.
    const both = change(twoGuns(), '900', { carrier: 'hands', slot: 1 })
    expect(buttons(both, '6')).toContain('Load / 2 things on you take .38 rounds, 0 ready |')
  })

  it('asks which, each with its cost or greyed out with the reason', () => {
    const gear = twoGuns(), words = { gear, supplyName }, box = byId(gear, '6')
    expect(lubecPickText(words, box)).toBe('2 things on you take .38 rounds. Loading draws from the box of .38 rounds first.')
    expect(lubecPickRow(words, box, byId(gear, '8'))).toEqual({ sub: '0 of 6 now / 3 actions, .38 rounds in the backpack', disabled: false })
    expect(lubecPickRow(words, box, byId(gear, '900'))).toEqual({ sub: 'Take the derringer in hand first.', disabled: true })
  })

  it('greys out a loose supply\'s Load with nothing on you to take it', () => {
    expect(buttons(sample(), '4')).toBe('[x] Load / Take the flashlight in hand first.')
    const gear = add(sample(), T('s', 'backpack', null, 'Slingshot shot', 0, { kind: 'consumable', qty: 20, fits: 'shot' }))
    expect(buttons(gear, 's')).toBe('[x] Load / Nothing on you takes Slingshot shot')
  })
})

describe('the words around loading', () => {
  it('says why loading is refused, word for word', () => {
    const w = byId(sample(), '8')
    expect(lubecReloadRefusalText(w, { why: 'busy-hand', holds: byId(sample(), '9') }, supplyName)).toBe('Your other hand holds Walkie-talkie. It needs to hold the .38 rounds, or be empty to fetch them.')
    expect(lubecReloadRefusalText(w, { why: 'none-on-you' }, supplyName)).toBe("No .38 rounds on you. A carrier doesn't count.")
    expect(lubecReloadRefusalText({ ...w, loaded: 6 }, { why: 'full' }, supplyName)).toBe("Grandpa's revolver is full: 6 of 6 loaded.")
    expect(lubecReloadRefusalText(byId(sample(), '1'), { why: 'not-in-hand' }, supplyName)).toBe('Take the flashlight in hand first.')
    expect(lubecReloadRefusalText(w, { why: 'gone' }, supplyName)).toBe("Take Grandpa's revolver in hand first.")
  })

  it('says where taking some out of the box lands, or the range it takes', () => {
    const gear = handFree(), box = byId(gear, '6')
    expect(lubecTakeOutCost(gear, box, 4, LUBEC_SUPPLIES, supplyName)).toBe('Backpack, small stuff, free.')
    expect(lubecTakeOutCost(gear, box, 0, LUBEC_SUPPLIES, supplyName)).toBe('Take out 1 to 12.')
    expect(lubecTakeOutCost(gear, box, 13, LUBEC_SUPPLIES, supplyName)).toBe('Take out 1 to 12.')
  })

  it('says a landing into a stack, a new stack in a hand, and no room', () => {
    const loaded = change(handFree(), '8', { loaded: 6 })
    expect(lubecLandText(byId(loaded, '8'), lubecLandPlan(loaded, byId(loaded, '8'), 6, LUBEC_SUPPLIES), supplyName)).toBe('right hand, free')
    expect(lubecLandText(byId(loaded, '8'), { ok: false, n: 6, why: 'no-room' }, supplyName)).toBe('No room on you for 6 loose .38 rounds. Make room, or put them in a box.')
    const full = add(loaded, T('w2', 'hands', 1, 'Walkie-talkie', 1))
    expect(lubecLandText(byId(full, '8'), lubecLandPlan(full, byId(full, '8'), 6, LUBEC_SUPPLIES), supplyName)).toBe('into the box of .38 rounds, 2 actions')
  })

  it('names the empty weapon, and says what reloading takes or why it can\'t', () => {
    const w = byId(handFree(), '8')
    expect(lubecEmptyTitle(w)).toBe("Grandpa's revolver isn't loaded")
    expect(lubecEmptyText(handFree(), w, supplyName)).toBe('Reloading takes 3 actions, .38 rounds in the backpack.')
    expect(lubecEmptyText(sample(), w, supplyName)).toBe('Your other hand holds Walkie-talkie. It needs to hold the .38 rounds, or be empty to fetch them.')
  })

  it('says a made supply is now one on this sheet', () => {
    expect(lubecSupplyMadeToast('Film')).toBe('Film is now a supply on this sheet.')
  })
})
