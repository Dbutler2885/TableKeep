import { useContext, useEffect, useEffectEvent, useState } from 'react'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import type { LubecDice } from '../ruleSets/lubec/dice'
import type { LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import {
  lubecRollUpStage,
  readLubecRollUp,
  lubecUnrolledValues,
  withLubecRemainingRolled,
  withLubecScoresKept,
  withLubecSwap,
  withLubecValueRolled,
  type LubecRollUpStage,
} from '../ruleSets/lubec/guidedRollUp'
import type { LubecValueName } from '../ruleSets/lubec/sheet'
import { LUBEC_SPIN_STEPS, lubecSpinDelay } from './lubecCircles'
import {
  lubecCanSwap,
  lubecGeneratePreview,
  lubecRollUpCircle,
  lubecRollUpStatus,
  lubecStartSwap,
  lubecSwapTapped,
  type LubecGenerateSpins,
  type LubecRollUpCircle,
  type LubecSwapDraft,
} from './lubecRollUpCircles'
import { lubecMotionAllowed } from './useLubecCircles'
import { LubecDiceContext } from './useLubecRoller'

/** How a guided draft's roll-up is saved: each die and a confirmed Swap at once, and keeping the scores; null for a viewer who may only look. */
export type LubecRollUpEdits = { onRollUp: LubecSheetEdit | null; onDraftEdit: LubecSheetEdit | null }

/** What the owner or the GM can do on the roll-up. */
export type LubecRollUpActions = {
  /** Rolls a value not rolled yet, or picks a Stat for the Swap. */
  tap: (name: LubecValueName) => void
  /** Rolls every value not rolled yet at once. */
  rollAll: () => void
  startSwap: () => void
  cancelSwap: () => void
  undoSwap: () => void
  confirmSwap: () => void
  keep: () => void
}

export type LubecRollUpView = {
  stage: LubecRollUpStage
  /** While any value's dice spin, the Swap is not offered; values left to roll still are. */
  spinning: boolean
  spinner: LubecGenerateSpinner
  swap: LubecSwapDraft | null
  canSwap: boolean
  status: string
  circle: (name: LubecValueName) => LubecRollUpCircle
  /** Null for a viewer who may only look. */
  actions: LubecRollUpActions | null
}

// The prototype's landed bounce lasts this long before the circle settles.
const LANDED_MS = 500

/**
 * The circles spinning and the ones just landed, with each step of a spin and
 * the end of a landing; every circle keeps its own timers, so any number spin at once.
 */
export type LubecGenerateSpinner = {
  spins: LubecGenerateSpins
  landed: readonly LubecValueName[]
  step: (name: LubecValueName) => void
  settle: (name: LubecValueName) => void
}

const without = <Entry>(entries: readonly Entry[], entry: Entry) => entries.filter((other) => other !== entry)

// The prototype's rollGeneration spin, once for each value rolled: a slowing run of numbers, then the circle lands.
function useGenerateSpins() {
  const [spins, setSpins] = useState<LubecGenerateSpins>({})
  const [landed, setLanded] = useState<readonly LubecValueName[]>([])
  const step = (name: LubecValueName) => {
    const spin = spins[name]
    if (!spin) return
    if (spin.step + 1 < LUBEC_SPIN_STEPS) {
      return setSpins((current) => ({ ...current, [name]: { step: spin.step + 1, preview: lubecGeneratePreview(name) } }))
    }
    setSpins((current) => Object.fromEntries(Object.entries(current).filter(([other]) => other !== name)))
    setLanded((current) => [...without(current, name), name])
  }
  const start = (names: readonly LubecValueName[]) => {
    if (!lubecMotionAllowed()) return
    const started = Object.fromEntries(names.map((name) => [name, { step: 0, preview: lubecGeneratePreview(name) }]))
    setSpins((current) => ({ ...current, ...started }))
  }
  const spinner: LubecGenerateSpinner = { spins, landed, step, settle: (name) => setLanded((current) => without(current, name)) }
  return { spinner, start }
}

/** One circle's timers: the next step of its spin once the last number has shown, and the end of its landed bounce. */
export function useLubecGenerateTimers(spinner: LubecGenerateSpinner, name: LubecValueName) {
  const spin = spinner.spins[name]
  const landed = spinner.landed.includes(name)
  const step = useEffectEvent(() => spinner.step(name))
  const settle = useEffectEvent(() => spinner.settle(name))
  useEffect(() => {
    if (!spin) return
    const timer = setTimeout(step, lubecSpinDelay(spin.step))
    return () => clearTimeout(timer)
  }, [spin])
  useEffect(() => {
    if (!landed) return
    const timer = setTimeout(settle, LANDED_MS)
    return () => clearTimeout(timer)
  }, [landed])
}

type ActionRequest = {
  sheet: LubecCharacterSheet
  dice: LubecDice
  swap: LubecSwapDraft | null
  setSwap: (swap: LubecSwapDraft | null) => void
  /** Called with the values whose dice were just rolled and saved. */
  rolled: (names: readonly LubecValueName[]) => void
}

// A roll or a Swap the rules refuse writes nothing.
const saveIfAllowed = (onRollUp: LubecSheetEdit, changes: Partial<LubecCharacterSheet> | null) => {
  if (changes) onRollUp(changes)
}

// Every die is saved the moment it is rolled; the spin after it is only for show.
function rollValue({ sheet, dice, rolled }: ActionRequest, onRollUp: LubecSheetEdit, name: LubecValueName) {
  const changes = withLubecValueRolled(sheet, name, dice)
  if (!changes) return
  onRollUp(changes)
  rolled([name])
}

function rollAll({ sheet, dice, rolled }: ActionRequest, onRollUp: LubecSheetEdit) {
  const names = lubecUnrolledValues(readLubecRollUp(sheet.rollUp))
  const changes = withLubecRemainingRolled(sheet, dice)
  if (!changes) return
  onRollUp(changes)
  rolled(names)
}

function confirmSwap({ sheet, swap, setSwap }: ActionRequest, onRollUp: LubecSheetEdit) {
  if (swap?.stage === 'review') saveIfAllowed(onRollUp, withLubecSwap(sheet, { lowest: swap.source, other: swap.target }))
  setSwap(null)
}

function rollUpActions(request: ActionRequest, { onRollUp, onDraftEdit }: LubecRollUpEdits): LubecRollUpActions | null {
  if (!onRollUp || !onDraftEdit) return null
  const { sheet, swap, setSwap } = request
  return {
    tap: (name) => (swap ? setSwap(lubecSwapTapped(sheet, swap, name)) : rollValue(request, onRollUp, name)),
    rollAll: () => rollAll(request, onRollUp),
    startSwap: () => setSwap(lubecStartSwap(sheet)),
    cancelSwap: () => setSwap(null),
    undoSwap: () => setSwap(swap && { stage: 'select', source: swap.source }),
    confirmSwap: () => confirmSwap(request, onRollUp),
    keep: () => {
      setSwap(null)
      onDraftEdit(withLubecScoresKept(sheet))
    },
  }
}

/**
 * A guided draft's roll-up on the roll circles: each value rolled from its own
 * circle, or every value left at once, and saved at once, then the Swap made on the Stats' circles and saved
 * only when confirmed, with the status line saying what happened. Null when
 * the sheet shows no roll-up.
 */
export function useLubecRollUp(sheet: LubecCharacterSheet, edits: LubecRollUpEdits | null): LubecRollUpView | null {
  const dice = useContext(LubecDiceContext)
  const [pending, setSwap] = useState<LubecSwapDraft | null>(null)
  const [generated, setGenerated] = useState<LubecValueName | null>(null)
  const { spinner, start } = useGenerateSpins()
  if (!edits) return null
  const stage = lubecRollUpStage(readLubecRollUp(sheet.rollUp))
  // A Swap is only made while the scores are being decided, whoever settles them.
  const swap = stage === 'deciding' ? pending : null
  const rolled = (names: readonly LubecValueName[]) => {
    setGenerated(names.at(-1) ?? null)
    start(names)
  }
  const actions = rollUpActions({ sheet, dice, swap, setSwap, rolled }, edits)
  const state = { sheet, swap, spins: spinner.spins, landed: spinner.landed, canAct: actions !== null }
  return {
    stage,
    spinning: Object.keys(spinner.spins).length > 0,
    spinner,
    swap,
    canSwap: lubecCanSwap(sheet),
    status: lubecRollUpStatus({ sheet, swap, spins: spinner.spins, generated }),
    circle: (name) => lubecRollUpCircle(state, name),
    actions,
  }
}
