import { useState } from 'react'
import type { LubecEffectRecovery, LubecRecoveryKind } from './effectRecovery'

export type RecoveringEffect = { id: string; kind: LubecRecoveryKind }

const failureWords = (error: unknown, words: string) => error instanceof Error ? error.message : `The ${words} could not be saved. Retry to recover its receipt.`
const SAVE_NAMES = { wake: 'waking save', reach: 'recovery save' } as const

/** One pending recovery keeps its card identity across failed saves and receipt retries. */
export function useLubecEffectRecovery(onRecover: LubecEffectRecovery | undefined) {
  const [recovering, setRecovering] = useState<RecoveringEffect | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recover = async () => {
    if (!onRecover || !recovering || busy) return
    setBusy(true)
    setError(null)
    const words = SAVE_NAMES[recovering.kind]
    try {
      const result = await onRecover(recovering.id, recovering.kind)
      if (result.status === 'repair') setError(`The sheet changed. Refresh it before retrying the same ${words}.`)
      else setRecovering(null)
    } catch (cause) { setError(failureWords(cause, words)) }
    finally { setBusy(false) }
  }
  return { recovering, setRecovering, busy, error, setError, recover }
}
