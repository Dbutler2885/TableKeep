// @vitest-environment jsdom
// The stored-expiry half of this module reads `sessionStorage`, which the
// default node environment does not provide.
import { afterEach, describe, expect, it } from 'vitest'
import {
  demoSandboxErrorMessage,
  forgetDemoExpiry,
  formatTimeRemaining,
  readDemoExpiry,
  rememberDemoExpiry,
} from './demoSandboxState'

afterEach(() => {
  forgetDemoExpiry()
})

describe('demoSandboxErrorMessage', () => {
  it('explains the capacity ceiling as a wait, not a failure', () => {
    const message = demoSandboxErrorMessage({ code: 'functions/resource-exhausted' })

    expect(message).toContain('in use')
    expect(message).toMatch(/again/i)
  })

  it('tells a visitor the missing template is not their fault', () => {
    expect(demoSandboxErrorMessage({ code: 'functions/failed-precondition' }))
      .toContain('Nothing is broken on your end')
  })

  it('falls back to something actionable for an unknown failure', () => {
    expect(demoSandboxErrorMessage(new Error('boom'))).toMatch(/try again/i)
    expect(demoSandboxErrorMessage(undefined)).toMatch(/try again/i)
  })
})

describe('formatTimeRemaining', () => {
  it('reads as hours and minutes while there is an hour left', () => {
    expect(formatTimeRemaining(2 * 60 * 60_000 + 41 * 60_000, 0)).toBe('2h 41m')
  })

  it('drops to minutes inside the last hour', () => {
    expect(formatTimeRemaining(9 * 60_000, 0)).toBe('9m')
  })

  it('never reads as zero minutes while time remains', () => {
    expect(formatTimeRemaining(30_000, 0)).toBe('1m')
  })

  it('is null once the clock has run out', () => {
    expect(formatTimeRemaining(1_000, 1_000)).toBeNull()
    expect(formatTimeRemaining(0, 5_000)).toBeNull()
  })
})

describe('remembered expiry', () => {
  it('round trips for the uid that stored it', () => {
    rememberDemoExpiry('visitor-1', 1_700_000)

    expect(readDemoExpiry('visitor-1')).toBe(1_700_000)
  })

  it('ignores a value left behind by a different visitor', () => {
    rememberDemoExpiry('visitor-1', 1_700_000)

    expect(readDemoExpiry('visitor-2')).toBeNull()
  })

  it('is absent for a tab that never went through the demo entry point', () => {
    expect(readDemoExpiry('visitor-1')).toBeNull()
  })
})
