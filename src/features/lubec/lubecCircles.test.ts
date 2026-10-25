import { describe, expect, it } from 'vitest'
import type { LubecCheckRoll } from '../ruleSets/lubec/checkRoll'
import type { LubecModifier } from '../ruleSets/lubec/derivations'
import type { LubecPanicRoll } from '../ruleSets/lubec/panicRoll'
import type { LubecRecoveryRoll } from '../ruleSets/lubec/recoveryRoll'
import { lubecCharacterSheet } from '../ruleSets/lubec/sheetFixtures'
import {
  isLubecDoubleRoll,
  lubecBaseNote,
  lubecCircleFace,
  lubecCirclesStatus,
  lubecNoteParts,
  lubecRollCircle,
  lubecRolledSkill,
  lubecRollStatus,
  lubecShownSheet,
  lubecSpinDelay,
  lubecTallyFace,
} from './lubecCircles'

const tommy = lubecCharacterSheet()

const request = (name: 'Strength' | 'Handle' | 'Sanity', modifiers: LubecModifier[] = [], sheet = tommy) => ({ sheet, name, modifiers })

const handleRoll: LubecCheckRoll = {
  kind: 'stat-check', against: 'Handle', target: 65, dice: [32], result: 32,
  advantage: 'normal', skill: 'Boatwork', outcome: 'success', stressAdded: 0,
}

const idle = { armed: null, result: null, spin: null }

const panicRoll: LubecPanicRoll = {
  kind: 'panic', target: 5, dice: [4], result: 4, advantage: 'normal', outcome: 'failure', stressAdded: 0, effectRolls: null,
}

const recoveryRoll: LubecRecoveryRoll = {
  kind: 'recovery', against: 'Body', target: 31, dice: [12, 44], result: 12,
  advantage: 'advantage', outcome: 'success', stressAdded: 0, stressRemoved: 2,
}

