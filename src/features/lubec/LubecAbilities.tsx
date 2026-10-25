import type { ReactNode } from 'react'
import { isLubecCritical, type LubecCheckRoll } from '../ruleSets/lubec/checkRoll'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { lubecCurrentValue, type LubecModifier } from '../ruleSets/lubec/derivations'
import { withLubecBaseValue, type LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import { LUBEC_SAVES, LUBEC_STATS, type LubecValueName } from '../ruleSets/lubec/sheet'
import { lubecSkillBonus } from '../ruleSets/lubec/skills'
import { LubecBaseInput } from './LubecBaseInput'
import { lubecBaseNote, lubecCircleFace, lubecNoteParts, type LubecCircleFace } from './lubecCircles'
import { LubecDecisionTray, LubecRollUpAbility } from './LubecDecisionTray'
import { LubecMissing } from './LubecMissing'
import { LubecPanicResult, LubecSaveRolls } from './LubecPanicRolls'
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

// "32/65" side by side, or stacked for a 100, which is too wide for one line.
function LubecCheckPair({ roll, target }: { roll: number; target: number }) {
  return (
    <span className={roll === 100 ? 'check-stack' : 'check-pair'}>
      <span>{roll}</span><span aria-hidden="true">/</span><span>{target}</span>
    </span>
  )
}

function LubecCircleNumber({ face }: { face: LubecCircleFace }) {
  if (face.kind === 'missing') return <LubecMissing />
  if (face.kind === 'value') return <>{face.value}</>
  if (face.kind === 'rolling') return <LubecCheckPair roll={face.preview} target={face.target} />
  return <LubecCheckPair roll={face.roll.result} target={face.roll.target} />
}

// The prototype's circle states: a value, a skill armed, a spin, a success or failure, a double.
function faceClasses(face: LubecCircleFace): string[] {
  if (face.kind === 'missing') return []
  if (face.kind === 'rolling') return ['rolling']
  if (face.kind === 'result') return ['has-value', `check-${face.roll.outcome}`, ...(isLubecCritical(face.roll) ? ['check-double'] : [])]
  return ['has-value', ...(face.armed ? ['skill-armed'] : [])]
}

const circleClasses = (face: LubecCircleFace): string => ['roll-circle', ...faceClasses(face)].join(' ')

function resultLabel(name: LubecValueName, roll: LubecCheckRoll): string {
  const outcome = isLubecCritical(roll) ? `Critical ${roll.outcome}` : `${roll.outcome.charAt(0).toUpperCase()}${roll.outcome.slice(1)}`
  return `${name} rolled ${roll.result} against ${roll.target}. ${outcome}. Click to clear.`
}

function circleLabel(name: LubecValueName, face: LubecCircleFace, rolls: boolean): string {
  if (face.kind === 'missing') return `Roll ${name}: missing value`
  if (face.kind === 'rolling') return `Rolling ${name}`
  if (face.kind === 'result') return resultLabel(name, face.roll)
  return rolls ? `Roll ${name} at or under ${face.value}` : `${name} score ${face.value}`
}

// A hole cannot be rolled under, and nothing is rolled while a check spins.
const circleDisabled = (face: LubecCircleFace, roller: LubecRoller | null, circles: LubecCircles): boolean =>
  !roller || circles.spin !== null || face.kind === 'missing'

type CircleProps = { name: LubecValueName; face: LubecCircleFace; roller: LubecRoller | null; circles: LubecCircles }

function LubecRollCircle({ name, face, roller, circles }: CircleProps) {
  return (
    <button
      type="button"
      className={circleClasses(face)}
      disabled={circleDisabled(face, roller, circles)}
      aria-label={circleLabel(name, face, roller !== null)}
      title={face.kind === 'missing' ? 'missing value' : undefined}
      onClick={() => circles.click(name)}
    >
      <span className="number"><LubecCircleNumber face={face} /></span>
    </button>
  )
}

// The armed skill's bonus while a value waits to be rolled, or the skill a shown result was rolled with.
function skillNote(face: LubecCircleFace, armed: string | null): string | null {
  if (face.kind === 'result') return face.roll.skill && `+${lubecSkillBonus(face.roll.skill)} ${face.roll.skill}`
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
      <LubecRollCircle name={name} face={face} roller={roller} circles={circles} />
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
 * the result shows on the circle until it is clicked away; the status line
 * under them says what happened, whatever was rolled. The Panic Check and the
 * Recovery Save stay a little apart below that, with a failed Panic Check's row.
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
      <p className="status" role="status" aria-live="polite">{rollUp ? rollUp.status : circles.status}</p>
      {values.roller ? <LubecSaveRolls sheet={values.sheet} roller={values.roller} /> : null}
      <LubecPanicResult sheet={values.sheet} roller={values.roller} />
    </div>
  )
}
