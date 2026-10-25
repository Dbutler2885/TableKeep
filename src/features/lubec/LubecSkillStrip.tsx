import { LUBEC_ADVANTAGE_MODES, lubecAdvantageName, lubecRollSkills, type LubecRollSkill } from '../ruleSets/lubec/checkRoll'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
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

function LubecSkillChips({ skills, roller }: { skills: readonly LubecRollSkill[]; roller: LubecRoller }) {
  return (
    <div className="skill-chips" role="group" aria-label="Arm a skill">
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

// The mode is for the next roll only: pressing the one set turns it off, and a
// roll puts it back to Normal once it lands. Like the circles, it is held while a roll spins.
function LubecAdvantageSwitch({ roller, spin }: SwitchProps) {
  const shown = lubecShownAdvantage(spin, roller.advantage)
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
      </div>
    </section>
  )
}
