import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { lubecCurrentValue, lubecFinalValue, type LubecModifier } from '../ruleSets/lubec/derivations'
import { lubecActiveModifiers, type LubecEffect } from '../ruleSets/lubec/effects'
import { LUBEC_SAVES, LUBEC_STATS, type LubecSheet, type LubecValueName } from '../ruleSets/lubec/sheet'
import { LubecClassPanel } from './LubecClassPanel'
import { LubecCountersPanel, type LubecCountersChange } from './LubecCountersPanel'
import { LubecEffectsPanel } from './LubecEffectsPanel'
import { LubecFightPanel } from './LubecFightPanel'
import { LubecNumber } from './LubecMissing'

type ValuesPanelProps = {
  title: string
  column: string
  tone: 'rust' | 'blue'
  names: readonly LubecValueName[]
  sheet: LubecSheet
  modifiers: readonly LubecModifier[]
}

type ValueRowProps = { name: LubecValueName; sheet: LubecSheet; modifiers: readonly LubecModifier[] }

function LubecValueRow({ name, sheet, modifiers }: ValueRowProps) {
  return (
    <tr>
      <th scope="row">{name}</th>
      <td><LubecNumber value={sheet.base[name]} /></td>
      <td><LubecNumber value={lubecFinalValue(sheet, name)} /></td>
      <td className="lubec-current"><LubecNumber value={lubecCurrentValue(sheet, name, modifiers)} /></td>
    </tr>
  )
}

function LubecValuesPanel({ title, column, tone, names, sheet, modifiers }: ValuesPanelProps) {
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
          {names.map((name) => <LubecValueRow key={name} name={name} sheet={sheet} modifiers={modifiers} />)}
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
}

/**
 * The Core page: the five Stats and three Saves with their base, final and
 * current values, the counters, the active effects that change the values,
 * the class's reminders and the reserved Fight panel.
 */
export function LubecCorePage({ sheet, onCountersChange, onEffectsChange }: CorePageProps) {
  const modifiers = lubecActiveModifiers(sheet.effects)
  return (
    <div className="lubec-page lubec-core">
      <LubecValuesPanel title="Stats" column="Stat" tone="rust" names={LUBEC_STATS} sheet={sheet} modifiers={modifiers} />
      <LubecValuesPanel title="Saves" column="Save" tone="blue" names={LUBEC_SAVES} sheet={sheet} modifiers={modifiers} />
      <LubecCountersPanel sheet={sheet} onChange={onCountersChange} />
      <LubecEffectsPanel effects={sheet.effects} onChange={onEffectsChange} />
      <LubecClassPanel sheet={sheet} />
      <LubecFightPanel sheet={sheet} modifiers={modifiers} />
    </div>
  )
}
