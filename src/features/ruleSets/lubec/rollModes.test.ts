import { describe, expect, it } from 'vitest'
import { rollLubecCheck } from './checkRoll'
import type { LubecEffect, LubecEffectStep, LubecRollRule } from './effects'
import { lubecModeReason, lubecRollMode, lubecTaskModifiers, type LubecRollRequest } from './rollModes'
import { lubecCharacterSheet } from './sheetFixtures'

const step = (rolls: LubecRollRule[], extra: Partial<LubecEffectStep> = {}): LubecEffectStep => ({ modifiers: [], labels: [], until: 'long-rest', rolls, ...extra })
const card = (id: string, name: string, ...steps: LubecEffectStep[]): LubecEffect => ({ id, name, cause: '', steps })
const dis = (scope: LubecRollRule['scope']): LubecRollRule => ({ scope, mode: 'disadvantage' })
const adv = (scope: LubecRollRule['scope']): LubecRollRule => ({ scope, mode: 'advantage' })

const strengthCheck: LubecRollRequest = { kind: 'check', stat: 'Strength' }
const bodySave: LubecRollRequest = { kind: 'save', stat: 'Body' }
const attack: LubecRollRequest = { kind: 'attack', stat: 'Handle' }
const defense: LubecRollRequest = { kind: 'defense', stat: 'Handle' }
const intellect: LubecRollRequest = { kind: 'check', stat: 'Intellect' }
const modeOf = (effects: LubecEffect[], request: LubecRollRequest) => lubecRollMode(effects, request).mode

describe('the scope words', () => {
  it.each([
    ['checks', [strengthCheck, attack, defense, intellect], [bodySave]],
    ['saves', [bodySave], [strengthCheck, attack]],
    ['rolls', [strengthCheck, bodySave, attack, defense, intellect], []],
    ['physical', [strengthCheck, attack, defense, { kind: 'check', stat: 'Speed' }, { kind: 'check', stat: 'Handle' }], [intellect, bodySave]],
    ['strength', [strengthCheck, { kind: 'strength-impact', stat: 'Strength' }], [attack, bodySave]],
    ['speed', [{ kind: 'stand', stat: 'Speed' }, { kind: 'initiative', stat: 'Speed' }], [strengthCheck]],
    ['attacks', [attack], [defense, strengthCheck]],
    ['defense', [defense], [attack]],
  ] as const)('%s covers what it says and nothing else', (scope, covered, missed) => {
    const effects = [card('c', 'Card', step([dis(scope)]))]
    for (const request of covered) expect(modeOf(effects, request), JSON.stringify(request)).toBe('disadvantage')
    for (const request of missed) expect(modeOf(effects, request), JSON.stringify(request)).toBe('normal')
  })

  it('keeps a task scope narrow: it counts only when the roll is that action', () => {
    const effects = [card('k', 'Battered knuckles', step([dis({ task: 'punch' })])), card('a', 'Bruised arm', step([dis({ task: 'punch-throw' })]))]
    expect(modeOf(effects.slice(0, 1), attack)).toBe('normal')
    expect(modeOf(effects.slice(0, 1), { ...attack, actions: ['punch'] })).toBe('disadvantage')
    expect(modeOf(effects.slice(1), { ...attack, actions: ['throw'] })).toBe('disadvantage')
    expect(modeOf(effects.slice(0, 1), { ...attack, actions: ['throw'] })).toBe('normal')
  })
})

