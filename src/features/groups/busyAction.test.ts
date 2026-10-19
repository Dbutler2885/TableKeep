import { describe, expect, it, vi } from 'vitest'
import { errorMessage, runBusyAction } from './busyAction'

function recorder() {
  const log: unknown[][] = []
  return {
    log,
    setters: {
      setBusy: (busy: boolean) => log.push(['busy', busy]),
      setError: (error: string | null) => log.push(['error', error]),
    },
  }
}

describe('errorMessage', () => {
  it('uses an Error\'s own message', () => {
    expect(errorMessage(new Error('No permission.'), 'Fallback.')).toBe('No permission.')
  })

  it('falls back for anything thrown that is not an Error', () => {
    expect(errorMessage('nope', 'Fallback.')).toBe('Fallback.')
    expect(errorMessage(undefined, 'Fallback.')).toBe('Fallback.')
  })
})

describe('runBusyAction', () => {
  it('runs busy without an error, then clears busy before its success step', async () => {
    const { log, setters } = recorder()
    const action = vi.fn(async () => {
      log.push(['action'])
    })

    await runBusyAction(setters, action, { fallback: 'Fallback.', onSuccess: () => log.push(['success']) })

    expect(log).toEqual([['busy', true], ['error', null], ['action'], ['busy', false], ['success']])
  })

  it('clears busy without a success step', async () => {
    const { log, setters } = recorder()

    await runBusyAction(setters, async () => undefined, { fallback: 'Fallback.' })

    expect(log).toEqual([['busy', true], ['error', null], ['busy', false]])
  })

  it('stays busy after success when the action leaves the screen', async () => {
    const { log, setters } = recorder()
    const onSuccess = vi.fn()

    await runBusyAction(setters, async () => undefined, { fallback: 'Fallback.', onSuccess, staysBusy: true })

    expect(log).toEqual([['busy', true], ['error', null]])
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows the error and clears busy on failure, skipping the success step', async () => {
    const { log, setters } = recorder()
    const onSuccess = vi.fn()

    await runBusyAction(setters, async () => Promise.reject(new Error('Locked.')), { fallback: 'Fallback.', onSuccess })
    await runBusyAction(setters, async () => Promise.reject(7), { fallback: 'Fallback.', staysBusy: true })

    expect(log).toEqual([
      ['busy', true], ['error', null], ['error', 'Locked.'], ['busy', false],
      ['busy', true], ['error', null], ['error', 'Fallback.'], ['busy', false],
    ])
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('catches an action that throws before returning a promise', async () => {
    const { log, setters } = recorder()

    await runBusyAction(setters, () => {
      throw new Error('Sync.')
    }, { fallback: 'Fallback.' })

    expect(log).toEqual([['busy', true], ['error', null], ['error', 'Sync.'], ['busy', false]])
  })
})
