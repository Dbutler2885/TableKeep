// Pins the shape of the demo account list.
//
// Two things can go quietly wrong here and only show up as a broken demo:
// an account that cannot get past the username gate, and a new account that
// drags a third button onto the sign-in screen. Both are cheap to assert, and
// this suite asserts them against the app's own rules rather than a copy of
// them.

import { describe, expect, it } from 'vitest'
import { demoAccounts, demoEnv, demoSeatAccounts } from './config.mjs'
import { USERNAME_LENGTH, isValidUsername } from '../../src/features/auth/usernameRules'
import { resolveDemoSeats } from '../../src/features/auth/demoSeats'

const partyMembers = demoAccounts.filter((account) => account.seat === null)

describe('demoAccounts', () => {
  it('seats the Game Master and gives every character in the party an owner', () => {
    expect(demoAccounts.map((account) => account.uid)).toEqual([
      'demo-gm-uid',
      'demo-player-uid',
      'demo-player-2-uid',
      'demo-player-3-uid',
      'demo-player-4-uid',
    ])

    expect(partyMembers).toHaveLength(3)
  })

  it('keeps the original player account exactly as the snapshot and `.env.demo` know it', () => {
    const player = demoAccounts.find((account) => account.uid === 'demo-player-uid')

    expect(player).toMatchObject({
      email: 'demo-player@tablekeep.test',
      password: 'tablekeep-demo',
      username: 'demoPC1',
    })
  })

  it('gives every account a username the app would accept', () => {
    for (const account of demoAccounts) {
      expect(account.username).toHaveLength(USERNAME_LENGTH)
      expect(isValidUsername(account.username)).toBe(true)
    }
  })

  it('keeps uids, usernames and emails distinct', () => {
    for (const key of ['uid', 'username', 'email']) {
      const values = demoAccounts.map((account) => account[key])
      expect(new Set(values).size).toBe(values.length)
    }
  })

  it('gives every account the credentials and display name seeding needs', () => {
    for (const account of demoAccounts) {
      expect(account.email).toMatch(/^[^@\s]+@[^@\s]+$/)
      expect(account.password.length).toBeGreaterThanOrEqual(6)
      expect(account.displayName.trim()).not.toBe('')
      expect(account.role.trim()).not.toBe('')
    }
  })
})

describe('demoSeatAccounts', () => {
  it('offers exactly the Game Master and the Player', () => {
    expect(demoSeatAccounts.map((account) => account.seat)).toEqual(['gm', 'player'])
  })

  it('sources every seat credential from `.env.demo`, so the app and the seeder agree', () => {
    expect(demoSeatAccounts.map((account) => [account.email, account.password])).toEqual([
      [demoEnv.VITE_DEMO_GM_EMAIL, demoEnv.VITE_DEMO_GM_PASSWORD],
      [demoEnv.VITE_DEMO_PLAYER_EMAIL, demoEnv.VITE_DEMO_PLAYER_PASSWORD],
    ])
  })

  it('matches the seats the sign-in screen resolves from the same file', () => {
    const seats = resolveDemoSeats(demoEnv, true)

    expect(seats.map((seat) => [seat.id, seat.email, seat.password])).toEqual(
      demoSeatAccounts.map((account) => [account.seat, account.email, account.password]),
    )
  })

  it('keeps the party members out of `.env.demo`, so they cannot become seats', () => {
    const demoEnvValues = Object.entries(demoEnv)
      .filter(([key]) => key.startsWith('VITE_DEMO_'))
      .map(([, value]) => value)

    for (const account of partyMembers) {
      expect(demoEnvValues).not.toContain(account.email)
    }
  })
})
