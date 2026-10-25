import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { describeLubecPanicChange, lubecPanicResultRow, readLubecPanicRoll, type LubecPanicRoll } from '../ruleSets/lubec/panicRoll'
import type { LubecPanicRow } from '../ruleSets/lubec/panicTable'
import { lubecLowestSave } from '../ruleSets/lubec/recoveryRoll'
import { lubecTallyFace, type LubecCircleState } from './lubecCircles'
import { LubecRollCircle } from './LubecRollCircle'
import type { LubecCircles } from './useLubecCircles'
import type { LubecRoller } from './useLubecRoller'

type RollsProps = { sheet: LubecCharacterSheet; roller: LubecRoller | null; circles: LubecCircles }

// Neither circle takes an armed skill; both show their last result until it is clicked away.
const tallyState = (circles: LubecCircles, name: 'Panic' | 'Recovery'): LubecCircleState =>
  ({ armed: null, result: circles.result(name), spin: circles.spin })

// The Panic Check needs only Stress, so it can always be rolled.
function LubecPanicAbility({ sheet, roller, circles }: RollsProps) {
  const labels = { name: 'Panic Check', missing: 'Panic Check: missing value', value: (value: number) => `Panic Check over Stress ${value}` }
  return (
    <div className="ability">
      <LubecRollCircle name="Panic" labels={labels} face={lubecTallyFace('Panic', sheet.counters.stress, tallyState(circles, 'Panic'))} roller={roller} circles={circles} />
      <span className="ability-name">Panic Check</span>
      <span className="base-note">D20 over Stress</span>
    </div>
  )
}

// The Recovery Save needs the lowest Save, so it cannot be rolled while any Save is a hole.
function LubecRecoveryAbility({ sheet, roller, circles }: RollsProps) {
  const lowest = lubecLowestSave(sheet)
  const labels = {
    name: 'Recovery Save',
    missing: 'Recovery Save: missing value',
    value: (value: number) => `Recovery Save on ${lowest?.name} at or under ${value}`,
  }
  return (
    <div className="ability">
      <LubecRollCircle name="Recovery" labels={labels} face={lubecTallyFace('Recovery', lowest?.value ?? null, tallyState(circles, 'Recovery'))} roller={roller} circles={circles} />
      <span className="ability-name">Recovery Save</span>
      <span className="base-note">{lowest ? `on ${lowest.name}` : ''}</span>
    </div>
  )
}

function LubecPanicAdd({ roll, roller }: { roll: LubecPanicRoll; roller: LubecRoller | null }) {
  if (roll.effectRolls !== null) return <p className="skill-strip-hint">Added to active effects.</p>
  if (!roller) return null
  return <button type="button" className="action-button lubec-panic-add" onClick={roller.addPanicEffect}>Add effect</button>
}

// The row's own Stress and Minimum Stress changes, each with what its dice rolled once "Add effect" has rolled them.
function LubecPanicChanges({ row, roll }: { row: LubecPanicRow; roll: LubecPanicRoll }) {
  if (row.changes.length === 0) return null
  return (
    <ul className="lubec-panic-changes">
      {row.changes.map((change, index) => (
        <li key={index} className="modifier skill-modifier">{describeLubecPanicChange(change, roll.effectRolls?.[index] ?? null)}</li>
      ))}
    </ul>
  )
}

/** A failed Panic Check's row as the class cards' modifier bars, its changes and "Add effect"; nothing after any other roll. */
function LubecPanicResult({ sheet, roller }: Omit<RollsProps, 'circles'>) {
  const roll = readLubecPanicRoll(sheet.lastRoll)
  const row = roll ? lubecPanicResultRow(roll) : null
  if (!roll || !row) return null
  return (
    <div className="modifier-list lubec-panic-result" role="group" aria-label="Panic result">
      <p className="modifier lubec-panic-row"><b>{String(row.roll).padStart(2, '0')}</b> {row.name}</p>
      <p className="modifier skill-modifier">{row.text}</p>
      <LubecPanicChanges row={row} roll={roll} />
      <LubecPanicAdd roll={roll} roller={roller} />
    </div>
  )
}

/**
 * The Panic Check and the Recovery Save, set a little apart below the Saves as
 * a section of their own: a roll circle each, as the Stats and Saves have, and a
 * failed Panic Check's row under them.
 */
export function LubecPanicSection({ sheet, roller, circles }: RollsProps) {
  return (
    <section className="ability-section" aria-labelledby="lubec-panic-title">
      <div className="section-heading">
        <h3 id="lubec-panic-title">Panic</h3>
        <span className="dice-formula">&amp; Recovery</span>
      </div>
      <div className="lubec-panic-body">
        <div className="ability-grid lubec-panic-grid" role="group" aria-label="Panic and Recovery">
          <LubecPanicAbility sheet={sheet} roller={roller} circles={circles} />
          <LubecRecoveryAbility sheet={sheet} roller={roller} circles={circles} />
        </div>
        <LubecPanicResult sheet={sheet} roller={roller} />
      </div>
    </section>
  )
}
