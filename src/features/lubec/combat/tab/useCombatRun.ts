import { useState } from 'react'
import type { AttackAct } from './attackCommands'

/** One act at a time: pressed, it waits on the table and keeps the table's refusal to show. */
export function useCombatRun() {
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const run = async (act: () => AttackAct) => {
    setBusy(true)
    setRefusal(await act())
    setBusy(false)
  }
  return { busy, refusal, run: (act: () => AttackAct) => void run(act) }
}

export type CombatRun = ReturnType<typeof useCombatRun>
