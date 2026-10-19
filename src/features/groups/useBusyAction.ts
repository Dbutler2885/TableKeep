import { useState } from 'react'
import { runBusyAction } from './busyAction'

/** The busy flag and error every campaign and group dialog on the group home shares. */
export function useBusyAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = (action: () => Promise<void>, options: Parameters<typeof runBusyAction>[2]) =>
    runBusyAction({ setBusy, setError }, action, options)
  return { busy, error, setError, run }
}

export type BusyAction = ReturnType<typeof useBusyAction>
