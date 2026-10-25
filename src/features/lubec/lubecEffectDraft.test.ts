import { describe, expect, it } from 'vitest'
import type { LubecEffect } from '../ruleSets/lubec/effects'
import { canSaveLubecEffectDraft, lubecEffectDraft, lubecEffectFromDraft, removedAt, replacedAt } from './lubecEffectDraft'

const concussion: LubecEffect = {
  id: 'concussion',
  name: 'Severe Concussion',
  cause: 'Severe Concussion (failed Body Save)',
  source: 'damage table',
  steps: [
    { modifiers: [{ target: 'Handle', amount: -40 }], labels: ['Dazed', 'Disadvantage on exertion checks'], note: 'kept' },
    { modifiers: [{ target: 'Handle', amount: -10 }], labels: [] },
  ],
}

describe('Lubec effect drafts', () => {
  it('start a new effect with one empty step, which cannot be saved without a name', () => {
    const draft = lubecEffectDraft(null)
    expect(draft).toEqual({ name: '', cause: '', steps: [{ stored: {}, modifiers: [], labels: '' }] })
    expect(canSaveLubecEffectDraft(draft)).toBe(false)
    expect(canSaveLubecEffectDraft({ ...draft, name: '  ' })).toBe(false)
    expect(canSaveLubecEffectDraft({ ...draft, name: 'Dazed' })).toBe(true)
  })

  it('open an effect as typed text, and save it back unchanged, stored fields and all', () => {
    const draft = lubecEffectDraft(concussion)
    expect(draft.steps[0]).toEqual({
      stored: { note: 'kept' },
      modifiers: [{ target: 'Handle', amount: '-40' }],
      labels: 'Dazed\nDisadvantage on exertion checks',
    })
    expect(lubecEffectFromDraft(draft, concussion.id, concussion)).toEqual(concussion)
  })

  it('save trimmed text, keep only whole amounts and written labels, and drop a step left empty', () => {
    const effect = lubecEffectFromDraft({
      name: ' Bruised ribs ',
      cause: ' Fell off the pier ',
      steps: [
        { stored: {}, modifiers: [{ target: 'Body', amount: '' }, { target: 'Strength', amount: '-' }], labels: '\n  \n' },
        {
          stored: {},
          modifiers: [{ target: 'Strength', amount: ' -5 ' }, { target: 'Speed', amount: '2.5' }, { target: 'Charm', amount: '0' }],
          labels: ' Sore \n\nWinded',
        },
      ],
    }, 'bruise')
    expect(effect).toEqual({
      id: 'bruise',
      name: 'Bruised ribs',
      cause: 'Fell off the pier',
      steps: [{ modifiers: [{ target: 'Strength', amount: -5 }, { target: 'Charm', amount: 0 }], labels: ['Sore', 'Winded'] }],
    })
  })
})

describe('list helpers', () => {
  it('replace or remove the item at a place', () => {
    expect(replacedAt(['a', 'b', 'c'], 1, 'x')).toEqual(['a', 'x', 'c'])
    expect(removedAt(['a', 'b', 'c'], 0)).toEqual(['b', 'c'])
  })
})
