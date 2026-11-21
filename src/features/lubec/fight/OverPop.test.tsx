// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OverPop } from './OverPop'

afterEach(cleanup)

function openPop() {
  render(<><button type="button">Elsewhere</button><OverPop className="wear-more" summary="+2 more" label="Everything Roy wears"><p>Leather jacket</p></OverPop></>)
  const details = document.querySelector('details')!
  const summary = screen.getByLabelText('Everything Roy wears')
  act(() => { details.open = true; details.dispatchEvent(new Event('toggle')) })
  return { details, summary }
}

describe('the over-the-page list', () => {
  it('opens over the page and closes on a press outside it, but not on one inside', () => {
    const { details } = openPop()
    fireEvent.pointerDown(screen.getByText('Leather jacket'))
    expect(details.open).toBe(true)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(details.open).toBe(false)
  })

  it('closes on Escape and hands focus back to the count', () => {
    const { details, summary } = openPop()
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(details.open).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(details.open).toBe(false)
    expect(document.activeElement).toBe(summary)
  })

  it('listens for nothing while it is closed', () => {
    const { details } = openPop()
    act(() => { details.open = false; details.dispatchEvent(new Event('toggle')) })
    act(() => { details.open = true })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(details.open).toBe(true)
  })
})
