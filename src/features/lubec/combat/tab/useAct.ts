import { useState } from 'react'
import type { AttackAct } from './attackCommands'

/** One table act at a time from a control: busy while it is answered, and the table's refusal if it says no. */
export function useAct() {
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const run = async (act: () => AttackAct) => {
    setBusy(true)
    setRefusal(await act())
    setBusy(false)
  }
  return { busy, refusal, run: (act: () => AttackAct) => void run(act) }
}
