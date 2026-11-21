// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import type { Firestore } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIRESTORE_HIDDEN_GRACE_MS, useFirestorePausedWhileHidden } from './useFirestorePausedWhileHidden'

vi.mock('firebase/firestore', () => ({ disableNetwork: vi.fn(), enableNetwork: vi.fn() }))

const firestore = {} as Firestore
let visibility: DocumentVisibilityState = 'visible'

function show(state: DocumentVisibilityState) {
  visibility = state
  act(() => { document.dispatchEvent(new Event('visibilitychange')) })
}

beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('pausing Firestore while the page is hidden', () => {
  const network = () => ({ disable: vi.fn(async () => undefined), enable: vi.fn(async () => undefined) })

  it('stops every listener once the page has been hidden for the grace period, and starts them when it is shown', () => {
    const calls = network()
    renderHook(() => useFirestorePausedWhileHidden(firestore, calls))
    show('hidden')
    act(() => { vi.advanceTimersByTime(FIRESTORE_HIDDEN_GRACE_MS - 1) })
    expect(calls.disable).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    expect(calls.disable).toHaveBeenCalledWith(firestore)
    show('visible')
    expect(calls.enable).toHaveBeenLastCalledWith(firestore)
  })

  it('keeps the connection through a quick look at another tab', () => {
    const calls = network()
    renderHook(() => useFirestorePausedWhileHidden(firestore, calls))
    show('hidden')
    act(() => { vi.advanceTimersByTime(FIRESTORE_HIDDEN_GRACE_MS / 2) })
    show('visible')
    act(() => { vi.advanceTimersByTime(FIRESTORE_HIDDEN_GRACE_MS * 2) })
    expect(calls.disable).not.toHaveBeenCalled()
  })
})
