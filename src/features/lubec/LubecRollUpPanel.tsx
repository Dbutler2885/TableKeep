import { useContext } from 'react'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import type { LubecDice } from '../ruleSets/lubec/dice'
import type { LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import {
  lubecRolledDice,
  lubecRollUpStage,
  readLubecRollUp,
  withLubecScoresKept,
  withLubecSwap,
  withLubecValueRolled,
  type LubecRollUp,
  type LubecRollUpStage,
  type LubecSwap,
  type LubecValueDice,
} from '../ruleSets/lubec/guidedRollUp'
import { LUBEC_SAVE_FLAT } from '../ruleSets/lubec/rollUp'
import { LUBEC_VALUE_NAMES, type LubecValueName } from '../ruleSets/lubec/sheet'
import { LubecSwapTray } from './LubecSwapTray'
import { LubecDiceContext } from './useLubecRoller'

const STAGE_HINTS: Readonly<Record<LubecRollUpStage, string>> = {
  rolling: 'Roll each Stat and Save. Every die is saved the moment it lands, and nothing is rolled twice.',
  deciding: 'Keep these scores, or Swap your lowest Stat with any Stat but your highest.',
  settled: 'Now choose a class, then your skills on the Skills page, then Finalize.',
}

/** A value's dice as they landed, with what they add up to. */
function diceText(dice: LubecValueDice): string {
  if ('tens' in dice) return `${dice.tens} + ${dice.d10} = ${dice.tens + dice.d10}`
  return `${LUBEC_SAVE_FLAT} + ${dice[0]} + ${dice[1]} = ${LUBEC_SAVE_FLAT + dice[0] + dice[1]}`
}

type RowProps = { name: LubecValueName; rollUp: LubecRollUp; onRoll: ((name: LubecValueName) => void) | null }

// A rolled value shows its dice and nothing else: there is no re-roll.
function LubecRollUpResult({ name, rollUp, onRoll }: RowProps) {
  const dice = lubecRolledDice(rollUp, name)
  if (dice) return <span className="lubec-roll-up-dice">{diceText(dice)}</span>
  if (!onRoll) return <span className="lubec-roll-up-waiting">not rolled yet</span>
  return <button type="button" className="lubec-roll-up-roll" aria-label={`Roll ${name}`} onClick={() => onRoll(name)}>Roll</button>
}

type RollUpActions = { roll: (name: LubecValueName) => void; swap: (swap: LubecSwap) => void; keep: () => void }

type RollUpEdits = {
  /** Saves each die and a confirmed Swap at once; null for a viewer who may only look. */
  onRollUp: LubecSheetEdit | null
  /** Saves keeping the scores; null for a viewer who may only look. */
  onDraftEdit: LubecSheetEdit | null
}

// A roll or a Swap the rules refuse writes nothing.
const saveIfAllowed = (onRollUp: LubecSheetEdit, changes: Partial<LubecCharacterSheet> | null) => {
  if (changes) onRollUp(changes)
}

// What the owner or the GM can do to the roll-up; null for anyone else.
function rollUpActionsFor(sheet: LubecCharacterSheet, dice: LubecDice, { onRollUp, onDraftEdit }: RollUpEdits): RollUpActions | null {
  if (!onRollUp || !onDraftEdit) return null
  return {
    roll: (name) => saveIfAllowed(onRollUp, withLubecValueRolled(sheet, name, dice)),
    swap: (choice) => saveIfAllowed(onRollUp, withLubecSwap(sheet, choice)),
    keep: () => onDraftEdit(withLubecScoresKept(sheet)),
  }
}

type DecisionProps = { sheet: LubecCharacterSheet; rollUp: LubecRollUp; actions: RollUpActions | null }

// The Swap made or the scores kept; while neither is, the owner and the GM decide.
function LubecRollUpDecision({ sheet, rollUp, actions }: DecisionProps) {
  if (rollUp.swap) return <p className="lubec-roll-up-decision">Swapped {rollUp.swap.lowest} and {rollUp.swap.other}.</p>
  if (rollUp.kept) return <p className="lubec-roll-up-decision">Scores kept as rolled.</p>
  if (!actions || lubecRollUpStage(rollUp) !== 'deciding') return null
  return <LubecSwapTray sheet={sheet} onSwap={actions.swap} onKeep={actions.keep} />
}

/**
 * Guided roll-up on a draft: every die each value was rolled with, a Roll
 * button for each value not rolled yet, then keeping the scores or the Swap.
 * Anyone who can see the draft sees every roll.
 */
export function LubecRollUpPanel({ sheet, ...edits }: RollUpEdits & { sheet: LubecCharacterSheet }) {
  const dice = useContext(LubecDiceContext)
  const rollUp = readLubecRollUp(sheet.rollUp)
  const actions = rollUpActionsFor(sheet, dice, edits)
  return (
    <section className="lubec-panel rust lubec-roll-up" aria-labelledby="lubec-panel-roll-up">
      <div className="lubec-section-head"><h3 id="lubec-panel-roll-up">Roll-up</h3></div>
      {actions ? <p className="lubec-roll-up-hint">{STAGE_HINTS[lubecRollUpStage(rollUp)]}</p> : null}
      <ul className="lubec-roll-up-list" aria-label="Dice rolled">
        {LUBEC_VALUE_NAMES.map((name) => (
          <li key={name}>
            <span className="lubec-roll-up-name">{name}</span>
            <LubecRollUpResult name={name} rollUp={rollUp} onRoll={actions && actions.roll} />
          </li>
        ))}
      </ul>
      <LubecRollUpDecision sheet={sheet} rollUp={rollUp} actions={actions} />
    </section>
  )
}
