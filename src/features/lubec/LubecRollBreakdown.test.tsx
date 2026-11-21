// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { LubecCheckRoll } from '../ruleSets/lubec/checkRoll'
import type { LubecEffect } from '../ruleSets/lubec/effects'
import type { LubecPanicRoll } from '../ruleSets/lubec/panicRoll'
import { lubecCharacterSheet } from '../ruleSets/lubec/sheetFixtures'
import { LubecRollBreakdown } from './LubecRollBreakdown'
import { lubecRollDice } from './lubecRollDice'
import { LubecShownRoll } from './LubecShownRoll'

afterEach(cleanup)

// What happened at a roll: both dice under a mode with the kept one marked and
// the other set aside, the mode and its reason, then each change to the number
// the roll was made under, and that number.

const dice = () => within(screen.getByRole('list', { name: /dice$/ })).getAllByRole('listitem').map((die) => [die.className, die.textContent])

describe('the dice of a roll under a mode', () => {
  it('keeps the worse at Disadvantage, sets the other aside, and says which card set it', () => {
    render(<LubecRollBreakdown dice={{ values: [23, 71], kept: 71, mode: 'disadvantage', because: 'Disadvantage from Broken rib(s) (Ribs)' }} parts={null} name="Speed" target={56} />)
    expect(screen.getByText('Disadvantage').closest('p')!.textContent).toBe('Disadvantage from Broken rib(s) (Ribs): keep the worse')
    expect(screen.getByRole('list', { name: 'Disadvantage dice' })).toBeTruthy()
    expect(dice()).toEqual([['set-aside', '23set aside'], ['kept', '71kept']])
  })

  it('keeps the better at Advantage, set by hand with no card named', () => {
    render(<LubecRollBreakdown dice={{ values: [8, 64], kept: 8, mode: 'advantage', because: null }} parts={null} name="Speed" target={56} />)
    expect(screen.getByText('Advantage').closest('p')!.textContent).toBe('Advantage: keep the better')
    expect(dice()).toEqual([['kept', '08kept'], ['set-aside', '64set aside']])
  })

  it('marks the first of two equal dice as the kept one', () => {
    render(<LubecRollBreakdown dice={{ values: [40, 40], kept: 40, mode: 'advantage', because: 'Advantage from Pep talk' }} parts={null} name="Speed" target={56} />)
    expect(dice().map(([kept]) => kept)).toEqual(['kept', 'set-aside'])
    expect(screen.getByText('Advantage').closest('p')!.textContent).toBe('Advantage from Pep talk: keep the better')
  })

  it('takes two dice under a mode from a roll record, and nothing from one die', () => {
    expect(lubecRollDice({ dice: [5, 9], result: 9, mode: 'disadvantage' })).toEqual({ values: [5, 9], kept: 9, mode: 'disadvantage', because: null })
    expect(lubecRollDice({ dice: [5], result: 5, mode: 'normal' })).toBeNull()
    expect(lubecRollDice({ result: 5 })).toBeNull()
  })
})

describe('the number a roll was made under', () => {
  it('lists each change by its source, then the number they reach', () => {
    render(<LubecRollBreakdown dice={null} parts={[{ label: 'Base', value: '50' }, { label: 'Forearm injury', value: '-20' }]} name="Handle" target={30} />)
    const parts = within(screen.getByRole('list', { name: 'How Handle 30 is reached' })).getAllByRole('listitem').map((part) => part.textContent)
    expect(parts).toEqual(['Base50', 'Forearm injury-20', 'Handle30'])
  })

  it('shows nothing for a roll with one die and no parts', () => {
    const { container } = render(<LubecRollBreakdown dice={null} parts={null} name="" target={0} />)
    expect(container.innerHTML).toBe('')
  })
})

describe('the roll under the sheet\'s circles', () => {
  const broken: LubecEffect = { id: 'rib', name: 'Broken rib(s)', cause: 'test', steps: [{ modifiers: [{ target: 'Speed', amount: -10 }], labels: [] }] }

  it('explains a Stat Check: its dice under the card\'s mode and how its target was reached', () => {
    const roll = { kind: 'stat-check', against: 'Speed', target: 46, dice: [23, 71], result: 71, advantage: 'disadvantage', skill: null, outcome: 'failure', stressAdded: 1, because: 'Disadvantage from Broken rib(s)' } as LubecCheckRoll
    render(<LubecShownRoll sheet={lubecCharacterSheet({ effects: [broken] })} roll={roll} />)
    expect(dice()).toEqual([['set-aside', '23set aside'], ['kept', '71kept']])
    expect(screen.getByRole('list', { name: 'How Speed 46 is reached' }).textContent).toBe('Base51Working Kid+5Broken rib(s)-10Speed46')
  })

  it('shows a Panic Check\'s two dice without parts, and nothing at all when no roll is shown', () => {
    const panic = { kind: 'panic', target: 5, dice: [3, 9], result: 9, advantage: 'advantage', outcome: 'failure', stressAdded: 0 } as unknown as LubecPanicRoll
    const { rerender } = render(<LubecShownRoll sheet={lubecCharacterSheet()} roll={panic} />)
    expect(dice()).toEqual([['set-aside', '03set aside'], ['kept', '09kept']])
    expect(screen.queryByRole('list', { name: /is reached$/ })).toBeNull()
    rerender(<LubecShownRoll sheet={lubecCharacterSheet()} roll={null} />)
    expect(screen.queryByRole('list')).toBeNull()
  })
})
