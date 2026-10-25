import { useId } from 'react'
import { LUBEC_CLASSES, lubecClass, type LubecClassChoice } from '../ruleSets/lubec/classes'
import { withLubecClass, withLubecClassChoice, type LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import type { LubecSheet } from '../ruleSets/lubec/sheet'

// An empty pick is stored as a hole, never as a default class or Stat.
const pickOf = (value: string) => (value === '' ? null : value)

type ChoiceProps = { choice: LubecClassChoice; sheet: LubecSheet; onEdit: LubecSheetEdit }

function LubecChoicePicker({ choice, sheet, onEdit }: ChoiceProps) {
  const id = useId()
  return (
    <div className="lubec-pick">
      <label htmlFor={id}>{choice.label}</label>
      <select
        id={id}
        value={sheet.class.choices[choice.field] ?? ''}
        onChange={(event) => onEdit(withLubecClassChoice(sheet, choice.field, pickOf(event.target.value)))}
      >
        <option value="">Choose a Stat</option>
        {choice.options.map((stat) => <option key={stat} value={stat}>{stat}</option>)}
      </select>
    </div>
  )
}

/** The class and its choice, chosen freely while the character is in creation. */
export function LubecClassPicker({ sheet, onEdit }: { sheet: LubecSheet; onEdit: LubecSheetEdit }) {
  const id = useId()
  const choice = lubecClass(sheet.class.key)?.choice ?? null
  return (
    <section className="lubec-panel pine lubec-class-picker" aria-labelledby="lubec-panel-class">
      <div className="lubec-section-head"><h3 id="lubec-panel-class">Class</h3></div>
      <div className="lubec-picks">
        <div className="lubec-pick">
          <label htmlFor={id}>Class</label>
          <select id={id} value={sheet.class.key ?? ''} onChange={(event) => onEdit(withLubecClass(sheet, pickOf(event.target.value)))}>
            <option value="">Choose a class</option>
            {Object.values(LUBEC_CLASSES).map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
          </select>
        </div>
        {choice ? <LubecChoicePicker choice={choice} sheet={sheet} onEdit={onEdit} /> : null}
      </div>
    </section>
  )
}
