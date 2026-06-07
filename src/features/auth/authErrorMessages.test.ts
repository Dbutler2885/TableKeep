import { describe, expect, it } from 'vitest'
import { getAuthErrorMessage } from './authErrorMessages'

describe('getAuthErrorMessage', () => {
  it('maps known Firebase auth errors to friendly messages', () => {
    expect(getAuthErrorMessage({ code: 'auth/wrong-password' })).toBe('Incorrect password.')
    expect(getAuthErrorMessage({ code: 'auth/user-not-found' })).toBe('No account found for this email.')
  })

  it('gives actionable copy for Google popup and redirect storage failures', () => {
    expect(getAuthErrorMessage({ code: 'auth/popup-blocked' })).toBe(
      'Your browser blocked the Google sign-in popup. Allow popups for this site, then try again.',
    )
    expect(getAuthErrorMessage({ code: 'auth/no-auth-event' })).toBe(
      'Google sign-in lost its browser session state. Try the Google button again, or use email sign-in.',
    )
  })

  it('falls back to the error message when the code is unknown', () => {
    expect(getAuthErrorMessage(new Error('Unexpected Firebase failure.'))).toBe(
      'Unexpected Firebase failure.',
    )
  })

  it('falls back to a generic message when no useful error details exist', () => {
    expect(getAuthErrorMessage(null)).toBe('Something went wrong. Try again.')
  })
})
