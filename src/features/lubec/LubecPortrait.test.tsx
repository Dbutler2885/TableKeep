// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { LubecPortrait } from './LubecPortrait'
afterEach(cleanup)
it.each(['comatose', 'dead'] as const)('shows %s on portraits even without art', (condition) => {
  render(<LubecPortrait character={{ name: 'Tommy', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, lubec: { condition } }} />)
  expect(screen.getByRole('img', { name: condition === 'dead' ? 'Dead' : 'Comatose' })).toBeTruthy()
  if (condition === 'comatose') expect(screen.getByText('Zzz')).toBeTruthy()
})
