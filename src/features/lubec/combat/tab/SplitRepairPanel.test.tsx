// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { CombatState } from '../engine/types'
import type { StepControls } from './ResultSteps'
import { SplitRepairPanel } from './SplitRepairPanel'

afterEach(cleanup)

const state = {
  round: 1, phase: 'attack', stageInstanceId: 's', floor: [], attack: null, woundOutbox: [], woundAcknowledgements: [], order: ['npc:roy', 'character:hero'],
  combatants: [{ key: 'npc:roy', name: 'Roy' }, { key: 'character:hero', name: 'Wayne' }],
} as unknown as CombatState
const repair = { combatantKey: 'npc:roy', pool: 35, was: 65, against: 'character:hero', attackSpent: false }
const controls = (owns: boolean, repairSplit = vi.fn(async () => null)): StepControls =>
  ({ owns: () => owns, isGm: owns, commands: { repairSplit } as never, onActFor: vi.fn(), roster: {} as never, fightId: 'f' })

describe('the split repair', () => {
  it('tells everyone the pool changed, and waits for the owner', () => {
    render(<div className="shell-root" data-theme="lubec"><SplitRepairPanel state={state} repair={repair} controls={controls(false)} /></div>)
    expect(screen.getByRole('alert').textContent).toContain("Roy's Handle pool fell from 65 to 35.")
    expect(screen.getByText(/Waiting for Roy's new Defense/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm split' })).toBeNull()
  })

  it('lets the owner choose Defense in tens below the pool, shows the attack remainder, and confirms', () => {
    const repairSplit = vi.fn(async () => null)
    render(<div className="shell-root" data-theme="lubec"><SplitRepairPanel state={state} repair={repair} controls={controls(true, repairSplit)} /></div>)
    const select = screen.getByLabelText('Defense against Wayne') as HTMLSelectElement
    expect([...select.options].map((option) => option.value)).toEqual(['0', '10', '20', '30'])
    fireEvent.change(select, { target: { value: '10' } })
    expect(screen.getByText('Attack 25 + Defense 10 = 35')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm split' }))
    expect(repairSplit).toHaveBeenCalledWith('npc:roy', 10)
  })
})
