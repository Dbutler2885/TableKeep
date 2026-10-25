import { useId, useState } from 'react'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { LUBEC_CLASSES, lubecClass, type LubecClass, type LubecClassChoice } from '../ruleSets/lubec/classes'
import type { LubecModifier } from '../ruleSets/lubec/derivations'
import { withLubecClass, withLubecClassChoice, type LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import { lubecRollUpStage, readLubecRollUp } from '../ruleSets/lubec/guidedRollUp'
import type { LubecSheet, LubecStat } from '../ruleSets/lubec/sheet'
import { lubecFreeSkillLine, lubecModifierBars } from './lubecClassCards'
import { LubecClassRecord } from './LubecClassRecord'

type ChoiceRowProps = { choice: LubecClassChoice; stat: LubecStat; onStat: (stat: LubecStat) => void }

// The class's own choice, picked on its card before the class is chosen.
function LubecChoiceRow({ choice, stat, onStat }: ChoiceRowProps) {
  const id = useId()
  return (
    <div className="choice-row">
      <label htmlFor={id}>{choice.label}</label>
      <select id={id} value={stat} onChange={(event) => onStat(choice.options.find((option) => option === event.target.value) ?? stat)}>
        {choice.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  )
}

// The class with its choice, which starts at the first Stat on its list as the prototype's select does.
function chosenClass(sheet: LubecSheet, definition: LubecClass, stat: LubecStat | null): Pick<LubecSheet, 'class'> {
  const chosen = withLubecClass(sheet, definition.key)
  return definition.choice ? withLubecClassChoice({ ...sheet, ...chosen }, definition.choice.field, stat) : chosen
}

type CardProps = { definition: LubecClass; onChoose: (stat: LubecStat | null) => void }

/** One of the prototype's class cards: name, modifier bars, free skill line, description, its choice and its Choose button. */
function LubecClassCard({ definition, onChoose }: CardProps) {
  const { choice } = definition
  const [stat, setStat] = useState<LubecStat | null>(choice?.options[0] ?? null)
  return (
    <article className="class-card" aria-label={definition.name}>
      <h4>{definition.name}</h4>
      <div className="modifier-list">
        {lubecModifierBars(definition).map((bar) => <span key={bar} className="modifier">{bar}</span>)}
        <span className="modifier skill-modifier">{lubecFreeSkillLine(definition)}</span>
      </div>
      <p className="class-note">{definition.description}</p>
      {choice && stat ? <LubecChoiceRow choice={choice} stat={stat} onStat={setStat} /> : null}
      <button type="button" className="class-select" onClick={() => onChoose(stat)}>Choose {definition.name}</button>
    </article>
  )
}

function LubecClassGrid({ sheet, onEdit }: { sheet: LubecSheet; onEdit: LubecSheetEdit }) {
  return (
    <div className="class-grid">
      {Object.values(LUBEC_CLASSES).map((definition) => (
        <LubecClassCard key={definition.key} definition={definition} onChoose={(stat) => onEdit(chosenClass(sheet, definition, stat))} />
      ))}
    </div>
  )
}

// A guided draft's classes wait for its dice and the lowest-Stat decision.
const classLocked = (sheet: LubecCharacterSheet, guided: boolean): boolean =>
  guided && lubecRollUpStage(readLubecRollUp(sheet.rollUp)) !== 'settled'

type SectionProps = {
  sheet: LubecCharacterSheet
  modifiers: readonly LubecModifier[]
  /** Chooses the class; null unless the viewer may change it. */
  onDraftEdit: LubecSheetEdit | null
  /** A guided draft, whose kicker speaks of the rolls and whose classes unlock once its scores are settled. */
  guided: boolean
}

/**
 * The prototype's class section: once a class is chosen, its class record;
 * before that, for whoever may choose, the five class cards, or on a guided
 * draft still rolling the placeholder that says when they unlock.
 */
export function LubecClassSection({ sheet, modifiers, onDraftEdit, guided }: SectionProps) {
  if (lubecClass(sheet.class.key) || !onDraftEdit) return <LubecClassRecord sheet={sheet} modifiers={modifiers} />
  const locked = classLocked(sheet, guided)
  return (
    <section className="class-section" aria-labelledby="lubec-class-title">
      <div className="section-bar">
        <h3 id="lubec-class-title">Choose your class</h3>
        {guided ? <span className="section-kicker">{locked ? 'Settle Stats and Saves first' : 'Choose the kid after seeing the rolls'}</span> : null}
      </div>
      {locked ? (
        <div className="class-lock">Class options unlock after all eight abilities are rolled and the lowest-Stat decision is complete.</div>
      ) : (
        <LubecClassGrid sheet={sheet} onEdit={onDraftEdit} />
      )}
    </section>
  )
}
