import { isLubecCritical, type LubecCheckRoll } from '../ruleSets/lubec/checkRoll'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import type { LubecModifier } from '../ruleSets/lubec/derivations'
import { withLubecBaseValue, type LubecSheetEdit } from '../ruleSets/lubec/directEntry'
import { LUBEC_SAVES, LUBEC_STATS, type LubecValueName } from '../ruleSets/lubec/sheet'
import { lubecSkillBonus } from '../ruleSets/lubec/skills'
import { LubecBaseInput } from './LubecBaseInput'
import { lubecBaseNote, lubecCircleFace, lubecNoteParts, type LubecCircleFace } from './lubecCircles'
import { LubecMissing } from './LubecMissing'
import { LubecPanicResult, LubecSaveRolls } from './LubecPanicRolls'
import { LubecSkillStrip } from './LubecSkillStrip'
import { useLubecCircles, type LubecCircles } from './useLubecCircles'
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

type AbilityProps = ValuesProps & { name: LubecValueName; circles: LubecCircles }

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

// The base and what the class and effects add to it; the base is a field while a draft can be typed into.
function LubecBaseNote({ sheet, name, modifiers, onDraftEdit }: ValuesProps & { name: LubecValueName }) {
  if (!onDraftEdit) return <span className="base-note">{lubecBaseNote({ sheet, name, modifiers })}</span>
  const parts = lubecNoteParts({ sheet, name, modifiers })
  return (
    <span className="base-note">
      <LubecBaseInput label={`${name} base`} value={sheet.base[name]} onChange={(value) => onDraftEdit(withLubecBaseValue(sheet, name, value))} />
      {parts.length > 0 ? ` ${parts.join(' ')}` : null}
    </span>
  )
}

function LubecAbility({ circles, ...values }: AbilityProps) {
  const { sheet, name, modifiers, roller } = values
  const face = lubecCircleFace({ sheet, name, modifiers }, { armed: roller?.armed ?? null, result: circles.result(name), spin: circles.spin })
  const note = skillNote(face, roller?.armed ?? null)
  return (
    <div className="ability">
      <LubecRollCircle name={name} face={face} roller={roller} circles={circles} />
      <span className="ability-name">{name}</span>
      {note ? <span className="base-note skill-note">{note}</span> : <LubecBaseNote {...values} />}
    </div>
  )
}

type SectionProps = ValuesProps & { title: string; formula: string; names: readonly LubecValueName[]; circles: LubecCircles }

function LubecAbilitySection({ title, formula, names, ...values }: SectionProps) {
  const id = `lubec-${title.toLowerCase()}-title`
  return (
    <section className="ability-section" aria-labelledby={id}>
      <div className="section-heading">
        <h3 id={id}>{title}</h3>
        <span className="dice-formula">{formula}</span>
      </div>
      <div className={names.length === LUBEC_SAVES.length ? 'ability-grid save-grid' : 'ability-grid'}>
        {names.map((name) => <LubecAbility key={name} name={name} {...values} />)}
      </div>
    </section>
  )
}

/**
 * The combined prototype's Stats and Saves: a roll circle for each, showing
 * the current value with the base and its class modifier under it, and the
 * skills to add to a roll under them. Clicking a circle rolls a check on it and
 * the result shows on the circle until it is clicked away; the status line
 * under them says what happened, whatever was rolled. The Panic Check and the
 * Recovery Save stay a little apart below that, with a failed Panic Check's row.
 */
export function LubecAbilities({ onShowTree, ...values }: ValuesProps & { onShowTree: () => void }) {
  const circles = useLubecCircles(values.sheet, values.roller)
  return (
    <div className="abilities">
      <LubecAbilitySection title="Stats" formula="Array + D10 each" names={LUBEC_STATS} circles={circles} {...values} />
      <LubecAbilitySection title="Saves" formula="2D10 + 10" names={LUBEC_SAVES} circles={circles} {...values} />
      {values.roller ? <LubecSkillStrip sheet={values.sheet} roller={values.roller} onShowTree={onShowTree} /> : null}
      <p className="status" role="status" aria-live="polite">{circles.status}</p>
      {values.roller ? <LubecSaveRolls sheet={values.sheet} roller={values.roller} /> : null}
      <LubecPanicResult sheet={values.sheet} roller={values.roller} />
    </div>
  )
}
