import { LUBEC_ADVANTAGE_MODES, lubecAdvantageName, lubecRollSkills, type LubecRollSkill } from '../ruleSets/lubec/checkRoll'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { LUBEC_ROLL_ACTIONS, lubecReadsActions, lubecRollActionName, type LubecRollAction } from '../ruleSets/lubec/rollModes'
import { LUBEC_VALUE_NAMES } from '../ruleSets/lubec/sheet'
import { lubecSkillTier } from '../ruleSets/lubec/skills'
import { lubecShownAdvantage, type LubecSpin } from './lubecCircles'
import type { LubecRoller } from './useLubecRoller'

// The skills a Stat Check or Save can take, Trained before Expert as the
// prototype orders them. Fighting and shooting skills count only in the combat
// roller, so they never show here.
const stripSkills = (sheet: LubecCharacterSheet): LubecRollSkill[] =>
  lubecRollSkills(sheet).filter((skill) => skill.armable).sort((a, b) => a.bonus - b.bonus || a.name.localeCompare(b.name))

function stripHint(skills: readonly LubecRollSkill[], armed: string | null): string {
  const skill = skills.find((each) => each.name === armed)
  if (skill) return `+${skill.bonus} ${skill.name} applies to your next roll`
  return skills.length > 0 ? 'Tap a skill, then roll a Stat or Save' : ''
}

type ChipsProps = { skills: readonly LubecRollSkill[]; roller: LubecRoller; label?: string }

/** A chip for each skill, pressed while it is armed; the Fight bar shows them too, armed the same way. */
export function LubecSkillChips({ skills, roller, label = 'Arm a skill' }: ChipsProps) {
  return (
    <div className="skill-chips" role="group" aria-label={label}>
      {skills.map((skill) => (
        <button
          key={skill.name}
          type="button"
          className={lubecSkillTier(skill.name) === 'Expert' ? 'skill-chip expert' : 'skill-chip'}
          aria-pressed={roller.armed === skill.name}
          onClick={() => roller.toggleArmed(skill.name)}
        >
          {skill.name} <b>+{skill.bonus}</b>
        </button>
      ))}
    </div>
  )
}

type SwitchProps = { roller: LubecRoller; spin: LubecSpin | null }

/**
 * The mode is for the next roll only and overrides the cards: pressing the one
 * set hands the roll back to the cards, and a roll does the same once it lands. Like the circles, it is held while
 * a roll spins. The Gear page's Strength prompt shows it too, as the roller reads it.
 */
export function LubecAdvantageSwitch({ roller, spin }: SwitchProps) {
  // Left to the cards, the switch reads Normal unless a card sets a mode, which the line under it names.
  const shown = lubecShownAdvantage(spin, roller.advantage) ?? (cardModeLines(roller).length ? null : 'normal')
  return (
    <div className="lubec-advantage" role="group" aria-label="Advantage">
      {LUBEC_ADVANTAGE_MODES.map((mode) => (
        <button key={mode} type="button" className="secondary-button" aria-pressed={shown === mode} disabled={spin !== null} onClick={() => roller.toggleAdvantage(mode)}>
          {lubecAdvantageName(mode)}
        </button>
      ))}
    </div>
  )
}

/** The modes the cards set, each with the Stats and Saves it covers: "Strength, Speed, Handle: Disadvantage from Broken rib(s)". */
function cardModeLines(roller: LubecRoller): string[] {
  const byReason = new Map<string, string[]>()
  for (const name of LUBEC_VALUE_NAMES) {
    const { because } = roller.modeFor(name)
    if (because) byReason.set(because, [...(byReason.get(because) ?? []), name])
  }
  return [...byReason].map(([because, names]) => `${names.join(', ')}: ${because}`)
}

/** What the cards set for each roll while the player has not set a mode by hand; the switch overrides them. */
function LubecCardModes({ roller }: { roller: LubecRoller }) {
  if (roller.advantage !== null) return null
  const lines = cardModeLines(roller)
  if (!lines.length) return null
  return <ul className="lubec-card-modes" aria-label="Modes from effects">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
}

/** The kind of action the next roll is, asked only while a card reads it ("Punches at Disadvantage"). */
function LubecRollActionPick({ sheet, roller }: { sheet: LubecCharacterSheet; roller: LubecRoller }) {
  if (!lubecReadsActions(sheet.effects)) return null
  return (
    <label className="lubec-roll-action">
      <span>Action</span>
      <select value={roller.action ?? ''} onChange={(event) => roller.setAction((event.target.value || null) as LubecRollAction | null)}>
        <option value="">Any other</option>
        {LUBEC_ROLL_ACTIONS.map((action) => <option key={action} value={action}>{lubecRollActionName(action)}</option>)}
      </select>
    </label>
  )
}

type StripProps = { sheet: LubecCharacterSheet; roller: LubecRoller; spin: LubecSpin | null }

/**
 * The combined prototype's "Skills / Add to a roll" strip under the Saves:
 * a chip for each skill to arm for the next roll, the Advantage switch and the
 * hint line. The Skills tab opens the tree.
 */
export function LubecSkillStrip({ sheet, roller, spin }: StripProps) {
  const skills = stripSkills(sheet)
  return (
    <section className="ability-section" aria-labelledby="lubec-skill-strip-title">
      <div className="section-heading">
        <h3 id="lubec-skill-strip-title">Skills</h3>
        <span className="dice-formula">Add to a roll</span>
      </div>
      <div className="skill-strip-body">
        <LubecSkillChips skills={skills} roller={roller} />
        <div className="skill-strip-footer">
          <LubecAdvantageSwitch roller={roller} spin={spin} />
          <p className={roller.armed ? 'skill-strip-hint armed' : 'skill-strip-hint'} aria-live="polite">{stripHint(skills, roller.armed)}</p>
        </div>
        <LubecRollActionPick sheet={sheet} roller={roller} />
        <LubecCardModes roller={roller} />
      </div>
    </section>
  )
}
