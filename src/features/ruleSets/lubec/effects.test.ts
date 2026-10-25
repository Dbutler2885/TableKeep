import { describe, expect, it } from 'vitest'
import {
  describeLubecEffectStep,
  lubecActiveModifiers,
  parseLubecEffects,
  putLubecEffect,
  removeLubecEffect,
  stepDownLubecEffect,
  type LubecEffect,
} from './effects'

const concussion: LubecEffect = {
  id: 'concussion',
  name: 'Severe Concussion',
  cause: 'Severe Concussion (failed Body Save)',
  steps: [
    { modifiers: [{ target: 'Handle', amount: -40 }], labels: ['Dazed'] },
    { modifiers: [{ target: 'Handle', amount: -10 }], labels: [] },
  ],
}

const bruise: LubecEffect = {
  id: 'bruise',
  name: 'Bruised ribs',
  cause: 'Fell off the pier',
  steps: [{ modifiers: [{ target: 'Strength', amount: -5 }, { target: 'Handle', amount: -10 }], labels: [] }],
}

describe('Lubec effects as read from storage', () => {
  it('reads a stored effect, keeping the fields the sheet does not model', () => {
    const stored = [{ ...concussion, colour: 'red', steps: [{ ...concussion.steps[0], note: 'until a Long Rest' }] }]
    expect(parseLubecEffects(stored)).toEqual(stored)
  })

  it('reads a missing or unreadable list as no effects, and skips rows that are not effects', () => {
    expect(parseLubecEffects(undefined)).toEqual([])
    expect(parseLubecEffects('none')).toEqual([])
    expect(parseLubecEffects([null, 'Dazed', [1]])).toEqual([])
  })

  it('reads missing parts as empty, and names an effect with no id by its place', () => {
    expect(parseLubecEffects([{}, { id: 7, steps: 'one' }])).toEqual([
      { id: 'effect-1', name: '', cause: '', steps: [] },
      { id: 'effect-2', name: '', cause: '', steps: [] },
    ])
  })

  it('reads only modifiers that name a Stat or Save and change it by a whole number', () => {
    const [effect] = parseLubecEffects([{
      id: 'odd',
      steps: [null, {
        modifiers: [
          { target: 'Handle', amount: -40, by: 'hand' },
          { target: 'Luck', amount: -10 },
          { target: 'Body', amount: '-10' },
          { target: 'Fear', amount: 2.5 },
          'Speed -5',
        ],
        labels: ['Dazed', 3],
      }],
    }])
    expect(effect.steps).toEqual([
      { modifiers: [], labels: [] },
      { modifiers: [{ target: 'Handle', amount: -40 }], labels: ['Dazed'] },
    ])
  })
})

describe('Lubec effect steps', () => {
  it('count only each effect\'s current step', () => {
    expect(lubecActiveModifiers([concussion, bruise])).toEqual([
      { target: 'Handle', amount: -40 },
      { target: 'Strength', amount: -5 },
      { target: 'Handle', amount: -10 },
    ])
    expect(lubecActiveModifiers([{ ...bruise, steps: [] }])).toEqual([])
  })

  it('step down to the next stored step, and the last step down removes the effect', () => {
    const once = stepDownLubecEffect([concussion, bruise], 'concussion')
    expect(once).toEqual([{ ...concussion, steps: [concussion.steps[1]] }, bruise])
    expect(stepDownLubecEffect(once, 'concussion')).toEqual([bruise])
    expect(stepDownLubecEffect([{ ...bruise, steps: [] }], 'bruise')).toEqual([])
  })

  it('reads a step as its modifiers, signed, then its labels', () => {
    expect(describeLubecEffectStep(concussion.steps[0])).toBe('Handle -40, Dazed')
    expect(describeLubecEffectStep({ modifiers: [{ target: 'Charm', amount: 5 }, { target: 'Fear', amount: 0 }], labels: ['Grounded'] }))
      .toBe('Charm +5, Fear +0, Grounded')
    expect(describeLubecEffectStep({ modifiers: [], labels: [] })).toBe('')
  })
})

describe('Lubec effects list changes', () => {
  it('replace an effect in place by id, or add a new one at the end', () => {
    const renamed = { ...concussion, name: 'Concussion' }
    expect(putLubecEffect([concussion, bruise], renamed)).toEqual([renamed, bruise])
    expect(putLubecEffect([concussion], bruise)).toEqual([concussion, bruise])
  })

  it('remove an effect by id', () => {
    expect(removeLubecEffect([concussion, bruise], 'concussion')).toEqual([bruise])
  })
})
