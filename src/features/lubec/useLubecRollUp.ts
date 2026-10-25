import { useContext, useEffect, useState } from 'react'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import type { LubecDice } from '../ruleSets/lubec/dice'
import type { LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import {
  lubecRollUpStage,
  readLubecRollUp,
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
  type LubecGenerateSpin,
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
  startSwap: () => void
  cancelSwap: () => void
  undoSwap: () => void
  confirmSwap: () => void
  keep: () => void
}

export type LubecRollUpView = {
  stage: LubecRollUpStage
  /** While a value's dice spin, nothing else is offered. */
  spinning: boolean
  swap: LubecSwapDraft | null
  canSwap: boolean
  status: string
  circle: (name: LubecValueName) => LubecRollUpCircle
  /** Null for a viewer who may only look. */
  actions: LubecRollUpActions | null
}

// The prototype's landed bounce lasts this long before the circle settles.
const LANDED_MS = 500

// The prototype's rollGeneration spin: a slowing run of numbers, then the circle lands.
function useGenerateSpin() {
  const [spin, setSpin] = useState<LubecGenerateSpin | null>(null)
  const [landed, setLanded] = useState<LubecValueName | null>(null)
  useEffect(() => {
    if (!spin) return
    const timer = setTimeout(() => {
      const step = spin.step + 1
      if (step < LUBEC_SPIN_STEPS) return setSpin({ name: spin.name, step, preview: lubecGeneratePreview(spin.name) })
      setSpin(null)
      setLanded(spin.name)
    }, lubecSpinDelay(spin.step))
    return () => clearTimeout(timer)
  }, [spin])
  useEffect(() => {
    if (!landed) return
    const timer = setTimeout(() => setLanded(null), LANDED_MS)
    return () => clearTimeout(timer)
  }, [landed])
  const start = (name: LubecValueName) => {
    if (lubecMotionAllowed()) setSpin({ name, step: 0, preview: lubecGeneratePreview(name) })
  }
  return { spin, landed, start }
}

type ActionRequest = {
  sheet: LubecCharacterSheet
  dice: LubecDice
  swap: LubecSwapDraft | null
  setSwap: (swap: LubecSwapDraft | null) => void
  /** Called with each value as its dice are rolled and saved. */
  rolled: (name: LubecValueName) => void
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
  rolled(name)
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
 * circle and saved at once, then the Swap made on the Stats' circles and saved
 * only when confirmed, with the status line saying what happened. Null when
 * the sheet shows no roll-up.
 */
export function useLubecRollUp(sheet: LubecCharacterSheet, edits: LubecRollUpEdits | null): LubecRollUpView | null {
  const dice = useContext(LubecDiceContext)
  const [pending, setSwap] = useState<LubecSwapDraft | null>(null)
  const [generated, setGenerated] = useState<LubecValueName | null>(null)
  const spinner = useGenerateSpin()
  if (!edits) return null
  const stage = lubecRollUpStage(readLubecRollUp(sheet.rollUp))
  // A Swap is only made while the scores are being decided, whoever settles them.
  const swap = stage === 'deciding' ? pending : null
  const rolled = (name: LubecValueName) => {
    setGenerated(name)
    spinner.start(name)
  }
  const actions = rollUpActions({ sheet, dice, swap, setSwap, rolled }, edits)
  const state = { sheet, swap, spin: spinner.spin, landed: spinner.landed, canAct: actions !== null }
  return {
    stage,
    spinning: spinner.spin !== null,
    swap,
    canSwap: lubecCanSwap(sheet),
    status: lubecRollUpStatus({ sheet, swap, spin: spinner.spin, generated }),
    circle: (name) => lubecRollUpCircle(state, name),
    actions,
  }
}
