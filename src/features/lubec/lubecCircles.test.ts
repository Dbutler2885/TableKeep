import { describe, expect, it } from 'vitest'
import type { LubecCheckRoll } from '../ruleSets/lubec/checkRoll'
import type { LubecModifier } from '../ruleSets/lubec/derivations'
import { lubecCharacterSheet } from '../ruleSets/lubec/sheetFixtures'
import { lubecBaseNote, lubecCircleFace, lubecCirclesStatus, lubecNoteParts, lubecSpinDelay } from './lubecCircles'

const tommy = lubecCharacterSheet()

const request = (name: 'Strength' | 'Handle' | 'Sanity', modifiers: LubecModifier[] = [], sheet = tommy) => ({ sheet, name, modifiers })

const handleRoll: LubecCheckRoll = {
  kind: 'stat-check', against: 'Handle', target: 65, dice: [32], result: 32,
  advantage: 'normal', skill: 'Boatwork', outcome: 'success', stressAdded: 0,
}

const idle = { armed: null, result: null, spin: null }

describe('Lubec roll circles', () => {
  it('shows the current value, or the armed skill\'s target marked armed, and a hole as missing', () => {
    expect(lubecCircleFace(request('Strength'), idle)).toEqual({ kind: 'value', value: 29, armed: false })
    expect(lubecCircleFace(request('Handle'), { ...idle, armed: 'Boatwork' })).toEqual({ kind: 'value', value: 65, armed: true })
    expect(lubecCircleFace(request('Handle'), { ...idle, armed: 'Scrapping' })).toEqual({ kind: 'value', value: 55, armed: false })
    const holed = lubecCharacterSheet({ class: { key: null, choices: {} } })
    expect(lubecCircleFace(request('Strength', [], holed), idle)).toEqual({ kind: 'missing' })
  })

  it('shows a spin on its own circle before a result, and a result over the value', () => {
    const spin = { name: 'Handle' as const, target: 55, preview: 7, step: 3 }
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
    expect(lubecCirclesStatus({ name: 'Handle', target: 65, preview: 4, step: 0 }, handleRoll, false)).toBe('Rolling Handle check...')
    expect(lubecCirclesStatus(null, handleRoll, false)).toBe('Handle + Boatwork: 32 vs 65 - success.')
    expect(lubecCirclesStatus(null, handleRoll, true)).toBe('Handle check cleared. Score unchanged.')
    expect(lubecCirclesStatus(null, { ...handleRoll, skill: null, result: 77, outcome: 'failure', stressAdded: 1 }, false))
      .toBe('Handle: 77 vs 65 - critical failure, +1 Stress.')
    expect(lubecCirclesStatus(null, null, false)).toBe('')
  })

  it('slows the spin as the prototype does', () => {
    expect([0, 1, 11].map(lubecSpinDelay)).toEqual([14, 19, 412])
  })
})
