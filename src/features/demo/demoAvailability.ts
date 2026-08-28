import { useFirebaseEmulators } from '../../firebase/config'

/**
 * Whether the sign-in screen offers the hosted "try it now" sandbox.
 *
 * The link is only worth showing where the `createDemoSandboxSession` callable
 * can actually answer it, which is a deployed build - and, deliberately, the
 * local sandbox rig.
 *
 * Against the emulators it is off by default, because the two builds that
 * normally run there cannot serve it: `npm run demo` starts no functions
 * emulator and hands a visitor a populated campaign through the seat picker
 * instead, and `scripts/browser-smoke.mjs` runs with an empty emulator and
 * asserts against the ordinary Google-plus-form screen. `npm run demo:sandbox`
 * is the exception - it starts the functions emulator and seeds the template, so
 * it opts back in with `VITE_DEMO_SANDBOX=true`.
 *
 * A production build never sets that variable and never needs to: with the
 * emulators off, the link is on.
 */
export function resolveDemoSandboxOffered(env: Record<string, unknown>, emulatorsEnabled: boolean): boolean {
  if (!emulatorsEnabled) return true
  return typeof env.VITE_DEMO_SANDBOX === 'string' && env.VITE_DEMO_SANDBOX.trim() === 'true'
}

export const demoSandboxOffered = resolveDemoSandboxOffered(import.meta.env, useFirebaseEmulators)
