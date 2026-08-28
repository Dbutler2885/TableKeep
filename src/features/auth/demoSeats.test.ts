import { describe, expect, it } from 'vitest'
import { resolveDemoSeats } from './demoSeats'

const demoEnv = {
  VITE_DEMO_GM_EMAIL: 'demo-gm@tablekeep.test',
  VITE_DEMO_GM_PASSWORD: 'tablekeep-demo',
  VITE_DEMO_PLAYER_EMAIL: 'demo-player@tablekeep.test',
  VITE_DEMO_PLAYER_PASSWORD: 'tablekeep-demo',
}

describe('resolveDemoSeats', () => {
  it('offers the two seeded accounts when the emulators are in use', () => {
    const seats = resolveDemoSeats(demoEnv, true)

    expect(seats.map((seat) => [seat.id, seat.email, seat.password])).toEqual([
      ['gm', 'demo-gm@tablekeep.test', 'tablekeep-demo'],
      ['player', 'demo-player@tablekeep.test', 'tablekeep-demo'],
    ])
  })

  it('labels each seat by the seat rather than the account behind it', () => {
    const [gm, player] = resolveDemoSeats(demoEnv, true)

    expect(gm.title).toBe('Enter as the Game Master')
    expect(player.title).toBe('Enter as a Player')

    for (const seat of [gm, player]) {
      expect(seat.title).not.toContain('@')
      expect(`${seat.title} ${seat.caption}`.toLowerCase()).not.toMatch(/emulator|seed|demo account/)
    }
  })

  it('stays at two seats when the environment carries other demo credentials', () => {
    // The demo harness seeds more accounts than it offers - the rest of the
    // party owns the campaign's characters. A visitor still picks between one
    // Game Master seat and one Player seat, whatever else is in scope.
    const seats = resolveDemoSeats(
      {
        ...demoEnv,
        VITE_DEMO_PLAYER_2_EMAIL: 'marisol@tablekeep.test',
        VITE_DEMO_PLAYER_2_PASSWORD: 'tablekeep-demo',
      },
      true,
    )

    expect(seats.map((seat) => seat.id)).toEqual(['gm', 'player'])
  })

  it('offers nothing outside emulator mode, even with the credentials present', () => {
    expect(resolveDemoSeats(demoEnv, false)).toEqual([])
  })

  it('offers nothing when the demo credentials are absent, as in a production build', () => {
    expect(resolveDemoSeats({}, true)).toEqual([])
  })

  it('offers nothing rather than a half-filled picker when one seat is unconfigured', () => {
    expect(resolveDemoSeats({ ...demoEnv, VITE_DEMO_PLAYER_PASSWORD: '' }, true)).toEqual([])
    expect(resolveDemoSeats({ ...demoEnv, VITE_DEMO_GM_EMAIL: '   ' }, true)).toEqual([])
  })

  it('ignores non-string env values', () => {
    expect(resolveDemoSeats({ ...demoEnv, VITE_DEMO_GM_EMAIL: true }, true)).toEqual([])
  })
})
