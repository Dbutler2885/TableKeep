import { useEffect, useState } from 'react'
import { LUBEC_SPIN_STEPS, lubecSpinDelay } from '../lubecCircles'
import { lubecMotionAllowed } from '../useLubecCircles'
import { combatRollPreview } from './combatRollPresentation'

const initialStep = (value: string): number => /^\d+$/.test(value) && lubecMotionAllowed() ? 0 : LUBEC_SPIN_STEPS

/** The sheet's slowing-number cadence, ending at the shared, already committed result. */
export function useCombatRollSpin(id: string, value: string) {
  const [step, setStep] = useState(() => initialStep(value))
  const rolling = step < LUBEC_SPIN_STEPS
  useEffect(() => {
    if (!rolling) return
    const timer = setTimeout(() => setStep((current) => current + 1), lubecSpinDelay(step))
    return () => clearTimeout(timer)
  }, [rolling, step])
  return { rolling, value: rolling ? combatRollPreview(id, step) : value }
}
