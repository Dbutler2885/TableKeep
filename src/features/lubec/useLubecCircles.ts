import { useEffect, useState } from 'react'
import { lubecCheckTarget, type LubecAdvantage } from '../ruleSets/lubec/checkRoll'
import type { LubecCharacterSheet, LubecCounters } from '../ruleSets/lubec/characterRecord'
import { readLubecLastRoll, type LubecLastRoll } from '../ruleSets/lubec/lastRoll'
import { lubecLowestSave } from '../ruleSets/lubec/recoveryRoll'
import { lubecCirclesStatus, lubecNextSpin, lubecRollCircle, lubecSpinWait, type LubecCircleName, type LubecSpin } from './lubecCircles'
import type { LubecRoller } from './useLubecRoller'

export type LubecCircles = {
  /** The roll whose result a circle shows: the last roll, when it was on that circle and is not cleared. */
  result: (name: LubecCircleName) => LubecLastRoll | null
  spin: LubecSpin | null
  status: string
  /** Rolls on the circle, or clears the result it shows. */
  click: (name: LubecCircleName) => void
}

// A spinning number is only for show; the roll itself is made and recorded on the click.
const randomPreview = (sides: number): number => Math.floor(Math.random() * sides) + 1

/** Whether the viewer allows motion: the circles spin and the sheet scrolls smoothly only then. */
export const lubecMotionAllowed = (): boolean =>
  typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Which roll this is: what it was against and its dice. The copy read back from
// the store can differ from the one just made in key order, in a Panic row added
// or dismissed since, or in fields an older roll left behind (the sheet is saved
// by merging), and none of those may bring back a cleared number.
const rollKey = (roll: LubecLastRoll): string =>
  JSON.stringify([roll.kind, roll.kind === 'panic' ? null : roll.against, roll.target, roll.dice, roll.result, roll.advantage, roll.outcome])

/** What a click on a circle rolls: its target, the die, the mode it rolls with, and the roll itself. */
type LubecCircleRoll = { target: number | null; sides: number; advantage: LubecAdvantage; roll: () => void }

function useLubecSpin() {
  const [spin, setSpin] = useState<LubecSpin | null>(null)
  useEffect(() => {
    if (!spin) return
    const next = lubecNextSpin(spin, randomPreview)
    const timer = setTimeout(() => setSpin(next), lubecSpinWait(spin))
    return () => clearTimeout(timer)
  }, [spin])
  const start = (name: LubecCircleName, { target, sides, advantage }: LubecCircleRoll, counters: LubecCounters) => {
    if (target === null || !lubecMotionAllowed()) return
    const ghost = advantage === 'normal' ? null : randomPreview(sides)
    setSpin({ name, target, sides, preview: randomPreview(sides), step: 0, advantage, ghost, phase: 'spin', counters })
  }
  return { spin, start }
}

type LubecSpinner = ReturnType<typeof useLubecSpin>

/** The last roll, the one still shown on its circle unless it was clicked away, and whether it was. */
type LubecLastShown = {
  roll: LubecLastRoll | null
  shown: LubecLastRoll | null
  cleared: boolean
  clear: () => void
  reset: () => void
}

function useLubecLastShown(sheet: LubecCharacterSheet): LubecLastShown {
  const [clearedKey, setClearedKey] = useState<string | null>(null)
  const roll = readLubecLastRoll(sheet.lastRoll)
  const shown = roll && rollKey(roll) !== clearedKey ? roll : null
  return {
    roll,
    shown,
    cleared: roll !== null && shown === null,
    clear: () => setClearedKey(roll && rollKey(roll)),
    reset: () => setClearedKey(null),
  }
}

const shownOn = (last: LubecLastShown, name: LubecCircleName): LubecLastRoll | null =>
  (last.shown && lubecRollCircle(last.shown) === name ? last.shown : null)

// The Panic Check rolls a d20 over Stress, the Recovery Save a d100 under the lowest Save, and a Stat or Save a d100 under itself.
// Each rolls twice under Advantage or Disadvantage.
function circleRoll(sheet: LubecCharacterSheet, roller: LubecRoller, name: LubecCircleName): LubecCircleRoll {
  const { advantage } = roller
  if (name === 'Panic') return { target: sheet.counters.stress, sides: 20, advantage, roll: roller.panic }
  if (name === 'Recovery') return { target: lubecLowestSave(sheet)?.value ?? null, sides: 100, advantage, roll: roller.recover }
  return { target: lubecCheckTarget(sheet, name, roller.armed), sides: 100, advantage, roll: () => roller.roll(name) }
}

type CircleClick = { sheet: LubecCharacterSheet; roller: LubecRoller | null; last: LubecLastShown; spinner: LubecSpinner }

// A shown result is cleared; otherwise the circle is rolled, if the viewer may roll.
function clickLubecCircle({ sheet, roller, last, spinner }: CircleClick, name: LubecCircleName) {
  if (shownOn(last, name)) return last.clear()
  if (!roller) return
  const roll = circleRoll(sheet, roller, name)
  last.reset()
  spinner.start(name, roll, sheet.counters)
  roll.roll()
}

/**
 * The roll circles' shared state: the last roll shown on its own circle until
 * it is clicked away, the prototype's spin before a new result shows, and the
 * status line under the circles. Clearing a result changes nothing stored.
 */
export function useLubecCircles(sheet: LubecCharacterSheet, roller: LubecRoller | null): LubecCircles {
  const spinner = useLubecSpin()
  const last = useLubecLastShown(sheet)
  return {
    result: (name) => shownOn(last, name),
    spin: spinner.spin,
    status: lubecCirclesStatus(spinner.spin, last.cleared ? last.roll : null, last.roll),
    click: (name) => clickLubecCircle({ sheet, roller, last, spinner }, name),
  }
}
