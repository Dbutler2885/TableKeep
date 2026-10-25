import { Minus, Plus } from 'lucide-react'
import type { LubecCharacterSheet, LubecCounters } from '../ruleSets/lubec/characterRecord'
import { LUBEC_COUNTERS, stepLubecCounter, type LubecCounterName } from '../ruleSets/lubec/counters'
import { isLubecDeathSaveDue, lubecDeathSaveTrauma } from '../ruleSets/lubec/derivations'

/** How the owner or the GM changes the counters; absent for anyone else. */
export type LubecCountersChange = (counters: LubecCounters) => void

type CounterProps = {
  name: LubecCounterName
  label: string
  counters: LubecCounters
  onChange: LubecCountersChange | null
}

function LubecCounter({ name, label, counters, onChange }: CounterProps) {
  const step = (by: 1 | -1) => {
    const next = stepLubecCounter(counters, name, by)
    if (next && onChange) onChange(next)
  }
  return (
    <div className="lubec-counter" role="group" aria-labelledby={`lubec-counter-${name}`}>
      <span className="lubec-counter-name" id={`lubec-counter-${name}`}>{label}</span>
      {onChange ? (
        <button type="button" aria-label={`Lower ${label}`} disabled={counters[name] === 0} onClick={() => step(-1)}>
          <Minus size={16} aria-hidden="true" />
        </button>
      ) : null}
      <span className="lubec-counter-value">{counters[name]}</span>
      {onChange ? (
        <button type="button" aria-label={`Raise ${label}`} onClick={() => step(1)}>
          <Plus size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

/** Stress, Minimum Stress and Trauma, with the Death Save reminder once Trauma reaches the class's threshold. */
export function LubecCountersPanel({ sheet, onChange }: { sheet: LubecCharacterSheet; onChange: LubecCountersChange | null }) {
  const { counters } = sheet
  return (
    <section className="lubec-panel pine" aria-labelledby="lubec-panel-counters">
      <div className="lubec-section-head"><h3 id="lubec-panel-counters">Stress &amp; Trauma</h3></div>
      <div className="lubec-counters">
        {LUBEC_COUNTERS.map(([name, label]) => (
          <LubecCounter key={name} name={name} label={label} counters={counters} onChange={onChange} />
        ))}
      </div>
      {isLubecDeathSaveDue(sheet, counters.trauma) ? (
        <p className="lubec-death-save">Death Save: Trauma has reached {lubecDeathSaveTrauma(sheet)}.</p>
      ) : null}
    </section>
  )
}
