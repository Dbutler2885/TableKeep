/**
 * The words of a move: the card's Move list and cost line, the refusal with
 * its swap hint, and the toasts, as the prototype (B) words them. The drop's
 * toast is B's first one, restored: a dropped thing goes to the GM.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear, type LubecGear, type LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecSwapItems } from '../../ruleSets/lubec/gear/swap'
import {
  cap1,
  lubecArrangedToast,
  lubecDroppedToast,
  lubecFirstMove,
  lubecMoveCostLine,
  lubecMovedToast,
  lubecMoveGroups,
  lubecRefusal,
  lubecSwapOf,
  lubecSwappedToast,
  theName,
} from './moveLabels'

const T = (id: string, carrier: string, at: number | null, name: string, size: number, extra: Partial<LubecItem> = {}) => ({
  id, kind: 'thing', carrier, ...(['hands', 'body'].includes(carrier) ? { slot: at } : { pocket: at }), name, size, qty: 1, weight: 'normal', note: '', ...extra,
})

const gearOf = (...items: unknown[]): LubecGear => parseLubecGear({ items })
const byId = (gear: LubecGear, id: string): LubecItem => gear.items.find((i) => i.id === id) as LubecItem

const gear = gearOf(
  T('f', 'backpack', 0, 'Flashlight', 1),
  T('r', 'hands', 0, "Grandpa's revolver", 1, { kind: 'weapon', mode: 'firearm' }),
  T('k', 'backpack', null, 'House key', 0),
  T('h', 'worn', null, 'Hockey helmet', 2, { kind: 'armor', locs: ['head'] }),
)

describe('a thing by name', () => {
  it('is "the" thing, lower-cased, unless it is someone\'s or starts with a capital that stays', () => {
    expect([theName({ name: 'Flashlight' }), theName({ name: "Grandpa's revolver" }), theName({ name: 'D batteries' })]).toEqual(['the flashlight', "Grandpa's revolver", 'the D batteries'])
    expect(cap1('free')).toBe('Free')
  })
})

describe('the card\'s Move list', () => {
  it('offers the places on you with what is free, greying out where it is, then the drop, then the swaps', () => {
    const groups = lubecMoveGroups(gear, byId(gear, 'f'))
    expect(groups.map((g) => [g.label, g.options.map((o) => `${o.disabled ? '[x] ' : ''}${o.label}`)])).toEqual([
      ['On you', ['[x] Backpack: main pocket (4 of 5 free)', 'Backpack: front left (1 of 1 free)', 'Backpack: front right (1 of 1 free)', 'Backpack: small stuff (no slot)', 'Hands (1 free)', 'Body (2 free)']],
      ['Elsewhere', ['Drop it']],
      ['Swap places', ["Swap with Grandpa's revolver (left hand)"]],
    ])
  })

  it('offers armor "Wear it" first, and leaves out the swaps for what can\'t swap', () => {
    const groups = lubecMoveGroups(gear, byId(gear, 'h'))
    expect(groups.map((g) => g.label)).toEqual(['On you', 'Elsewhere'])
    expect(groups[0].options[0]).toEqual({ value: 'worn', label: 'Wear it', disabled: true })
    expect(groups[0].options.filter((o) => o.value === 'worn')).toHaveLength(1)
  })

  it('starts on the first place it can go', () => {
    expect(lubecFirstMove(lubecMoveGroups(gear, byId(gear, 'f')))).toBe('backpack#1')
    expect(lubecFirstMove([{ label: 'On you', options: [{ value: 'hands', label: 'Hands', disabled: true }] }])).toBe('drop')
  })

  it('reads a "Swap with" choice as the thing it names', () => {
    expect(lubecSwapOf(gear, 'swap:r')?.name).toBe("Grandpa's revolver")
    expect(lubecSwapOf(gear, 'hands')).toBeNull()
  })

  it('says under the list what the move or the swap costs', () => {
    const f = byId(gear, 'f')
    expect(lubecMoveCostLine(gear, f, 'hands')).toBe('From the backpack to a hand: 2 actions.')
    expect(lubecMoveCostLine(gear, f, 'drop')).toBe('Dropping it from the backpack: 2 actions.')
    expect(lubecMoveCostLine(gear, f, 'swap:r')).toBe("Swapping with Grandpa's revolver: 4 actions (a guess).")
  })
})

describe('a refused move', () => {
  it('points at swapping when the thing has something to swap with', () => {
    expect(lubecRefusal(gear, byId(gear, 'f'), 'Both hands are full.')).toBe('Both hands are full. Or swap it: pick "Swap with" a thing in this list, or drag it onto one.')
  })

  it('is the rule\'s words alone when it has none', () => {
    expect(lubecRefusal(gear, byId(gear, 'k'), 'Both hands are full.')).toBe('Both hands are full.')
  })
})

describe('the toasts', () => {
  it('says where a moved thing is and what it cost, and nothing of a cost that isn\'t counted', () => {
    const held = { ...byId(gear, 'f'), carrier: 'hands', slot: 1, pocket: undefined }
    expect(lubecMovedToast(held, 'backpack', 'hands')).toBe('Flashlight: Right hand. 2 actions.')
    expect(lubecMovedToast({ ...held, carrier: 'body', slot: 0 }, 'hands', 'body#0')).toBe('Flashlight: Body slot. 1 action.')
    expect(lubecMovedToast(held, 'chest', 'hands')).toBe('Flashlight: Right hand.')
  })

  it('says where each swapped thing is, and the cost', () => {
    const s = lubecSwapItems(gear, byId(gear, 'r'), byId(gear, 'f'))
    expect(s.ok && lubecSwappedToast(s.a, s.b, s.cost)).toBe("Grandpa's revolver: Backpack, main pocket. Flashlight: Left hand. 4 actions (a guess).")
  })

  it('says arranging is free', () => {
    expect(lubecArrangedToast(byId(gear, 'f'))).toBe('Flashlight: arranged. Free.')
  })

  it('says a dropped thing goes to the GM (B 2966, restored)', () => {
    expect(lubecDroppedToast(byId(gear, 'f'))).toBe('Dropped the flashlight. It goes to the GM.')
  })
})
