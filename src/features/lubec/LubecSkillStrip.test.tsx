// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LubecEffect } from '../ruleSets/lubec/effects'
import { lubecCharacterSheet } from '../ruleSets/lubec/sheetFixtures'
import { LubecSkillStrip } from './LubecSkillStrip'
import type { LubecRoller } from './useLubecRoller'

afterEach(cleanup)

// The Core roller asks what kind of action the next roll is only while a card reads one
// ("Punches at Disadvantage"); otherwise every roll is "any other" and nothing is asked.

const punches: LubecEffect = { id: 'hand', name: 'Broken hand', cause: 'Fisticuffs', steps: [{ modifiers: [], labels: [], rolls: [{ scope: { task: 'punch' }, mode: 'disadvantage' }] } as never] }
const roller = (action: LubecRoller['action'] = null) => ({
  advantage: null, toggleAdvantage: vi.fn(), modeFor: () => ({ mode: 'normal', because: null }),
  action, setAction: vi.fn(), armed: null, toggleArmed: vi.fn(),
}) as unknown as LubecRoller
const strip = (effects: LubecEffect[], current = roller()) => {
  render(<LubecSkillStrip sheet={lubecCharacterSheet({ effects })} roller={current} spin={null} />)
  return current
}
const picker = () => screen.getByRole('combobox', { name: 'Action' }) as HTMLSelectElement

describe('the next roll\'s action', () => {
  it('is not asked while no card reads one', () => {
    strip([])
    expect(screen.queryByRole('combobox', { name: 'Action' })).toBeNull()
  })

  it('is asked while a card reads one, starting from any other action', () => {
    strip([punches])
    expect(picker().value).toBe('')
    expect([...picker().options].map((option) => option.textContent)[0]).toBe('Any other')
  })

  it('sets the action the player picks, and clears it when they pick any other', () => {
    const current = strip([punches], roller('punch'))
    expect(picker().value).toBe('punch')
    fireEvent.change(picker(), { target: { value: 'throw' } })
    expect(current.setAction).toHaveBeenLastCalledWith('throw')
    fireEvent.change(picker(), { target: { value: '' } })
    expect(current.setAction).toHaveBeenLastCalledWith(null)
  })
})
