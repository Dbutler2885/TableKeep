// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StageLossNotice } from './StageLossNotice'
import { DeclarationWords } from './DeclarationsPanel'
import { LOST_ACTION } from '../engine/stages'
import type { CombatState } from '../engine/types'
afterEach(cleanup)
it('shows the lost stage and why, beside a safe stopped declaration', () => {
  const state = { combatants: [], round: 3, lost: { hero: { movement: [4], action: [3], reason: 'Dazed', wound: 'Minor Concussion' } } } as unknown as CombatState
  render(<><StageLossNotice state={state} combatantKey="hero" /><DeclarationWords state={state} declaration={LOST_ACTION} /></>)
  expect(screen.getByText('Action + Defense lost - Dazed')).toBeTruthy()
  expect(screen.queryByText(/Effect card/)).toBeNull()
  expect(screen.getByText('Action + Defense lost')).toBeTruthy()
})