describe('Lubec roll circles', () => {
  it('shows the current value, or the armed skill\'s target marked armed, and a hole as missing', () => {
    expect(lubecCircleFace(request('Strength'), idle)).toEqual({ kind: 'value', value: 29, armed: false })
    expect(lubecCircleFace(request('Handle'), { ...idle, armed: 'Boatwork' })).toEqual({ kind: 'value', value: 65, armed: true })
    expect(lubecCircleFace(request('Handle'), { ...idle, armed: 'Scrapping' })).toEqual({ kind: 'value', value: 55, armed: false })
    const holed = lubecCharacterSheet({ class: { key: null, choices: {} } })
    expect(lubecCircleFace(request('Strength', [], holed), idle)).toEqual({ kind: 'missing' })
  })

  it('shows a spin on its own circle before a result, and a result over the value', () => {
    const spin = { name: 'Handle' as const, target: 55, sides: 100, preview: 7, step: 3, counters: tommy.counters }
    expect(lubecCircleFace(request('Handle'), { ...idle, spin, result: handleRoll })).toEqual({ kind: 'rolling', preview: 7, target: 55 })
    expect(lubecCircleFace(request('Strength'), { ...idle, spin })).toEqual({ kind: 'value', value: 29, armed: false })
    expect(lubecCircleFace(request('Handle'), { ...idle, result: handleRoll })).toEqual({ kind: 'result', roll: handleRoll })
  })

  it('notes the base with what the class and effects add to it, and the base alone under a hole', () => {
    expect(lubecNoteParts(request('Sanity'))).toEqual(['+10 class'])
    expect(lubecBaseNote(request('Strength'))).toBe('24 +5 class')
    expect(lubecBaseNote(request('Handle', [{ target: 'Handle', amount: -10 }]))).toBe('50 +5 class -10 effect')
    expect(lubecBaseNote(request('Handle', [{ target: 'Handle', amount: -200 }]))).toBe('50 +5 class -55 effect')
    const classless = lubecCharacterSheet({ class: { key: null, choices: {} } })
    expect(lubecNoteParts(request('Strength', [], classless))).toEqual([])
    expect(lubecBaseNote(request('Strength', [], classless))).toBe('24')
    const noBase = lubecCharacterSheet({ base: { ...tommy.base, Strength: null } })
    expect(lubecBaseNote(request('Strength', [], noBase))).toBe('')
  })

  it('shows no note when the circle already shows the base', () => {
    const tough = lubecCharacterSheet({ class: { key: 'tough', choices: {} } })
    expect(lubecCircleFace(request('Handle', [], tough), idle)).toEqual({ kind: 'value', value: 50, armed: false })
    expect(lubecBaseNote(request('Handle', [], tough))).toBe('')
    expect(lubecBaseNote(request('Strength', [], tough))).toBe('24 +10 class')
  })

  it('says what the circles are doing in the status line', () => {
    expect(lubecCirclesStatus({ name: 'Handle', target: 65, sides: 100, preview: 4, step: 0 }, null, handleRoll)).toBe('Rolling Handle check...')
    expect(lubecCirclesStatus(null, null, handleRoll)).toBe('Handle + Boatwork: 32 vs 65 - success.')
    expect(lubecCirclesStatus(null, handleRoll, handleRoll)).toBe('Handle check cleared. Score unchanged.')
    expect(lubecCirclesStatus(null, null, { ...handleRoll, skill: null, result: 77, outcome: 'failure', stressAdded: 1 }))
      .toBe('Handle: 77 vs 65 - critical failure, +1 Stress.')
    expect(lubecCirclesStatus(null, null, null)).toBe('')
  })

  it('says how a Panic Check or a Recovery Save came out, with both dice under Advantage or Disadvantage', () => {
    expect(lubecRollStatus(panicRoll)).toBe('Panic Check: 4 vs Stress 5 - failure.')
    expect(lubecRollStatus(recoveryRoll)).toBe('Recovery Save on Body (Advantage, 12 and 44): 12 vs 31 - success, -2 Stress.')
    expect(lubecRollStatus({ ...handleRoll, dice: [32, 90], result: 90, advantage: 'disadvantage', outcome: 'failure', stressAdded: 1 }))
      .toBe('Handle + Boatwork (Disadvantage, 32 and 90): 90 vs 65 - failure, +1 Stress.')
  })

  it('shows a Panic Check or a Recovery Save on its own circle, never on the Save it was rolled on', () => {
    expect([panicRoll, recoveryRoll, handleRoll].map(lubecRollCircle)).toEqual(['Panic', 'Recovery', 'Handle'])
  })

  it('shows what the Panic Check or the Recovery Save rolls against, a hole as missing, a spin, and a result', () => {
    const spin = { name: 'Panic' as const, target: 5, sides: 20, preview: 17, step: 0, counters: tommy.counters }
    expect(lubecTallyFace('Panic', 5, idle)).toEqual({ kind: 'value', value: 5, armed: false })
    expect(lubecTallyFace('Recovery', null, idle)).toEqual({ kind: 'missing' })
    expect(lubecTallyFace('Panic', 5, { ...idle, spin })).toEqual({ kind: 'rolling', preview: 17, target: 5 })
    expect(lubecTallyFace('Recovery', 31, { ...idle, spin })).toEqual({ kind: 'value', value: 31, armed: false })
    expect(lubecTallyFace('Panic', 5, { ...idle, result: panicRoll })).toEqual({ kind: 'result', roll: panicRoll })
  })

  it('marks doubles and skills only on a Stat Check or Save', () => {
    expect(isLubecDoubleRoll({ ...handleRoll, result: 33 })).toBe(true)
    expect(isLubecDoubleRoll({ ...panicRoll, result: 11 })).toBe(false)
    expect(isLubecDoubleRoll({ ...recoveryRoll, result: 22 })).toBe(false)
    expect([handleRoll, panicRoll, recoveryRoll].map(lubecRolledSkill)).toEqual(['Boatwork', null, null])
  })

  it('names the Panic Check and the Recovery Save in the status line while they spin or once cleared', () => {
    expect(lubecCirclesStatus({ name: 'Panic', target: 5, sides: 20, preview: 3, step: 0 }, null, null)).toBe('Rolling Panic Check...')
    expect(lubecCirclesStatus({ name: 'Recovery', target: 31, sides: 100, preview: 3, step: 0 }, null, null)).toBe('Rolling Recovery Save...')
    expect(lubecCirclesStatus(null, panicRoll, panicRoll)).toBe('Panic Check cleared. Score unchanged.')
    expect(lubecCirclesStatus(null, recoveryRoll, recoveryRoll)).toBe('Recovery Save cleared. Score unchanged.')
  })

  it('shows the counters as they stood before a spinning roll, and the sheet itself once nothing spins', () => {
    const rolled = { ...tommy, counters: { stress: 3, minimumStress: 2, trauma: 1 } }
    const spin = { name: 'Strength' as const, target: 29, sides: 100, preview: 40, step: 5, counters: tommy.counters }
    expect(lubecShownSheet(rolled, spin)).toEqual({ ...rolled, counters: tommy.counters })
    expect(lubecShownSheet(rolled, null)).toBe(rolled)
  })

  it('slows the spin as the prototype does', () => {
    expect([0, 1, 11].map(lubecSpinDelay)).toEqual([14, 19, 412])
  })
})
