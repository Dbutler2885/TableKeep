import { useEffect, useState } from 'react'
import { lubecCheckTarget, readLubecCheckRoll, type LubecCheckRoll } from '../ruleSets/lubec/checkRoll'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import type { LubecValueName } from '../ruleSets/lubec/sheet'
import { LUBEC_SPIN_STEPS, lubecCirclesStatus, lubecSpinDelay, type LubecSpin } from './lubecCircles'
import type { LubecRoller } from './useLubecRoller'

export type LubecCircles = {
  /** The check whose result a circle shows: the last roll, when it was against that value and is not cleared. */
  result: (name: LubecValueName) => LubecCheckRoll | null
  spin: LubecSpin | null
  status: string
  /** Rolls the value, or clears the result the circle shows. */
  click: (name: LubecValueName) => void
}

// A spinning number is only for show; the roll itself is made and recorded on the click.
const randomPreview = (): number => Math.floor(Math.random() * 100) + 1

const spins = (): boolean =>
  typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

const rollKey = (roll: LubecCheckRoll | null): string | null => (roll ? JSON.stringify(roll) : null)

function useLubecSpin() {
  const [spin, setSpin] = useState<LubecSpin | null>(null)
  useEffect(() => {
    if (!spin) return
    const next = spin.step + 1 < LUBEC_SPIN_STEPS ? { ...spin, step: spin.step + 1, preview: randomPreview() } : null
    const timer = setTimeout(() => setSpin(next), lubecSpinDelay(spin.step))
    return () => clearTimeout(timer)
  }, [spin])
  const start = (name: LubecValueName, target: number | null) => {
    if (target !== null && spins()) setSpin({ name, target, preview: randomPreview(), step: 0 })
  }
  return { spin, start }
}

/**
 * The roll circles' shared state: the last check shown on its own circle until
 * it is clicked away, the prototype's spin before a new result shows, and the
 * status line under the circles. Clearing a result changes nothing stored.
 */
export function useLubecCircles(sheet: LubecCharacterSheet, roller: LubecRoller | null): LubecCircles {
  const { spin, start } = useLubecSpin()
  const [cleared, setCleared] = useState<string | null>(null)
  const check = readLubecCheckRoll(sheet.lastRoll)
  const shown = check && rollKey(check) !== cleared ? check : null
  return {
    result: (name) => (shown?.against === name ? shown : null),
    spin,
    status: lubecCirclesStatus(spin, check, check !== null && shown === null),
    click: (name) => {
      if (shown?.against === name) return setCleared(rollKey(shown))
      if (!roller) return
      setCleared(null)
      start(name, lubecCheckTarget(sheet, name, roller.armed))
      roller.roll(name)
    },
  }
}
