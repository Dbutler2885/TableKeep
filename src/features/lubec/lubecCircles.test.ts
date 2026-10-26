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
  LUBEC_DONE_MS,
  LUBEC_MERGE_MS,
  lubecNextSpin,
  lubecShownAdvantage,
  lubecShownSheet,
  lubecSpinDelay,
  lubecSpinWait,
  lubecTallyFace,
  type LubecCircleName,
  type LubecSpin,
} from './lubecCircles'

const tommy = lubecCharacterSheet()

const request = (name: 'Strength' | 'Speed' | 'Handle' | 'Sanity', modifiers: LubecModifier[] = [], sheet = tommy) => ({ sheet, name, modifiers })

const handleRoll: LubecCheckRoll = {
  kind: 'stat-check', against: 'Handle', target: 65, dice: [32], result: 32,
  advantage: 'normal', skill: 'Boatwork', outcome: 'success', stressAdded: 0,
}

const idle = { armed: null, result: null, spin: null }

// A spin on one circle, with one die unless a ghost is given.
const spinning = (name: LubecCircleName, fields: Partial<LubecSpin> = {}): LubecSpin => ({
  name, target: 55, sides: 100, preview: 7, step: 0, advantage: 'normal', ghost: null, phase: 'spin', counters: tommy.counters, ...fields,
})

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
    const spin = spinning('Handle', { step: 3 })
    expect(lubecCircleFace(request('Handle'), { ...idle, spin, result: handleRoll }))
      .toEqual({ kind: 'rolling', preview: 7, target: 55, ghost: null, phase: 'spin' })
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

  it('notes gear\'s losses as a part of their own, and one part that adds up where the floor at 0 clips', () => {
    const gear = (amount: number): LubecModifier => ({ target: 'Speed', amount, source: 'gear' })
    const effect = (amount: number): LubecModifier => ({ target: 'Speed', amount })
    expect(lubecBaseNote(request('Speed', [gear(-20)]))).toBe('51 +5 class -20 gear')
    expect(lubecBaseNote(request('Speed', [effect(-10), gear(-20), gear(-10)]))).toBe('51 +5 class -10 effect -30 gear')
    expect(lubecNoteParts(request('Speed', [effect(10), gear(-10)]))).toEqual(['+5 class', '+10 effect', '-10 gear'])
    expect(lubecBaseNote(request('Speed', [gear(-60)]))).toBe('51 +5 class -56 gear, immobile')
    expect(lubecBaseNote(request('Speed', [effect(-40), gear(-20)]))).toBe('51 +5 class -56 effect and gear, immobile')
    expect(lubecBaseNote(request('Handle', [{ target: 'Handle', amount: -200 }, gear(-20)]))).toBe('50 +5 class -55 effect')
  })

  it('says immobile under Speed at 0, and only under Speed', () => {
    const still = lubecCharacterSheet({ class: { key: 'tough', choices: {} }, base: { ...tommy.base, Speed: 0, Handle: 0 } })
    expect(lubecBaseNote(request('Speed', [], still))).toBe('0, immobile')
    expect(lubecBaseNote(request('Speed', [{ target: 'Speed', amount: -56 }]))).toBe('51 +5 class -56 effect, immobile')
    expect(lubecBaseNote(request('Speed', [{ target: 'Speed', amount: -55 }]))).toBe('51 +5 class -55 effect')
    expect(lubecBaseNote(request('Handle', [], still))).toBe('')
  })

  it('shows no note when the circle already shows the base', () => {
    const tough = lubecCharacterSheet({ class: { key: 'tough', choices: {} } })
    expect(lubecCircleFace(request('Handle', [], tough), idle)).toEqual({ kind: 'value', value: 50, armed: false })
    expect(lubecBaseNote(request('Handle', [], tough))).toBe('')
    expect(lubecBaseNote(request('Strength', [], tough))).toBe('24 +10 class')
  })

  it('says what the circles are doing in the status line', () => {
    expect(lubecCirclesStatus(spinning('Handle'), null, handleRoll)).toBe('Rolling Handle check...')
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
    const spin = spinning('Panic', { target: 5, sides: 20, preview: 17 })
    expect(lubecTallyFace('Panic', 5, idle)).toEqual({ kind: 'value', value: 5, armed: false })
    expect(lubecTallyFace('Recovery', null, idle)).toEqual({ kind: 'missing' })
    expect(lubecTallyFace('Panic', 5, { ...idle, spin })).toEqual({ kind: 'rolling', preview: 17, target: 5, ghost: null, phase: 'spin' })
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
    expect(lubecCirclesStatus(spinning('Panic'), null, null)).toBe('Rolling Panic Check...')
    expect(lubecCirclesStatus(spinning('Recovery'), null, null)).toBe('Rolling Recovery Save...')
    expect(lubecCirclesStatus(null, panicRoll, panicRoll)).toBe('Panic Check cleared. Score unchanged.')
    expect(lubecCirclesStatus(null, recoveryRoll, recoveryRoll)).toBe('Recovery Save cleared. Score unchanged.')
  })

  it('shows the counters as they stood before a spinning roll, and the sheet itself once nothing spins', () => {
    const rolled = { ...tommy, counters: { stress: 3, minimumStress: 2, trauma: 1 } }
    const spin = spinning('Strength', { target: 29, preview: 40, step: 5 })
    expect(lubecShownSheet(rolled, spin)).toEqual({ ...rolled, counters: tommy.counters })
    expect(lubecShownSheet(rolled, null)).toBe(rolled)
  })

  it('slows the spin as the prototype does', () => {
    expect([0, 1, 11].map(lubecSpinDelay)).toEqual([14, 19, 412])
  })

  it('spins one die and lands after its last step, with no ghost under Normal', () => {
    const previews = [61, 62]
    const next = lubecNextSpin(spinning('Handle', { step: 3 }), () => previews.shift() ?? 0)
    expect(next).toEqual(spinning('Handle', { step: 4, preview: 61 }))
    expect(lubecNextSpin(spinning('Handle', { step: 11 }), () => 0)).toBeNull()
  })

  it('spins a ghost beside the die under Advantage or Disadvantage, then shows "done", merges it, and lands', () => {
    const previews = [61, 62]
    const ghosted = spinning('Handle', { step: 3, ghost: 9 })
    expect(lubecNextSpin(ghosted, () => previews.shift() ?? 0)).toEqual({ ...ghosted, step: 4, preview: 61, ghost: 62 })
    const settled = { ...ghosted, step: 11 }
    expect(lubecNextSpin(settled, () => 0)).toEqual({ ...settled, phase: 'done' })
    expect(lubecNextSpin({ ...settled, phase: 'done' }, () => 0)).toEqual({ ...settled, phase: 'merge' })
    expect(lubecNextSpin({ ...settled, phase: 'merge' }, () => 0)).toBeNull()
  })

  it('waits the prototype\'s slowing delay while spinning, then for "done" and the merge', () => {
    expect(lubecSpinWait(spinning('Handle', { step: 11, ghost: 9 }))).toBe(412)
    expect(lubecSpinWait(spinning('Handle', { ghost: 9, phase: 'done' }))).toBe(LUBEC_DONE_MS)
    expect(lubecSpinWait(spinning('Handle', { ghost: 9, phase: 'merge' }))).toBe(LUBEC_MERGE_MS)
  })

  it('shows both dice once settled, the kept die as the ghost merges, and says "done"', () => {
    const roll = { ...handleRoll, dice: [32, 71], result: 32, advantage: 'advantage' as const }
    const settled = spinning('Handle', { target: 65, ghost: 9, phase: 'done' })
    expect(lubecCircleFace(request('Handle'), { ...idle, spin: settled, result: roll }))
      .toEqual({ kind: 'rolling', preview: 32, target: 65, ghost: 71, phase: 'done' })
    const merging = { ...settled, phase: 'merge' as const }
    expect(lubecCircleFace(request('Handle'), { ...idle, spin: merging, result: { ...roll, dice: [71, 32] } }))
      .toEqual({ kind: 'rolling', preview: 32, target: 65, ghost: 32, phase: 'merge' })
    expect(lubecCircleFace(request('Handle'), { ...idle, spin: settled }))
      .toEqual({ kind: 'rolling', preview: 7, target: 65, ghost: 9, phase: 'done' })
    expect(lubecCirclesStatus(settled, null, roll)).toBe('Rolling Handle check... done')
  })

  it('shows the mode a roll spins with until it lands, then the mode set for the next roll', () => {
    const ghosted = spinning('Handle', { advantage: 'disadvantage', ghost: 9, phase: 'merge' })
    expect(lubecShownAdvantage(ghosted, 'normal')).toBe('disadvantage')
    expect(lubecShownAdvantage(spinning('Handle'), 'advantage')).toBe('normal')
    expect(lubecShownAdvantage(null, 'normal')).toBe('normal')
    expect(lubecShownAdvantage(null, 'advantage')).toBe('advantage')
  })
})
