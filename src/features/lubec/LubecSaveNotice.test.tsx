// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LubecSaveNotice } from './LubecSaveNotice'
import type { LubecSaveControls } from './LubecSaveNotice'
afterEach(() => cleanup())
const controls = (error?: string): NonNullable<LubecSaveControls> => ({ busy: false, retry: vi.fn(), discard: vi.fn(), entries: [{ error, intention: { operationId: 'edit', baseRevision: 0, edits: [{ kind: 'set', path: ['name'], base: { exists: true, value: 'Ada' }, value: 'Mine' }] } }] })
it('shows nothing for a spectator or a sheet whose changes are saved', () => {
  const view = render(<LubecSaveNotice />)
  expect(screen.queryByRole('alert')).toBeNull()
  view.rerender(<LubecSaveNotice controls={controls()} />)
  expect(screen.queryByRole('alert')).toBeNull()
})
it('keeps the sheet usable, shows retained edits, and offers explicit retry and discard controls', () => {
  const state = controls('Another device changed the same field. Your unsaved edit is retained for review.')
  render(<LubecSaveNotice controls={state} />)
  expect(screen.getByRole('alert').textContent).toContain('Another device changed the same field')
  expect(screen.getByText('name: Mine')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry save' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard unsaved edits' }))
  expect(state.retry).toHaveBeenCalledOnce(); expect(state.discard).toHaveBeenCalledOnce()
})
it('names refresh-required failures and disables destructive queue controls during a save', () => {
  const state = { ...controls('Your version of Table Keep is out of date. Refresh to keep editing.'), busy: true }
  render(<LubecSaveNotice controls={state} />)
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy()
  expect((screen.getByRole('button', { name: 'Retry save' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getByRole('button', { name: 'Discard unsaved edits' }) as HTMLButtonElement).disabled).toBe(true)
})
it('reloads the app when the user follows the refresh-required recovery', () => {
  render(<LubecSaveNotice controls={controls('Your version of Table Keep is out of date. Refresh to keep editing.')} />)
  const reload = vi.fn()
  const actualWindow = window
  // Location is nonconfigurable in jsdom; preserve the real browser globals around its navigation boundary.
  const browser = new Proxy(actualWindow, { get: (target, key) => key === 'location' ? { reload } : Reflect.get(target, key, target) })
  try {
    vi.stubGlobal('window', browser)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(reload).toHaveBeenCalledExactlyOnceWith()
  } finally {
    vi.unstubAllGlobals()
  }
})
it('describes retained counter, item, field-removal and structured edits without replacing the sheet', () => {
  const state = controls('Your unsaved edits are retained for review.')
  state.entries[0].intention.edits = [
    { kind: 'delta', path: ['stress'], base: 4, amount: 1 }, { kind: 'delta', path: ['trauma'], base: 2, amount: -1 },
    { kind: 'insert', path: ['items'], record: { id: 'a', name: 'Dodgeball' } }, { kind: 'insert', path: ['effects'], record: { id: 'b' } },
    { kind: 'remove', path: ['nickname'], base: { exists: true, value: 'Ada' } },
    { kind: 'remove', path: ['effects', { recordId: 'bruise' }], base: { exists: true, value: { id: 'bruise' } } },
    { kind: 'set', path: ['roll'], base: { exists: false }, value: { total: 10 } },
  ]
  render(<LubecSaveNotice controls={state} />)
  for (const text of ['stress: +1', 'trauma: -1', 'Add Dodgeball', 'Add item or effect', 'Remove nickname', 'Remove item or effect bruise', 'roll: edited value retained']) expect(screen.getByText(text)).toBeTruthy()
})
