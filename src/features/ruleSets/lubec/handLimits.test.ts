import { describe, expect, it } from 'vitest'
import type { LubecEffect, LubecEffectStep, LubecRestriction } from './effects'
import { stepDownLubecSheet } from './stepDown'
import { lubecBothHandsRefusal, lubecHandLimits, lubecHandUnusable, LUBEC_FREE_HANDS } from './handLimits'
import { emptyLubecGear, type LubecGear, type LubecItem } from './gear/gearRecord'
import { place } from './gear/placement'
import { lubecFisticuffsHands, lubecFreeHands } from './gear/held'
import { lubecReloadPlan } from './gear/loading'
import { lubecPlaceDetached } from './gear/detachedItems'
import { LUBEC_STARTING_COUNTERS } from './counters'

const step = (restrictions: LubecRestriction[], extra: Partial<LubecEffectStep> = {}): LubecEffectStep => ({ modifiers: [], labels: [], until: 'long-rest', restrictions, ...extra })
const card = (id: string, steps: LubecEffectStep[], extra: Partial<LubecEffect> = {}): LubecEffect => ({ id, name: id, cause: '', steps, ...extra })
const armOut = (side: 'L' | 'R') => card(`arm-${side}`, [step([{ kind: 'arm-unusable', side }], { until: 'put-back' }), step([], { modifiers: [{ target: 'Handle', amount: -20 }] })], { name: 'Dislocated shoulder', part: 'Shoulder' })

const thing = (id: string, extra: Partial<LubecItem> = {}): LubecItem =>
  ({ id, kind: 'thing', carrier: 'backpack', pocket: 0, name: id, size: 1, qty: 1, weight: 'normal', note: '', ...extra } as LubecItem)
const gearWith = (...items: LubecItem[]): LubecGear => ({ ...emptyLubecGear(), items })

describe('the hand limits the active cards set', () => {
  it('takes the struck side\'s hand out for an unusable arm or a hand that cannot grip, and says which card', () => {
    const hands = lubecHandLimits([armOut('L'), card('Wrist slashed', [step([{ kind: 'no-grip', side: 'R' }], { until: 'combat-end' })], { part: 'Grip' })])
    expect(hands.unusable).toEqual([
      { slot: 0, why: 'Left arm unusable (Dislocated shoulder)' },
      { slot: 1, why: 'Right hand cannot grip (Wrist slashed)' },
    ])
    expect(lubecHandUnusable(hands, 1)).toBe('Right hand cannot grip (Wrist slashed)')
  })

  it('forbids two-handed things for "two-handed actions impossible" and for any hand out', () => {
    const crushed = lubecHandLimits([card('Crushed hand', [step([{ kind: 'no-two-handed' }])])])
    expect(crushed).toEqual({ unusable: [], noTwoHanded: 'Two-handed actions impossible (Crushed hand)' })
    expect(lubecBothHandsRefusal(lubecHandLimits([armOut('R')]))).toBe('Right arm unusable (Dislocated shoulder)')
  })

  it('reads only the current step: a later step, a converted card and a numeric Handle penalty never take a hand', () => {
    const later = card('later', [step([]), step([{ kind: 'arm-unusable', side: 'R' }])])
    const converted = card('converted', [step([{ kind: 'arm-unusable', side: 'R' }])], { afterCombat: { fightId: 'f' } })
    const numeric = card('numeric', [{ modifiers: [{ target: 'Handle', amount: -90 }], labels: [] }])
    const ten = card('ten', [{ modifiers: [], labels: [], setTo: [{ target: 'Handle', value: 10 }] } as LubecEffectStep])
    expect(lubecHandLimits([later, converted, numeric, ten])).toEqual(LUBEC_FREE_HANDS)
  })

  it('gives the hand back once Step down puts the joint back, leaving the printed penalty and any other card\'s limit', () => {
    const grip = card('grip', [step([{ kind: 'no-grip', side: 'L' }], { until: 'combat-end' })])
    const stepped = stepDownLubecSheet({ effects: [armOut('R'), grip], counters: LUBEC_STARTING_COUNTERS }, 'arm-R')
    expect(stepped.effects[0].steps).toEqual([step([], { modifiers: [{ target: 'Handle', amount: -20 }] })])
    expect(lubecHandLimits(stepped.effects).unusable.map((limit) => limit.slot)).toEqual([0])
  })
})

describe('Gear placement under hand limits', () => {
  const rightOut = lubecHandLimits([armOut('R')])

  it('refuses the unusable hand even when empty, and uses the other', () => {
    const knife = thing('knife')
    expect(place(gearWith(), 'hands#1', knife, null, rightOut)).toEqual({ ok: false, msg: 'Right arm unusable (Dislocated shoulder): that hand cannot hold anything.' })
    expect(place(gearWith(), 'hands', knife, null, rightOut)).toEqual({ ok: true, carrier: 'hands', slot: 0 })
    expect(place(gearWith(thing('lamp', { carrier: 'hands', slot: 0 })), 'hands', knife, null, rightOut)).toMatchObject({ ok: false, msg: 'Right arm unusable (Dislocated shoulder), and no other hand is free.' })
  })

  it('refuses a two-handed thing while two-handed actions are impossible, and lets a one-handed thing in', () => {
    const crushed = lubecHandLimits([card('Crushed hand', [step([{ kind: 'no-two-handed' }])])])
    expect(place(gearWith(), 'hands', thing('spear', { size: 2 }), null, crushed)).toEqual({ ok: false, msg: 'Two-handed actions impossible (Crushed hand): a 2-slot thing takes both hands.' })
    expect(place(gearWith(), 'hands', thing('knife'), null, crushed)).toMatchObject({ ok: true })
  })

  it('counts free usable hands for Fisticuffs', () => {
    expect(lubecFreeHands(gearWith(), rightOut)).toBe(1)
    expect(lubecFisticuffsHands(gearWith(), rightOut)).toBe('left')
    expect(lubecFisticuffsHands(gearWith(thing('lamp', { carrier: 'hands', slot: 0 })), rightOut)).toBeNull()
  })

  it('refuses a pickup or a catch into an unusable hand', () => {
    const detached = { item: { ...thing('ball'), carrier: undefined, pocket: undefined } as never, supplies: [] }
    const full = gearWith(thing('lamp', { carrier: 'hands', slot: 0 }))
    expect(lubecPlaceDetached(full, detached, { commandId: 'c', role: 'pickup' }, 'hands', rightOut)).toMatchObject({ ok: false })
    expect(lubecPlaceDetached(full, detached, { commandId: 'c', role: 'pickup' }, 'hands')).toMatchObject({ ok: true })
  })

  it('refuses a reload, which takes both hands, while either hand is out', () => {
    const gun = thing('gun', { kind: 'weapon', carrier: 'hands', slot: 0, mode: 'firearm', capacity: 6, loaded: 0, takes: 'rounds' } as Partial<LubecItem>)
    expect(lubecReloadPlan(gearWith(gun), gun, null, rightOut)).toEqual({ ok: false, why: 'hand-unusable', because: 'Right arm unusable (Dislocated shoulder)' })
  })
})
