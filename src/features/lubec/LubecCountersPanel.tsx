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
  /** True while a roll spins, when the counters show what they were before it and cannot be changed. */
  held: boolean
}

// The prototype's record cell, its label over the count, with the decision tray's square buttons either side of the count.
function LubecCounter({ name, label, counters, onChange, held }: CounterProps) {
  const step = (by: 1 | -1) => {
    const next = stepLubecCounter(counters, name, by)
    if (next && onChange) onChange(next)
  }
  return (
    <div className="record-value lubec-counter" role="group" aria-labelledby={`lubec-counter-${name}`}>
      <span id={`lubec-counter-${name}`}>{label}</span>
      <div className="lubec-counter-row">
        {onChange ? (
          <button type="button" className="secondary-button tray-icon" aria-label={`Lower ${label}`} disabled={held || counters[name] === 0} onClick={() => step(-1)}>
            &minus;
          </button>
        ) : null}
        <strong className="lubec-counter-value">{counters[name]}</strong>
        {onChange ? (
          <button type="button" className="secondary-button tray-icon" aria-label={`Raise ${label}`} disabled={held} onClick={() => step(1)}>
            +
          </button>
        ) : null}
      </div>
    </div>
  )
}

type PanelProps = { sheet: LubecCharacterSheet; onChange: LubecCountersChange | null; held?: boolean }

/**
 * Stress, Minimum Stress and Trauma as a section of the Core page, with the
 * Death Save reminder as the prototype's rust Class Rule block once Trauma
 * reaches the class's threshold.
 */
export function LubecCountersPanel({ sheet, onChange, held = false }: PanelProps) {
  const { counters } = sheet
  return (
    <section className="ability-section" aria-labelledby="lubec-counters-title">
      <div className="section-heading">
        <h3 id="lubec-counters-title">Stress</h3>
        <span className="dice-formula">&amp; Trauma</span>
      </div>
      <div className="lubec-counters-body">
        <div className="lubec-counters">
          {LUBEC_COUNTERS.map(([name, label]) => (
            <LubecCounter key={name} name={name} label={label} counters={counters} onChange={onChange} held={held} />
          ))}
        </div>
        {isLubecDeathSaveDue(sheet, counters.trauma) ? (
          <div className="selected-class-rule lubec-death-save">
            <span>Death Save</span>
            <p>Trauma has reached {lubecDeathSaveTrauma(sheet)}.</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
