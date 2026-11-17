// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LubecDeathReminders } from './LubecDeathReminders'

afterEach(cleanup)

describe('the GM\'s Death Save prompt', () => {
  it('lists each reminder with its reasons and the Death table, and marking one handled calls only its own handler', async () => {
    const first = vi.fn(async () => undefined)
    const second = vi.fn(async () => undefined)
    render(<LubecDeathReminders entries={[
      { key: 'a', who: 'Mirelda', reminder: { id: 'a', reasons: ['Immediate Death Save: Shot through the heart', 'Trauma reached 4, the Death Save threshold of 4'], event: 'Shot landed in round 2' }, onHandled: first },
      { key: 'b', who: 'Roy', reminder: { id: 'b', reasons: ['A Critical countdown ran out: Death Save due'], event: 'Gut shot at the end of round 3' }, onHandled: second },
    ]} />)
    const prompt = screen.getByRole('dialog', { name: 'Death Save due' })
    expect(prompt.getAttribute('aria-modal')).toBe('false')
    expect(prompt.textContent).toContain('Immediate Death Save: Shot through the heart')
    expect(prompt.textContent).toContain('You are unconscious. You wake up in 2d10 minutes. Add 1d5 to your Minimum Stress.')
    expect(screen.getAllByRole('row').map((row) => row.firstChild!.textContent)).toEqual(['0', '1-2', '3-4', '5-9'])
    fireEvent.click(screen.getAllByRole('button', { name: 'Mark handled' })[0])
    await waitFor(() => expect(first).toHaveBeenCalledOnce())
    expect(second).not.toHaveBeenCalled()
  })

  it('shows nothing when no reminder waits', () => {
    render(<LubecDeathReminders entries={[]} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
