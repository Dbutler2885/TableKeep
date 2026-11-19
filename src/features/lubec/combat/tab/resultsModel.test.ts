import { describe, expect, it } from 'vitest'
import type { CombatAttack, CombatState } from '../engine/types'
import { continueWords, headWords, resultsWound, woundParts } from './resultsModel'

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

  it('shows the rolls that picked the wound, and no charge it did not make', () => {
    const wound = resultsWound(state, attack)!
    expect(wound).toMatchObject({
      severity: 'Severe', cls: 'sv', trauma: '', name: 'Skull hit', out: false,
      notes: ['Body Save 07 against 40: passed', 'd2 rolled 2', 'Resolved by hand'],
    })
    expect(wound).not.toHaveProperty('sheet')
  })

  it('plays a final row as cards, without the resolved-by-hand note, and shows its words without the table\'s marks', () => {
    const final = { ...attack, check: null, rowOutcome: '`-20 Handle` until 1 Long Rest.', row: { name: 'Forearm injury', severity: 'Serious', trauma: 1, injury: null, choice: null, table: 'blunt', final: true } } as unknown as CombatAttack
    expect(resultsWound(state, final)).toMatchObject({ notes: [], parts: [{ label: 'The table says', text: '-20 Handle until 1 Long Rest.' }] })
  })

  it('lists a final wound\'s landing rolls with their purpose, both dice and Stress, its sections, and every counter it charged', () => {
    const final = {
      ...attack, rowOutcome: 'Body Save.', rowTrauma: 2, rowStress: 1, rowMinimumStress: 3, check: null,
      row: { name: 'Severe Concussion', severity: 'Severe', trauma: 2, injury: null, choice: null, table: 'fisticuffs', final: true },
      checks: [{ purpose: 'concussion', kind: 'save', against: 'Body', advantage: 'disadvantage', dice: [12, 88], result: 88, target: 31, success: false, stress: 1 }],
      rowSections: [{ label: 'Now', items: ['Dazed'] }],
    } as unknown as CombatAttack
    expect(resultsWound(state, final)).toMatchObject({
      trauma: 'Trauma +2, Stress +1, Minimum Stress +3',
      notes: ['Concussion: Body Save 88 (12 and 88) against 31: failed, +1 Stress'],
      sections: [{ label: 'Now', items: ['Dazed'] }],
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

describe('the Results headline', () => {
  const banner = { tone: 'hit', title: 'Roy: Serious wound', text: 'Long chest cut: Bleeding timer. The dodgeball lands on the Floor.', aside: 'The dodgeball lands on the Floor.' }

  it('keeps under a wound only what the wound panel does not say, and the whole line otherwise', () => {
    expect(headWords(banner, true)).toEqual({ title: 'Roy: Serious wound', line: 'The dodgeball lands on the Floor.' })
    expect(headWords({ ...banner, aside: '' }, true)).toEqual({ title: 'Roy: Serious wound', line: null })
    expect(headWords({ tone: 'safe', title: 'Dodged', text: 'Roy stops it.' }, true)).toEqual({ title: 'Dodged', line: 'Roy stops it.' })
    expect(headWords(banner, false).line).toBe(banner.text)
    expect(headWords(null, false)).toEqual({ title: 'Done', line: null })
  })
})

