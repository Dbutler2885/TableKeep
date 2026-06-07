import { describe, expect, it, vi } from 'vitest'
import {
  getUsernameAvailabilityStart,
  resolveUsernameAvailability,
} from './useUsernameAvailability'

describe('username availability helpers', () => {
  it('classifies empty input as idle without lookup', () => {
    expect(getUsernameAvailabilityStart('   ')).toEqual({
      username: '',
      status: 'idle',
    })
  })

  it('classifies malformed input as invalid without lookup', () => {
    expect(getUsernameAvailabilityStart('abc-def')).toEqual({
      username: 'abc-def',
      status: 'invalid',
    })
  })

  it('transitions valid available input from checking to available', async () => {
    const fetchUsernameExists = vi.fn(async () => false)

    expect(getUsernameAvailabilityStart(' Player1 ')).toEqual({
      username: 'Player1',
      status: 'checking',
    })
    await expect(resolveUsernameAvailability('Player1', fetchUsernameExists)).resolves.toBe('available')
    expect(fetchUsernameExists).toHaveBeenCalledWith('Player1')
  })

  it('transitions valid taken input from checking to taken', async () => {
    const fetchUsernameExists = vi.fn(async () => true)

    expect(getUsernameAvailabilityStart('Player1')).toEqual({
      username: 'Player1',
      status: 'checking',
    })
    await expect(resolveUsernameAvailability('Player1', fetchUsernameExists)).resolves.toBe('taken')
    expect(fetchUsernameExists).toHaveBeenCalledWith('Player1')
  })
})
