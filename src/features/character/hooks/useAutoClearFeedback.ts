import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'

export function useAutoClearFeedback<T>(
  value: T | null,
  setValue: Dispatch<SetStateAction<T | null>>,
  delayMs = 5000,
) {
  // Owns the delayed feedback-clear effect.
  // It is independent of seeding but is declared before the orchestrator's justSeeded clearing effect.
  useEffect(() => {
    if (value === null) return
    const timer = setTimeout(() => setValue(null), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs, setValue, value])
}
