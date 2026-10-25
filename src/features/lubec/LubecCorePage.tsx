import type { ReactNode } from 'react'
import { lubecCheckTarget } from '../ruleSets/lubec/checkRoll'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { lubecCurrentValue, lubecFinalValue, type LubecModifier } from '../ruleSets/lubec/derivations'
import { withLubecBaseValue, type LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import { lubecActiveModifiers, type LubecEffect } from '../ruleSets/lubec/effects'
import { LUBEC_SAVES, LUBEC_STATS, type LubecSheet, type LubecValueName } from '../ruleSets/lubec/sheet'
import { LubecBaseInput } from './LubecBaseInput'
import { LubecClassPanel } from './LubecClassPanel'
import { LubecClassPicker } from './LubecClassPicker'
import { LubecCountersPanel, type LubecCountersChange } from './LubecCountersPanel'
import { LubecEffectsPanel } from './LubecEffectsPanel'
import { LubecFightPanel } from './LubecFightPanel'
import { LubecMissing, LubecNumber } from './LubecMissing'
import { LubecSaveRolls } from './LubecPanicRolls'
import { LubecRollPanel } from './LubecRollPanel'
import { useLubecRoller, type LubecRolled, type LubecRoller } from './useLubecRoller'

/**
 * The values, how to type into a draft's base values and how to roll on them;
 * `onDraftEdit` is null when they cannot be typed into, and `roller` when they cannot be rolled.
 */
type ValuesProps = {
  sheet: LubecCharacterSheet
  modifiers: readonly LubecModifier[]
  onDraftEdit: LubecSheetEdit | null
  roller: LubecRoller | null
}

type ValuesPanelProps = ValuesProps & {
  title: string
  column: string
  tone: 'rust' | 'blue'
  names: readonly LubecValueName[]
  /** Shown below the table, set apart from the values. */
  footer?: ReactNode
}

type BaseCellProps = { name: LubecValueName; sheet: LubecSheet; onDraftEdit: LubecSheetEdit | null }

function LubecBaseCell({ name, sheet, onDraftEdit }: BaseCellProps) {
  if (!onDraftEdit) return <LubecNumber value={sheet.base[name]} />
  return <LubecBaseInput label={`${name} base`} value={sheet.base[name]} onChange={(value) => onDraftEdit(withLubecBaseValue(sheet, name, value))} />
}

type CurrentProps = { name: LubecValueName; sheet: LubecCharacterSheet; current: number | null; roller: LubecRoller }

// The current value is the roll button. A hole cannot be rolled under, so its button is disabled.
function LubecRollButton({ name, sheet, current, roller }: CurrentProps) {
  if (current === null) {
    return (
      <button type="button" className="lubec-roll-value" disabled title="missing value" aria-label={`Roll ${name}: missing value`}>
        <LubecMissing />
      </button>
    )
  }
  const target = lubecCheckTarget(sheet, name, roller.armed)
  return (
    <button type="button" className="lubec-roll-value" aria-label={`Roll ${name} at or under ${target}`} onClick={() => roller.roll(name)}>
      {current}
    </button>
  )
}

function LubecValueRow({ name, sheet, modifiers, onDraftEdit, roller }: ValuesProps & { name: LubecValueName }) {
  const current = lubecCurrentValue(sheet, name, modifiers)
  return (
    <tr>
      <th scope="row">{name}</th>
      <td><LubecBaseCell name={name} sheet={sheet} onDraftEdit={onDraftEdit} /></td>
      <td><LubecNumber value={lubecFinalValue(sheet, name)} /></td>
      <td className="lubec-current">
        {roller ? <LubecRollButton name={name} sheet={sheet} current={current} roller={roller} /> : <LubecNumber value={current} />}
      </td>
    </tr>
  )
}

function LubecValuesPanel({ title, column, tone, names, footer, ...values }: ValuesPanelProps) {
  return (
    <section className={`lubec-panel ${tone}`} aria-labelledby={`lubec-panel-${column}`}>
      <div className="lubec-section-head"><h3 id={`lubec-panel-${column}`}>{title}</h3></div>
      <table className="lubec-values">
        <thead>
          <tr>
            <th scope="col">{column}</th>
            <th scope="col">Base</th>
            <th scope="col">Final</th>
            <th scope="col">Current</th>
          </tr>
        </thead>
        <tbody>
          {names.map((name) => <LubecValueRow key={name} name={name} {...values} />)}
        </tbody>
      </table>
      {footer}
    </section>
  )
}

type CorePageProps = {
  sheet: LubecCharacterSheet
  /** Absent for a viewer who may not change the character. */
  onCountersChange: LubecCountersChange | null
  /** Absent for a viewer who may not change the character. */
  onEffectsChange: ((effects: LubecEffect[]) => void) | null
  /** Changes a draft's base values, class and class choice; absent unless the viewer may type into the draft. */
  onDraftEdit?: LubecSheetEdit | null
  /** Absent for a viewer who may not roll on the character. */
  onRolled: LubecRolled | null
}

/**
 * The Core page: the five Stats and three Saves with their base, final and
 * current values, each current value rolled under with a tap, the Panic Check
 * and the Recovery Save below the Saves, the roller and the last roll, the counters, the active effects that change the values, the
 * class's reminders and the reserved Fight panel. While a draft can be typed
 * into, its base values and its class and choice are fields, and each final
 * value follows as it is typed.
 */
export function LubecCorePage({ sheet, onCountersChange, onEffectsChange, onDraftEdit = null, onRolled }: CorePageProps) {
  const modifiers = lubecActiveModifiers(sheet.effects)
  const roller = useLubecRoller(sheet, onRolled)
  const values = { sheet, modifiers, onDraftEdit, roller }
  return (
    <div className="lubec-page lubec-core">
      {onDraftEdit ? <LubecClassPicker sheet={sheet} onEdit={onDraftEdit} /> : null}
      <LubecValuesPanel title="Stats" column="Stat" tone="rust" names={LUBEC_STATS} {...values} />
      <LubecValuesPanel
        title="Saves"
        column="Save"
        tone="blue"
        names={LUBEC_SAVES}
        footer={roller ? <LubecSaveRolls sheet={sheet} roller={roller} /> : null}
        {...values}
      />
      <LubecRollPanel sheet={sheet} roller={roller} />
      <LubecCountersPanel sheet={sheet} onChange={onCountersChange} />
      <LubecEffectsPanel effects={sheet.effects} onChange={onEffectsChange} />
      <LubecClassPanel sheet={sheet} />
      <LubecFightPanel sheet={sheet} modifiers={modifiers} />
    </div>
  )
}
