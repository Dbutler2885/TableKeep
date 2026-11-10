import { describe, expect, it } from 'vitest'
import type { CombatAttack, CombatState } from '../engine/types'
import { continueWords, resultsWound, woundParts } from './resultsModel'

describe('the wound\'s words', () => {
  it('labels the parts the wound standard names, and calls bare words what it does', () => {
    expect(woundParts('Now: Dazed. Lasting: -40 Handle. After 1 Long Rest: -10 Handle. After 2 Long Rests: healed.')).toEqual([
      { label: 'Now', text: 'Dazed.' }, { label: 'Lasting', text: '-40 Handle.' },
      { label: 'After 1 Long Rest', text: '-10 Handle.' }, { label: 'After 2 Long Rests', text: 'healed.' },
    ])
    expect(woundParts('Now: Knocked down. Lasting (Broken pelvis): Crawl only without help.')).toEqual([
      { label: 'Now', text: 'Knocked down.' }, { label: 'Lasting (Broken pelvis)', text: 'Crawl only without help.' },
    ])
    expect(woundParts('Bleeding timer.')).toEqual([{ label: 'What it does', text: 'Bleeding timer.' }])
  })
})

const combatant = (key: string, name: string, outReason: string | null = null) => ({ key, name, outReason, declaration: { aim: {}, stopped: false } })

describe('the Results wound panel', () => {
  const state = { round: 1, combatants: [combatant('a', 'Wayne'), combatant('b', 'Roy')], order: ['a', 'b'], attacked: ['a'] } as unknown as CombatState
  const attack = {
    aim: { targetKey: 'b' }, rowOutcome: 'Minor Concussion. Only Dazed, and 0 Trauma instead of +1.', rowTrauma: 0,
    row: { name: 'Skull hit', severity: 'Severe', trauma: 2, injury: null, choice: 2, table: 'gunshot' },
    check: { kind: 'save', against: 'Body', result: 7, target: 40, success: true },
  } as unknown as CombatAttack

  it('shows the Trauma the wound gave, the rolls that picked it, and where it goes', () => {
    expect(resultsWound(state, attack)).toMatchObject({
      severity: 'Severe', cls: 'sv', trauma: 'Trauma 0', name: 'Skull hit', out: false,
      notes: ['Body Save 07 against 40: passed', 'd2 rolled 2'], sheet: "Goes on Roy's sheet next round.",
    })
  })

  it('has nothing to show before the row lands', () => {
    expect(resultsWound(state, { ...attack, rowOutcome: null })).toBeNull()
  })

  it('names what Continue opens: the next attacker, or the next round', () => {
    expect(continueWords(state)).toBe("Continue: Roy's turn")
    expect(continueWords({ ...state, attacked: ['a', 'b'] })).toBe('Continue: Round 2')
  })
})
