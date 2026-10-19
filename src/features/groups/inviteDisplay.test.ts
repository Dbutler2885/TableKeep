import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyToClipboard, inviteExpiresIn, inviteStateLabel, inviteUrl } from './inviteDisplay'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = 1_000_000_000_000

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('inviteUrl', () => {
  it('builds the join link on this site', () => {
    vi.stubGlobal('window', { location: { origin: 'https://tablekeep.example' } })

    expect(inviteUrl('tok-1')).toBe('https://tablekeep.example/join/tok-1')
  })
})

describe('copyToClipboard', () => {
  it('writes the text to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await copyToClipboard('hello')

    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('passes a refusal on', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: async () => Promise.reject(new Error('denied')) } })

    await expect(copyToClipboard('hello')).rejects.toThrow('denied')
  })

  it('resolves without copying when there is no clipboard', async () => {
    vi.stubGlobal('navigator', {})

    await expect(copyToClipboard('hello')).resolves.toBeUndefined()
  })
})

describe('inviteStateLabel', () => {
  it('names each state', () => {
    expect(inviteStateLabel('active', false)).toBe('Active')
    expect(inviteStateLabel('redeemed', false)).toBe('Redeemed')
    expect(inviteStateLabel('revoked', false)).toBe('Revoked')
    expect(inviteStateLabel('expired', false)).toBe('Expired')
  })

  it('reads Copied only for an active invite just copied', () => {
    expect(inviteStateLabel('active', true)).toBe('Copied')
    expect(inviteStateLabel('redeemed', true)).toBe('Redeemed')
    expect(inviteStateLabel('expired', true)).toBe('Expired')
  })
})

describe('inviteExpiresIn', () => {
  it('is blank without an expiry or once it has passed', () => {
    expect(inviteExpiresIn(0, NOW)).toBe('')
    expect(inviteExpiresIn(NOW, NOW)).toBe('')
    expect(inviteExpiresIn(NOW - 1, NOW)).toBe('')
  })

  it('counts whole days from one day out', () => {
    expect(inviteExpiresIn(NOW + DAY, NOW)).toBe('1d left')
    expect(inviteExpiresIn(NOW + 6 * DAY + 23 * HOUR, NOW)).toBe('6d left')
  })

  it('counts whole hours under a day, never fewer than one', () => {
    expect(inviteExpiresIn(NOW + DAY - 1, NOW)).toBe('23h left')
    expect(inviteExpiresIn(NOW + 2 * HOUR, NOW)).toBe('2h left')
    expect(inviteExpiresIn(NOW + 1, NOW)).toBe('1h left')
  })
})
