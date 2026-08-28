import { useFirebaseEmulators } from '../../firebase/config'

/**
 * The one-click "seats" offered on the sign-in screen when the app is pointed
 * at the local Firebase emulators (`npm run demo`, `npm run demo:author`).
 *
 * Why they exist: against the auth emulator a Google popup cannot reach Google.
 * The emulator serves its own stub page instead, and its "Add new account"
 * button mints a user with a random uid - which matches nothing in the
 * committed snapshot, because that snapshot stores campaign ownership, group
 * membership and character ownership by uid. So in emulator mode the sign-in
 * screen offers the two seeded accounts directly and hides the Google button.
 *
 * Where the credentials come from: they are not written here. They are read
 * from `VITE_DEMO_*`, which `scripts/demo/run.mjs` injects into the demo dev
 * server out of the committed `.env.demo` - the same file
 * `scripts/demo/config.mjs` reads to seed those accounts. One definition, used
 * by both sides. `npm run dev` and `npm run build` never load `.env.demo`, so
 * in any other build Vite folds these references to `undefined` and
 * `demoSeats` is empty; nothing about the ordinary sign-in screen changes and
 * no demo login reaches a production bundle.
 *
 * None of it is secret either way: these accounts only ever exist inside a
 * visitor's own emulator.
 */
export type DemoSeat = {
  id: 'gm' | 'player'
  /** Button text. Names the seat a visitor is choosing, not the account behind it. */
  title: string
  /** One supporting line describing what that seat sees. */
  caption: string
  email: string
  password: string
}

type DemoSeatEnv = Record<string, unknown>

const SEAT_DEFINITIONS = [
  {
    id: 'gm',
    title: 'Enter as the Game Master',
    caption: 'Run the table: the whole campaign, every map, every character.',
    emailKey: 'VITE_DEMO_GM_EMAIL',
    passwordKey: 'VITE_DEMO_GM_PASSWORD',
  },
  {
    id: 'player',
    title: 'Enter as a Player',
    caption: 'Sit at the table: one character sheet and what the party can see.',
    emailKey: 'VITE_DEMO_PLAYER_EMAIL',
    passwordKey: 'VITE_DEMO_PLAYER_PASSWORD',
  },
] as const satisfies readonly {
  id: DemoSeat['id']
  title: string
  caption: string
  emailKey: string
  passwordKey: string
}[]

function readCredential(env: DemoSeatEnv, key: string) {
  const value = env[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Resolves the seats to offer, or an empty list when there are none.
 *
 * Empty unless the app is talking to the emulators *and* every seat is fully
 * configured: a half-filled `.env.demo` should show no seat picker rather than
 * a picker with a button that cannot work.
 *
 * The credentials half of that test is load-bearing beyond `.env.demo`.
 * `scripts/browser-smoke.mjs` also runs the app with
 * `VITE_USE_FIREBASE_EMULATORS=true`, against its own throwaway accounts and
 * an empty emulator, and it supplies no `VITE_DEMO_*`. It gets the ordinary
 * Google-plus-form screen, which is what it asserts against.
 */
export function resolveDemoSeats(env: DemoSeatEnv, emulatorsEnabled: boolean): DemoSeat[] {
  if (!emulatorsEnabled) return []

  const seats: DemoSeat[] = []

  for (const definition of SEAT_DEFINITIONS) {
    const email = readCredential(env, definition.emailKey)
    const password = readCredential(env, definition.passwordKey)

    if (!email || !password) return []

    seats.push({
      id: definition.id,
      title: definition.title,
      caption: definition.caption,
      email,
      password,
    })
  }

  return seats
}

export const demoSeats = resolveDemoSeats(import.meta.env, useFirebaseEmulators)
