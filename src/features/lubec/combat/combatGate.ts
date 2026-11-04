/**
 * Whether this build offers mapless combat. Off unless a build sets
 * `VITE_LUBEC_MAPLESS_COMBAT=true`, so a production build shows no Combat tab,
 * runs no fight listener and offers no unfinished combat action until the
 * release ticket turns it on.
 */
export function resolveLubecCombatEnabled(env: Record<string, unknown>): boolean {
  return typeof env.VITE_LUBEC_MAPLESS_COMBAT === 'string' && env.VITE_LUBEC_MAPLESS_COMBAT.trim() === 'true'
}

export const lubecCombatEnabled = resolveLubecCombatEnabled(import.meta.env)
