import { describe, expect, it } from 'vitest'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import type { CombatAttack, CombatState } from './engine/types'
import { planWoundDrop, withWoundDrop } from './woundDrop'
import { combatWoundIntention } from './woundIntention'
import type { CombatWound } from './woundTypes'

const inHand = (id: string, name: string, slot: number, extra: Record<string, unknown> = {}) =>
  ({ id, kind: 'thing', carrier: 'hands', slot, name, size: 1, qty: 1, weight: 'normal', note: '', ...extra })
const raw = (...items: object[]) => ({ sheetRevision: 3, lubec: { ...lubecCharacterSheet(), gear: { ...lubecCharacterSheet().gear, items } } })
const knife = inHand('knife', 'Knife', 1)
const lantern = inHand('lantern', 'Lantern', 0)

const wound = (overrides: Partial<CombatWound> = {}): CombatWound => ({
  id: 'w1', target: { kind: 'npc', sheetId: 'roy' }, originatingRound: 1, effectiveRound: 1, traumaDelta: 1, stressDelta: 0,
  effects: [{ id: 'e', cardKey: 'hand', name: 'Hand', cause: 'c', steps: [{ modifiers: [], labels: [] }], wound: { row: 'Stab through the hand', drop: { hand: 'right' } } }],
  drop: { hand: 'right' }, ...overrides,
})

const attack = (woundId: string, line: string): CombatAttack =>
  ({ id: 'a', grantId: null, attackerKey: 'x', step: 'done', detached: [], closed: true, woundId, rowSections: [{ label: 'Now', items: [line, 'Other'] }] })

const state = (overrides: Partial<CombatState> = {}): CombatState =>
  ({ round: 1, phase: 'attack', stageInstanceId: 's', combatants: [], floor: [], attack: null, woundOutbox: [], woundAcknowledgements: [], ...overrides })

describe('planning a wound drop from the sheet', () => {
  it('takes the whole stack in the struck hand off the sheet, by its record id', () => {
    const planned = planWoundDrop(raw(lantern, { ...knife, qty: 3 }), 'right')
    expect(planned).toMatchObject({ hand: 'right', held: 'Knife', detached: { item: { id: 'knife', qty: 3 } } })
    for (const field of ['carrier', 'slot']) expect(planned.detached!.item).not.toHaveProperty(field)
    expect(planned.edits).toEqual([{ kind: 'remove', path: ['lubec', 'gear', 'items', { recordId: 'knife' }], base: { exists: true, value: { ...knife, qty: 3 } } }])
  })

  it('reads the left hand, and a two-handed thing from either hand', () => {
    expect(planWoundDrop(raw(lantern, knife), 'left').held).toBe('Lantern')
    expect(planWoundDrop(raw(inHand('spear', 'Spear', 0, { weight: 'heavy' })), 'right').held).toBe('Spear')
  })

  it('drops nothing from an empty hand or from things kept elsewhere', () => {
    expect(planWoundDrop(raw(lantern, { ...knife, carrier: 'backpack', pocket: 0 }), 'right')).toEqual({ hand: 'right', held: null, edits: [], detached: null })
  })
})

describe('the fight after a wound drop', () => {
  it('puts the record on the Floor and names what fell on the attack that queued the wound', () => {
    const planned = planWoundDrop(raw(knife), 'right')
    const before = state({ attack: attack('w1', 'Whatever the right hand holds drops onto the Floor'), lastAttack: attack('w0', 'Whatever the right hand holds drops onto the Floor') })
    const after = withWoundDrop(before, wound(), planned)
    expect(after.floor.map((record) => record.item.id)).toEqual(['knife'])
    expect(after.attack!.rowSections![0].items).toEqual(['The Knife drops from the right hand onto the Floor', 'Other'])
    expect(after.lastAttack!.rowSections![0].items[0]).toBe('Whatever the right hand holds drops onto the Floor')
  })

  it('says an empty hand dropped nothing and leaves the Floor alone', () => {
    const after = withWoundDrop(state({ attack: attack('w1', 'Whatever the right hand holds drops onto the Floor') }), wound(), planWoundDrop(raw(), 'right'))
    expect(after.floor).toEqual([])
    expect(after.attack!.rowSections![0].items[0]).toBe('The right hand held nothing to drop')
  })

  it('refuses an item the Floor already owns', () => {
    const planned = planWoundDrop(raw(knife), 'right')
    expect(() => withWoundDrop(state({ floor: [planned.detached!] }), wound(), planned)).toThrow('An item already has an owner.')
  })
})

describe('the wound\'s sheet change with its drop', () => {
  it('adds the keyed removal and names the dropped item in the cards\' wound detail', () => {
    const planned = planWoundDrop(raw(knife), 'right')
    const intention = combatWoundIntention(raw(knife), wound(), 'fight', 'op', planned)
    expect(intention.edits.at(-1)).toEqual(planned.edits[0])
    const insert = intention.edits.find((edit) => edit.kind === 'insert') as { record: { wound: unknown } }
    expect(insert.record.wound).toEqual({ row: 'Stab through the hand', groupId: 'op', drop: { hand: 'right', held: 'Knife' } })
  })

  it('refuses a drop without a hand', () => {
    expect(() => combatWoundIntention(raw(), wound({ drop: { hand: 'up' as 'left' } }), 'fight', 'op')).toThrow('A wound drop needs a hand.')
  })
})
