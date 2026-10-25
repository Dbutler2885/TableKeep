import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { describeLubecPanicChange, lubecPanicResultRow, readLubecPanicRoll, type LubecPanicRoll } from '../ruleSets/lubec/panicRoll'
import type { LubecPanicRow } from '../ruleSets/lubec/panicTable'
import { lubecLowestSave } from '../ruleSets/lubec/recoveryRoll'
import { LubecMissing } from './LubecMissing'
import type { LubecRoller } from './useLubecRoller'

type RollsProps = { sheet: LubecCharacterSheet; roller: LubecRoller }

// The Recovery Save needs the lowest Save, so it cannot be rolled while any Save is a hole.
function LubecRecoveryButton({ sheet, roller }: RollsProps) {
  const lowest = lubecLowestSave(sheet)
  if (!lowest) {
    return (
      <button type="button" className="lubec-save-roll" disabled title="missing value" aria-label="Recovery Save: missing value">
        Recovery Save <small><LubecMissing /></small>
      </button>
    )
  }
  return (
    <button type="button" className="lubec-save-roll" aria-label={`Recovery Save on ${lowest.name} at or under ${lowest.value}`} onClick={roller.recover}>
      Recovery Save <small>{lowest.name} {lowest.value}</small>
    </button>
  )
}

/** The Panic Check and the Recovery Save, set a little apart below the Saves. The Panic Check needs only Stress, so it always works. */
export function LubecSaveRolls({ sheet, roller }: RollsProps) {
  const { stress } = sheet.counters
  return (
    <div className="lubec-save-rolls" role="group" aria-label="Panic and Recovery">
      <button type="button" className="lubec-save-roll" aria-label={`Panic Check over Stress ${stress}`} onClick={roller.panic}>
        Panic Check <small>over {stress}</small>
      </button>
      <LubecRecoveryButton sheet={sheet} roller={roller} />
    </div>
  )
}

function LubecPanicAdd({ roll, roller }: { roll: LubecPanicRoll; roller: LubecRoller | null }) {
  if (roll.effectRolls !== null) return <p className="lubec-panic-added">Added to active effects.</p>
  if (!roller) return null
  return <button type="button" className="lubec-panic-add" onClick={roller.addPanicEffect}>Add effect</button>
}

// The row's own Stress and Minimum Stress changes, each with what its dice rolled once "Add effect" has rolled them.
function LubecPanicChanges({ row, roll }: { row: LubecPanicRow; roll: LubecPanicRoll }) {
  if (row.changes.length === 0) return null
  return (
    <ul className="lubec-panic-changes">
      {row.changes.map((change, index) => <li key={index}>{describeLubecPanicChange(change, roll.effectRolls?.[index] ?? null)}</li>)}
    </ul>
  )
}

/** A failed Panic Check's row, its changes and "Add effect"; nothing after any other roll. */
export function LubecPanicResult({ sheet, roller }: { sheet: LubecCharacterSheet; roller: LubecRoller | null }) {
  const roll = readLubecPanicRoll(sheet.lastRoll)
  const row = roll ? lubecPanicResultRow(roll) : null
  if (!roll || !row) return null
  return (
    <div className="lubec-panic-result" role="group" aria-label="Panic result">
      <p className="lubec-panic-row"><b>{String(row.roll).padStart(2, '0')}</b> {row.name}</p>
      <p className="lubec-panic-text">{row.text}</p>
      <LubecPanicChanges row={row} roll={roll} />
      <LubecPanicAdd roll={roll} roller={roller} />
    </div>
  )
}