describe('combining cards', () => {
  it('does not stack sources of one sign, and names each', () => {
    const resolved = lubecRollMode([card('a', 'Ribs', step([dis('physical')])), card('b', 'Leg', step([dis('speed')]))], { kind: 'check', stat: 'Speed' })
    expect(resolved).toEqual({ mode: 'disadvantage', sources: [{ id: 'a', name: 'Ribs', mode: 'disadvantage' }, { id: 'b', name: 'Leg', mode: 'disadvantage' }] })
    expect(lubecModeReason(resolved)).toBe('Disadvantage from Ribs, Leg')
  })

  it('cancels any Advantage against any Disadvantage, whatever the count', () => {
    const effects = [card('a', 'Ribs', step([dis('physical')])), card('b', 'Leg', step([dis('attacks')])), card('c', 'Caught their fist', step([adv('attacks')]))]
    const resolved = lubecRollMode(effects, attack)
    expect(resolved.mode).toBe('normal')
    expect(lubecModeReason(resolved)).toBe('Advantage from Caught their fist cancels Disadvantage from Ribs, Leg')
  })

  it('reads the current step only, never a later step or a step\'s words', () => {
    const later = card('l', 'Ribs', { modifiers: [], labels: ['Physical Checks at Disadvantage'] }, step([dis('physical')]))
    expect(modeOf([later], strengthCheck)).toBe('normal')
    expect(lubecRollMode([card('h', 'Hand-made', { modifiers: [], labels: ['Disadvantage on everything'] })], strengthCheck)).toEqual({ mode: 'normal', sources: [] })
  })

  it('never takes a mode from a discretionary Charm reminder', () => {
    const jaw = card('j', 'Jaw', { modifiers: [], labels: [], until: 'lasting', charmReminder: true })
    expect(modeOf([jaw], { kind: 'check', stat: 'Charm' })).toBe('normal')
  })
})

describe('task-only penalties', () => {
  it('count only for the matching action, and broad penalties stay general', () => {
    const eye = card('e', 'Eye', { modifiers: [{ target: 'Handle', amount: -5 }], labels: [], taskModifiers: [{ target: 'Handle', amount: -20, task: 'ranged-visual' }] })
    expect(lubecTaskModifiers([eye], { actions: [] })).toEqual([])
    expect(lubecTaskModifiers([eye], { actions: ['ranged'] })).toEqual([{ target: 'Handle', amount: -20 }])
    expect(lubecTaskModifiers([eye], { actions: ['visually-precise'] })).toEqual([{ target: 'Handle', amount: -20 }])
  })
})

describe('a Core roll', () => {
  /** d100 faces in order, as the roller's dice give them. */
  const dice = (...values: number[]) => () => (values.shift()! - 1) / 100
  const ribs = card('r', 'Broken rib(s)', step([dis('physical')]))

  it('takes the mode from the cards when none is set by hand, keeps the higher die under Disadvantage, and says why', () => {
    const sheet = lubecCharacterSheet({ effects: [ribs] })
    const roll = rollLubecCheck(sheet, { name: 'Strength', advantage: null, skill: null }, dice(12, 80))!
    expect(roll).toMatchObject({ advantage: 'disadvantage', dice: [12, 80], result: 80, outcome: 'failure', because: 'Disadvantage from Broken rib(s)' })
  })

  it('lets a mode set by hand override the cards', () => {
    const sheet = lubecCharacterSheet({ effects: [ribs] })
    const roll = rollLubecCheck(sheet, { name: 'Strength', advantage: 'normal', skill: null }, dice(12))!
    expect(roll).toMatchObject({ advantage: 'normal', dice: [12] })
    expect(roll.because).toBeUndefined()
  })

  it('applies a ranged penalty only to a roll named ranged, and leaves a Save alone under a Checks card', () => {
    const eye = card('e', 'Eye', { modifiers: [], labels: [], taskModifiers: [{ target: 'Handle', amount: -20, task: 'ranged-visual' }] })
    const sheet = lubecCharacterSheet({ effects: [eye, card('f', 'Forearm', step([dis('checks')]))] })
    expect(rollLubecCheck(sheet, { name: 'Handle', advantage: null, skill: null }, dice(10, 10))!.target).toBe(55)
    expect(rollLubecCheck(sheet, { name: 'Handle', advantage: null, skill: null, actions: ['ranged'] }, dice(10, 10))).toMatchObject({ target: 35, actions: ['ranged'] })
    expect(rollLubecCheck(sheet, { name: 'Body', advantage: null, skill: null }, dice(10))).toMatchObject({ advantage: 'normal' })
  })
})
