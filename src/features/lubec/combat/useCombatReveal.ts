import { useEffect, useState } from 'react'
import { useCombatLogView } from './CombatLogContext'
import { combatRevealWait } from './combatReveal'
import { useLubecCombat, type LubecLiveFight } from './combatWatch'

/** A lost log entry must not freeze the table: one wait releases after this long. */
export const COMBAT_REVEAL_LIMIT_MS = 8000

/** The value as it stood when a hold began, for as long as it holds. */
export function useHeld<T>(value: T, held: boolean): T {
  const [kept, setKept] = useState(value)
  if (!held && kept !== value) setKept(value)
  return held ? kept : value
}

/** Whether this wait has run out its time. */
function useWaitExpired(wait: string | null): boolean {
  const [expired, setExpired] = useState<string | null>(null)
  useEffect(() => {
    if (wait === null) return undefined
    const timer = setTimeout(() => setExpired(wait), COMBAT_REVEAL_LIMIT_MS)
    return () => clearTimeout(timer)
  }, [wait])
  return wait !== null && expired === wait
}

const sameFight = (held: LubecLiveFight | null, live: LubecLiveFight | null) => held !== null && held.id === live?.id

/** The live fight as far as its roll cards have revealed it, and whether a reveal is still holding the page back. */
export function useCombatReveal(): { live: LubecLiveFight | null; revealing: boolean } {
  const { live } = useLubecCombat()
  const wait = combatRevealWait(useCombatLogView(), live?.fight.state ?? null)
  const expired = useWaitExpired(wait)
  const revealing = wait !== null && !expired
  const held = useHeld(live, revealing)
  return { live: sameFight(held, live) ? held : live, revealing }
}
