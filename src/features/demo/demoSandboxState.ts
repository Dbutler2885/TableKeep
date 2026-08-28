/**
 * The two pieces of demo state the browser owns: how a failed hand-out is
 * explained, and when the sandbox in this tab runs out.
 *
 * Both are pure so they can be tested without a Firebase project.
 */

export type CallableFailure = { code?: unknown; message?: unknown }

/**
 * Turns a `createDemoSandboxSession` rejection into something a visitor can act
 * on.
 *
 * The capacity case is the one that matters. Hitting the ceiling is a normal,
 * expected outcome - it is the guard rail doing its job - so it gets a sentence
 * that says what happened and what to do, not a stack trace or a dead end.
 */
export function demoSandboxErrorMessage(error: unknown): string {
  const code = typeof (error as CallableFailure)?.code === 'string' ? String((error as CallableFailure).code) : ''

  if (code === 'functions/resource-exhausted') {
    return 'Every demo table is in use right now. They are handed back automatically, so trying again in a few minutes should get you one.'
  }
  if (code === 'functions/failed-precondition') {
    return 'The demo campaign has not been set up yet. Nothing is broken on your end.'
  }
  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') {
    return 'Could not reach the demo service. Check your connection and try again.'
  }
  if (code === 'auth/operation-not-allowed') {
    return 'The demo is not enabled for this site yet.'
  }
  return 'Something went wrong setting up your demo table. Try again in a moment.'
}

const EXPIRY_STORAGE_KEY = 'tablekeep.demoSandboxExpiresAt'

type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function storage(): SessionStorageLike | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    // Safari in private mode throws on access rather than returning null.
    return null
  }
}

/**
 * Remembers when this tab's sandbox expires.
 *
 * `sessionStorage`, not a Firestore read: the expiry is already known the moment
 * the callable returns, and a demo visitor reloading the page should not cost a
 * document read to re-learn something that never changes. A tab that never went
 * through the demo entry point - a shared link, a restored session - simply has
 * no value here, and the banner says "a few hours" instead of counting down.
 */
export function rememberDemoExpiry(uid: string, expiresAtMs: number) {
  storage()?.setItem(EXPIRY_STORAGE_KEY, JSON.stringify({ uid, expiresAtMs }))
}

export function readDemoExpiry(uid: string): number | null {
  const raw = storage()?.getItem(EXPIRY_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { uid?: unknown; expiresAtMs?: unknown }
    if (parsed.uid !== uid || typeof parsed.expiresAtMs !== 'number') return null
    return parsed.expiresAtMs
  } catch {
    return null
  }
}

export function forgetDemoExpiry() {
  storage()?.removeItem(EXPIRY_STORAGE_KEY)
}

/** "2h 41m", "9m", or null once the clock has run out. */
export function formatTimeRemaining(expiresAtMs: number, nowMs: number): string | null {
  const remaining = expiresAtMs - nowMs
  if (remaining <= 0) return null
  const totalMinutes = Math.floor(remaining / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${Math.max(1, minutes)}m`
}
