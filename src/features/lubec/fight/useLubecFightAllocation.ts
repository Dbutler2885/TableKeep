import { useContext, useEffect, useRef, useState } from 'react'
import { rollLubecDie } from '../../ruleSets/lubec/dice'
import {
  withLubecLineMoved,
  withLubecLinePlaced,
  withLubecLineRemoved,
  type LubecAllocationMode,
} from '../../ruleSets/lubec/fightAllocation'
import { LUBEC_SPIN_STEPS, lubecSpinDelay } from '../lubecCircles'
import { lubecMotionAllowed } from '../useLubecCircles'
import { LubecDiceContext } from '../useLubecRoller'

/** A part's d100: the result, and while it spins the number it shows instead. */
export type LubecAllocationRoll = { id: number; result: number; preview: number | null }

type LubecAllocationState = {
  /** The Defense lines, in order. */
  positions: number[]
  mode: LubecAllocationMode
  /** Each rolled part's roll, by its index. */
  rolls: Record<number, LubecAllocationRoll>
  /** The Handle the bar divided when it was last drawn: the rolls stand only while it is the same. */
  handle: number
}

const empty = (handle: number): LubecAllocationState => ({ positions: [], mode: null, rolls: {}, handle })

// A spinning number is only for show; the roll itself is made on the click.
const randomPreview = (): number => Math.floor(Math.random() * 100) + 1

// Any change to the lines undoes the rolls, as the prototype's does.
const withLines = (state: LubecAllocationState, positions: number[]): LubecAllocationState =>
  ({ ...state, positions, rolls: {} })

// The spin's next number, or, with null, its landing; nothing once the roll has been undone.
function withSpin(state: LubecAllocationState, index: number, id: number, preview: number | null): LubecAllocationState {
  const roll = state.rolls[index]
  return roll?.id === id ? { ...state, rolls: { ...state.rolls, [index]: { ...roll, preview } } } : state
}

export type LubecFightAllocation = {
  positions: readonly number[]
  mode: LubecAllocationMode
  /** The rolls that stand on the bar as it is now. */
  rolls: Readonly<Record<number, LubecAllocationRoll>>
  /** Turns a tool on, or off when it is already on. */
  toggleMode: (mode: Exclude<LubecAllocationMode, null>) => void
  place: (position: number) => void
  remove: (index: number) => void
  move: (index: number, position: number) => void
  roll: (index: number) => void
  reset: () => void
}

/**
 * The Fight bar's lines, tools and rolls for the Handle it divides. The lines
 * are kept when the Handle changes, but a line past it is left off the bar
 * and the rolls made on the old bar no longer stand.
 */
export function useLubecFightAllocation(handle: number): LubecFightAllocation {
  const dice = useContext(LubecDiceContext)
  const [state, setState] = useState<LubecAllocationState>(() => empty(handle))
  // A new Handle redraws the bar, so the rolls made on the old one are dropped.
  if (state.handle !== handle) setState({ ...state, rolls: {}, handle })
  const nextId = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])

  // The prototype's slowing spin, a new number each step, then the result.
  const spin = (index: number, id: number, step: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      const landing = step + 1 >= LUBEC_SPIN_STEPS
      setState((current) => withSpin(current, index, id, landing ? null : randomPreview()))
      if (!landing) spin(index, id, step + 1)
    }, lubecSpinDelay(step))
    timers.current.add(timer)
  }

  return {
    positions: state.positions,
    mode: state.mode,
    rolls: state.rolls,
    toggleMode: (mode) => setState((current) => ({ ...current, mode: current.mode === mode ? null : mode })),
    place: (position) => setState((current) => withLines(current, withLubecLinePlaced(current.positions, position))),
    remove: (index) => setState((current) => withLines(current, withLubecLineRemoved(current.positions, index))),
    move: (index, position) => setState((current) => withLines(current, withLubecLineMoved(current.positions, index, position, handle))),
    roll: (index) => {
      nextId.current += 1
      const id = nextId.current
      const spins = lubecMotionAllowed()
      const roll = { id, result: rollLubecDie(100, dice), preview: spins ? randomPreview() : null }
      setState((current) => ({ ...current, rolls: { ...current.rolls, [index]: roll } }))
      if (spins) spin(index, id, 0)
    },
    reset: () => setState(empty(handle)),
  }
}
