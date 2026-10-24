import { lubecCurrentValue, lubecFinalValue } from '../ruleSets/lubec/derivations'
import { LUBEC_SAVES, LUBEC_STATS, type LubecSheet, type LubecValueName } from '../ruleSets/lubec/sheet'
import { LubecNumber } from './LubecMissing'

type ValuesPanelProps = {
  title: string
  column: string
  tone: 'rust' | 'blue'
  names: readonly LubecValueName[]
  sheet: LubecSheet
}

// Until active effects exist, a current value is its final value.
function LubecValueRow({ name, sheet }: { name: LubecValueName; sheet: LubecSheet }) {
  return (
    <tr>
      <th scope="row">{name}</th>
      <td><LubecNumber value={sheet.base[name]} /></td>
      <td><LubecNumber value={lubecFinalValue(sheet, name)} /></td>
      <td className="lubec-current"><LubecNumber value={lubecCurrentValue(sheet, name, [])} /></td>
    </tr>
  )
}

function LubecValuesPanel({ title, column, tone, names, sheet }: ValuesPanelProps) {
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
          {names.map((name) => <LubecValueRow key={name} name={name} sheet={sheet} />)}
        </tbody>
      </table>
    </section>
  )
}

/** The Core page: the five Stats and three Saves with their base, final and current values. */
export function LubecCorePage({ sheet }: { sheet: LubecSheet }) {
  return (
    <div className="lubec-page lubec-core">
      <LubecValuesPanel title="Stats" column="Stat" tone="rust" names={LUBEC_STATS} sheet={sheet} />
      <LubecValuesPanel title="Saves" column="Save" tone="blue" names={LUBEC_SAVES} sheet={sheet} />
    </div>
  )
}
