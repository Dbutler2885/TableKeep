import { LUBEC_CLASSES, lubecClass, type LubecClass } from '../ruleSets/lubec/classes'
import { lubecClassModifierText } from '../ruleSets/lubec/classText'
import { withLubecClass, type LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import type { LubecSheet } from '../ruleSets/lubec/sheet'
import { LubecChoicePicker } from './LubecClassPicker'

type ClassOptionProps = { definition: LubecClass; chosen: boolean; onChoose: () => void }

// One class as the roll-up offers it: its modifiers, its Trauma Response and any class rule.
function LubecClassOption({ definition, chosen, onChoose }: ClassOptionProps) {
  return (
    <li className="lubec-class-option">
      {/* Choosing the chosen class again would clear its choice, so it does nothing. */}
      <button type="button" aria-pressed={chosen} onClick={chosen ? undefined : onChoose}>
        <strong>{definition.name}</strong>
        <span className="lubec-class-mods">{lubecClassModifierText(definition)}</span>
      </button>
      <dl className="lubec-class-rules">
        <dt>Trauma Response</dt>
        <dd><strong>{definition.traumaResponse.name}.</strong> {definition.traumaResponse.text}</dd>
        {definition.classRule ? (
          <>
            <dt>Class rule</dt>
            <dd>{definition.classRule}</dd>
          </>
        ) : null}
      </dl>
    </li>
  )
}

/** Guided roll-up's class step: every class side by side, then the chosen class's own choice. Changeable until Finalize. */
export function LubecGuidedClassStep({ sheet, onEdit }: { sheet: LubecSheet; onEdit: LubecSheetEdit }) {
  const choice = lubecClass(sheet.class.key)?.choice ?? null
  return (
    <section className="lubec-panel pine lubec-class-step" aria-labelledby="lubec-panel-class-step">
      <div className="lubec-section-head"><h3 id="lubec-panel-class-step">Choose a class</h3></div>
      <ul className="lubec-class-options" aria-label="Classes">
        {Object.values(LUBEC_CLASSES).map((definition) => (
          <LubecClassOption
            key={definition.key}
            definition={definition}
            chosen={definition.key === sheet.class.key}
            onChoose={() => onEdit(withLubecClass(sheet, definition.key))}
          />
        ))}
      </ul>
      {choice ? <div className="lubec-picks"><LubecChoicePicker choice={choice} sheet={sheet} onEdit={onEdit} /></div> : null}
    </section>
  )
}
