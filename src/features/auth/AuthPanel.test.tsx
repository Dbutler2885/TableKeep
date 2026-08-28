// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type { DemoSeat } from './demoSeats'

const GM_SEAT: DemoSeat = {
  id: 'gm',
  title: 'Enter as the Game Master',
  caption: 'Run the table.',
  email: 'demo-gm@tablekeep.test',
  password: 'tablekeep-demo',
}

const PLAYER_SEAT: DemoSeat = {
  id: 'player',
  title: 'Enter as a Player',
  caption: 'Sit at the table.',
  email: 'demo-player@tablekeep.test',
  password: 'tablekeep-demo',
}

// `demoSeats` is a module constant resolved from `import.meta.env` at import
// time, so the two branches are exercised by mutating this array in place
// rather than by re-importing the panel under a different environment.
const mocks = vi.hoisted(() => ({
  seats: [] as DemoSeat[],
  authStub: { name: 'auth-stub' },
  signInWithEmailAndPassword: vi.fn(async () => ({})),
  signInWithPopup: vi.fn(async () => ({})),
}))

vi.mock('./demoSeats', () => ({ demoSeats: mocks.seats }))
vi.mock('../../firebase', () => ({ auth: mocks.authStub, db: { name: 'db-stub' } }))
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  createUserWithEmailAndPassword: vi.fn(async () => ({ user: { uid: 'uid' } })),
  sendPasswordResetEmail: vi.fn(async () => undefined),
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  signInWithPopup: mocks.signInWithPopup,
}))

const { AuthPanel } = await import('./AuthPanel')

function setSeats(seats: DemoSeat[]) {
  mocks.seats.length = 0
  mocks.seats.push(...seats)
}

beforeEach(() => {
  vi.clearAllMocks()
  setSeats([])
})

afterEach(cleanup)

describe('AuthPanel sign-in screen, against the local emulators', () => {
  beforeEach(() => {
    setSeats([GM_SEAT, PLAYER_SEAT])
  })

  it('offers the two seats and no Google button', () => {
    render(<AuthPanel />)

    expect(screen.getByRole('button', { name: /Enter as the Game Master/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Enter as a Player/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Continue with Google/ })).toBeNull()
  })

  it('keeps the ordinary email and password form underneath', () => {
    render(<AuthPanel />)

    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in with email' })).toBeTruthy()
  })

  it.each([
    ['Enter as the Game Master', GM_SEAT],
    ['Enter as a Player', PLAYER_SEAT],
  ])('signs in as the seeded account behind "%s"', async (label, seat) => {
    render(<AuthPanel />)

    await act(async () => {
      screen.getByRole('button', { name: new RegExp(label) }).click()
    })

    expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledWith(
      mocks.authStub,
      seat.email,
      seat.password,
    )
    expect(mocks.signInWithPopup).not.toHaveBeenCalled()
  })

  it('hides the Google button on the sign-up view too', async () => {
    render(<AuthPanel />)

    await act(async () => {
      screen.getByRole('button', { name: 'Create an account' }).click()
    })

    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Continue with Google/ })).toBeNull()
  })
})

describe('AuthPanel sign-in screen, in an ordinary build', () => {
  it('offers the Google button and no seats', () => {
    render(<AuthPanel />)

    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Enter as the Game Master/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Enter as a Player/ })).toBeNull()
    expect(screen.queryByText(/Pick a seat/)).toBeNull()
  })

  it('still offers the Google button on the sign-up view', async () => {
    render(<AuthPanel />)

    await act(async () => {
      screen.getByRole('button', { name: 'Create an account' }).click()
    })

    expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeTruthy()
  })
})
