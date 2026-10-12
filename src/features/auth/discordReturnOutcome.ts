/**
 * The outcome Discord's return left in the address, caught before the router moves on.
 *
 * The connect callback sends people back to the app's root with
 * `?discord=<outcome>`. The app redirects from the root to a group screen at
 * once, which drops the query, so by the time anything that could show the
 * outcome has mounted it is gone. It is read here when the module first loads,
 * which is before the first render, and held until something shows it.
 */

/** The `discord` outcome in a query string, or null. */
export function readDiscordOutcome(search: string): string | null {
  return new URLSearchParams(search).get('discord') || null
}

let pendingOutcome = typeof window === 'undefined' ? null : readDiscordOutcome(window.location.search)

/**
 * How long the outcome stays available once something has shown it.
 *
 * The first screen to mount after the return is often not the one the person
 * ends up on: the app shows the group picker for a moment while it loads their
 * groups, then the group itself. Holding the outcome briefly lets the screen
 * they settle on show it too, without it reappearing for the rest of the visit.
 */
const SHOWN_FOR_MS = 10_000
let expiry: ReturnType<typeof setTimeout> | null = null

/** The outcome waiting to be shown, if any. Reading it does not use it up. */
export function pendingDiscordOutcome(): string | null {
  return pendingOutcome
}

/** Notes that the outcome is now on screen: starts its expiry and takes it out of the address. */
export function noteDiscordOutcomeShown(): void {
  if (pendingOutcome && !expiry) {
    expiry = setTimeout(() => {
      pendingOutcome = null
    }, SHOWN_FOR_MS)
  }
  const url = new URL(window.location.href)
  if (url.searchParams.has('discord')) {
    url.searchParams.delete('discord')
    window.history.replaceState(window.history.state, '', url)
  }
}
