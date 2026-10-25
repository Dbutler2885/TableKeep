import type { ReactNode } from 'react'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { lubecCurrentValue, type LubecModifier } from '../ruleSets/lubec/derivations'
import { withLubecBaseValue, type LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import { LUBEC_SAVES, LUBEC_STATS, type LubecValueName } from '../ruleSets/lubec/sheet'
import { lubecSkillBonus } from '../ruleSets/lubec/skills'
import { LubecBaseInput } from './LubecBaseInput'
import { lubecBaseNote, lubecCircleFace, lubecNoteParts, lubecRolledSkill, type LubecCircleFace } from './lubecCircles'
import { LubecDecisionTray, LubecRollUpAbility } from './LubecDecisionTray'
import { LubecMissing } from './LubecMissing'
import { LubecPanicSection } from './LubecPanicRolls'
import { LubecRollCircle, type LubecCircleLabels } from './LubecRollCircle'
import { LubecSkillStrip } from './LubecSkillStrip'
import { useLubecCircles, type LubecCircles } from './useLubecCircles'
import { useLubecRollUp, type LubecRollUpEdits, type LubecRollUpView } from './useLubecRollUp'
import type { LubecRoller } from './useLubecRoller'

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

type AbilityProps = ValuesProps & { name: LubecValueName; circles: LubecCircles; rollUp: LubecRollUpView | null }

// "Roll Strength at or under 29" for whoever may roll it, "Strength score 29" for anyone else.
const valueLabels = (name: LubecValueName, rolls: boolean): LubecCircleLabels => ({
  name,
  missing: `Roll ${name}: missing value`,
  value: (value) => (rolls ? `Roll ${name} at or under ${value}` : `${name} score ${value}`),
})

// The armed skill's bonus while a value waits to be rolled, or the skill a shown result was rolled with.
function skillNote(face: LubecCircleFace, armed: string | null): string | null {
  const skill = face.kind === 'result' ? lubecRolledSkill(face.roll) : null
  if (skill) return `+${lubecSkillBonus(skill)} ${skill}`
  if (face.kind === 'value' && face.armed && armed) return `+${lubecSkillBonus(armed)} skill`
  return null
}

// What the class and effects make of a typed base: "+5 class = 29", the
// missing mark while the final value is a hole, and nothing when the base is
// empty or nothing is added to it.
function LubecTypedNote({ sheet, name, modifiers }: Omit<ValuesProps, 'onDraftEdit' | 'roller'> & { name: LubecValueName }) {
  const current = lubecCurrentValue(sheet, name, modifiers)
  const parts = lubecNoteParts({ sheet, name, modifiers })
  if (sheet.base[name] === null || (current !== null && parts.length === 0)) return <span className="base-note typed-note" />
  if (current === null) return <span className="base-note typed-note"><LubecMissing /></span>
  return <span className="base-note typed-note"><span>{parts.join(' ')}</span> <span>= {current}</span></span>
}

// A draft being typed into: the base is typed into the circle's place, and the note says what it comes to.
function LubecTypedAbility({ sheet, name, modifiers, onDraftEdit }: ValuesProps & { name: LubecValueName; onDraftEdit: LubecSheetEdit }) {
  return (
    <div className="ability">
      <div className="roll-circle has-value typed">
        <span className="number">
          <LubecBaseInput label={`${name} base`} value={sheet.base[name]} onChange={(value) => onDraftEdit(withLubecBaseValue(sheet, name, value))} />
        </span>
      </div>
      <span className="ability-name">{name}</span>
      <LubecTypedNote sheet={sheet} name={name} modifiers={modifiers} />
    </div>
  )
}

function LubecAbility({ circles, rollUp, ...values }: AbilityProps) {
  if (rollUp) return <LubecRollUpAbility name={values.name} view={rollUp} />
  if (values.onDraftEdit) return <LubecTypedAbility {...values} onDraftEdit={values.onDraftEdit} />
  return <LubecRolledAbility circles={circles} {...values} />
}

function LubecRolledAbility({ circles, ...values }: Omit<AbilityProps, 'rollUp'>) {
  const { sheet, name, modifiers, roller } = values
  const face = lubecCircleFace({ sheet, name, modifiers }, { armed: roller?.armed ?? null, result: circles.result(name), spin: circles.spin })
  const note = skillNote(face, roller?.armed ?? null)
  return (
    <div className="ability">
      <LubecRollCircle name={name} labels={valueLabels(name, roller !== null)} face={face} roller={roller} circles={circles} />
      <span className="ability-name">{name}</span>
      <span className={note ? 'base-note skill-note' : 'base-note'}>{note ?? lubecBaseNote({ sheet, name, modifiers })}</span>
    </div>
  )
}

type SectionProps = ValuesProps & {
  title: string
  formula: string
  names: readonly LubecValueName[]
  circles: LubecCircles
  rollUp: LubecRollUpView | null
  /** The decision tray, which sits under the Stats' circles. */
  tray?: ReactNode
}

function LubecAbilitySection({ title, formula, names, tray = null, ...values }: SectionProps) {
  const id = `lubec-${title.toLowerCase()}-title`
  return (
    <section className="ability-section" aria-labelledby={id}>
      <div className="section-heading">
        <h3 id={id}>{title}</h3>
        <span className="dice-formula">{formula}</span>
      </div>
      <div>
        <div className={names.length === LUBEC_SAVES.length ? 'ability-grid save-grid' : 'ability-grid'}>
          {names.map((name) => <LubecAbility key={name} name={name} {...values} />)}
        </div>
        {tray}
      </div>
    </section>
  )
}

type AbilitiesProps = ValuesProps & {
  /** A guided draft's roll-up, while its circles still roll the dice and settle the scores. */
  rollUp: LubecRollUpEdits | null
  onShowTree: () => void
}

/**
 * The combined prototype's Stats and Saves: a roll circle for each, showing
 * the current value with the base and its class modifier under it, and the
 * skills to add to a roll under them. Clicking a circle rolls a check on it and
 * the result shows on the circle until it is clicked away. The Panic Check and
 * the Recovery Save have circles of their own a little apart below that, with a
 * failed Panic Check's row; the status line under them all says what happened,
 * whatever was rolled.
 * A guided draft's circles roll its dice instead and carry the lowest-Stat
 * decision, and a draft being typed into takes each base in its circle's place.
 */
export function LubecAbilities({ onShowTree, rollUp: rollUpEdits, ...values }: AbilitiesProps) {
  const circles = useLubecCircles(values.sheet, values.roller)
  const rollUp = useLubecRollUp(values.sheet, rollUpEdits)
  const tray = rollUp ? <LubecDecisionTray view={rollUp} /> : null
  return (
    <div className="abilities">
      <LubecAbilitySection title="Stats" formula="Array + D10 each" names={LUBEC_STATS} circles={circles} rollUp={rollUp} tray={tray} {...values} />
      <LubecAbilitySection title="Saves" formula="2D10 + 10" names={LUBEC_SAVES} circles={circles} rollUp={rollUp} {...values} />
      {values.roller ? <LubecSkillStrip sheet={values.sheet} roller={values.roller} onShowTree={onShowTree} /> : null}
      {rollUp ? null : <LubecPanicSection sheet={values.sheet} roller={values.roller} circles={circles} />}
      <p className="status" role="status" aria-live="polite">{rollUp ? rollUp.status : circles.status}</p>
    </div>
  )
}
