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
import { LubecNumber } from './LubecMissing'

/** The values, and how to type into a draft's base values; `onDraftEdit` is null when they cannot be typed into. */
type ValuesProps = { sheet: LubecSheet; modifiers: readonly LubecModifier[]; onDraftEdit: LubecSheetEdit | null }

type ValuesPanelProps = ValuesProps & {
  title: string
  column: string
  tone: 'rust' | 'blue'
  names: readonly LubecValueName[]
}

type BaseCellProps = { name: LubecValueName; sheet: LubecSheet; onDraftEdit: LubecSheetEdit | null }

function LubecBaseCell({ name, sheet, onDraftEdit }: BaseCellProps) {
  if (!onDraftEdit) return <LubecNumber value={sheet.base[name]} />
  return <LubecBaseInput label={`${name} base`} value={sheet.base[name]} onChange={(value) => onDraftEdit(withLubecBaseValue(sheet, name, value))} />
}

function LubecValueRow({ name, sheet, modifiers, onDraftEdit }: ValuesProps & { name: LubecValueName }) {
  return (
    <tr>
      <th scope="row">{name}</th>
      <td><LubecBaseCell name={name} sheet={sheet} onDraftEdit={onDraftEdit} /></td>
      <td><LubecNumber value={lubecFinalValue(sheet, name)} /></td>
      <td className="lubec-current"><LubecNumber value={lubecCurrentValue(sheet, name, modifiers)} /></td>
    </tr>
  )
}

function LubecValuesPanel({ title, column, tone, names, ...values }: ValuesPanelProps) {
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
}

/**
 * The Core page: the five Stats and three Saves with their base, final and
 * current values, the counters, the active effects that change the values,
 * the class's reminders and the reserved Fight panel. While a draft can be
 * typed into, its base values and its class and choice are fields, and each
 * final value follows as it is typed.
 */
export function LubecCorePage({ sheet, onCountersChange, onEffectsChange, onDraftEdit = null }: CorePageProps) {
  const modifiers = lubecActiveModifiers(sheet.effects)
  return (
    <div className="lubec-page lubec-core">
      {onDraftEdit ? <LubecClassPicker sheet={sheet} onEdit={onDraftEdit} /> : null}
      <LubecValuesPanel title="Stats" column="Stat" tone="rust" names={LUBEC_STATS} sheet={sheet} modifiers={modifiers} onDraftEdit={onDraftEdit} />
      <LubecValuesPanel title="Saves" column="Save" tone="blue" names={LUBEC_SAVES} sheet={sheet} modifiers={modifiers} onDraftEdit={onDraftEdit} />
      <LubecCountersPanel sheet={sheet} onChange={onCountersChange} />
      <LubecEffectsPanel effects={sheet.effects} onChange={onEffectsChange} />
      <LubecClassPanel sheet={sheet} />
      <LubecFightPanel sheet={sheet} modifiers={modifiers} />
    </div>
  )
}
