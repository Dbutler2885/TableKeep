// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StageLossNotice } from './StageLossNotice'
import { DeclarationWords } from './DeclarationsPanel'
import { LOST_ACTION } from '../engine/stages'
import type { CombatState } from '../engine/types'
afterEach(cleanup)
it('shows the lost stage and its inspectable wound reason beside a safe stopped declaration', () => {
  const state = { round: 3, lost: { hero: { movement: [4], action: [3], reason: 'Dazed', wound: 'Minor Concussion' } } } as unknown as CombatState
  render(<><StageLossNotice state={state} combatantKey="hero" /><DeclarationWords state={state} declaration={LOST_ACTION} /></>)
  expect(screen.getByText('Action + Defense lost - Dazed')).toBeTruthy()
  expect(screen.getByText(/Effect card: Minor Concussion/)).toBeTruthy()
  expect(screen.getByText('Action + Defense lost: no actions this round.')).toBeTruthy()
})
