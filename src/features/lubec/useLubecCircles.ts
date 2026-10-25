import { useEffect, useState } from 'react'
import { lubecCheckTarget, readLubecCheckRoll, type LubecCheckRoll } from '../ruleSets/lubec/checkRoll'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { readLubecLastRoll } from '../ruleSets/lubec/lastRoll'
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

/** Whether the viewer allows motion: the circles spin and the sheet scrolls smoothly only then. */
export const lubecMotionAllowed = (): boolean =>
  typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

const rollKey = (roll: LubecCheckRoll): string => JSON.stringify(roll)

function useLubecSpin() {
  const [spin, setSpin] = useState<LubecSpin | null>(null)
  useEffect(() => {
    if (!spin) return
    const next = spin.step + 1 < LUBEC_SPIN_STEPS ? { ...spin, step: spin.step + 1, preview: randomPreview() } : null
    const timer = setTimeout(() => setSpin(next), lubecSpinDelay(spin.step))
    return () => clearTimeout(timer)
  }, [spin])
  const start = (name: LubecValueName, target: number | null) => {
    if (target !== null && lubecMotionAllowed()) setSpin({ name, target, preview: randomPreview(), step: 0 })
  }
  return { spin, start }
}

type LubecSpinner = ReturnType<typeof useLubecSpin>

/** The last check, the one still shown on its circle unless it was clicked away, and whether it was. */
type LubecLastCheck = {
  check: LubecCheckRoll | null
  shown: LubecCheckRoll | null
  cleared: boolean
  clear: () => void
  reset: () => void
}

function useLubecLastCheck(sheet: LubecCharacterSheet): LubecLastCheck {
  const [clearedKey, setClearedKey] = useState<string | null>(null)
  const check = readLubecCheckRoll(sheet.lastRoll)
  const shown = check && rollKey(check) !== clearedKey ? check : null
  return {
    check,
    shown,
    cleared: check !== null && shown === null,
    clear: () => setClearedKey(check && rollKey(check)),
    reset: () => setClearedKey(null),
  }
}

const shownOn = (last: LubecLastCheck, name: LubecValueName): LubecCheckRoll | null =>
  (last.shown?.against === name ? last.shown : null)

type CircleClick = { sheet: LubecCharacterSheet; roller: LubecRoller | null; last: LubecLastCheck; spinner: LubecSpinner }

// A shown result is cleared; otherwise the value is rolled, if the viewer may roll.
function clickLubecCircle({ sheet, roller, last, spinner }: CircleClick, name: LubecValueName) {
  if (shownOn(last, name)) return last.clear()
  if (!roller) return
  last.reset()
  spinner.start(name, lubecCheckTarget(sheet, name, roller.armed))
  roller.roll(name)
}

/**
 * The roll circles' shared state: the last check shown on its own circle until
 * it is clicked away, the prototype's spin before a new result shows, and the
 * status line under the circles. Clearing a result changes nothing stored.
 */
export function useLubecCircles(sheet: LubecCharacterSheet, roller: LubecRoller | null): LubecCircles {
  const spinner = useLubecSpin()
  const last = useLubecLastCheck(sheet)
  return {
    result: (name) => shownOn(last, name),
    spin: spinner.spin,
    status: lubecCirclesStatus(spinner.spin, last.cleared ? last.check : null, readLubecLastRoll(sheet.lastRoll)),
    click: (name) => clickLubecCircle({ sheet, roller, last, spinner }, name),
  }
}
