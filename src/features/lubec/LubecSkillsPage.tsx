import { anyOf } from '../ruleSets/lubec/ruleChecks'
import type { LubecSheet } from '../ruleSets/lubec/sheet'
import {
  lubecFreeSkillOptions,
  lubecSkillMark,
  lubecTakenSkills,
  withFreeSkill,
  withPickToggled,
  type LubecSkillMark,
  type LubecSkills,
  type LubecTakenSkill,
} from '../ruleSets/lubec/skillPicks'
import { LUBEC_SKILL_BONUS, LUBEC_SKILL_TREE_ROWS, lubecSkill } from '../ruleSets/lubec/skills'

/** Called with the whole new skills value; absent when the viewer may not change the skills. */
type OnSkillsChange = ((skills: LubecSkills) => void) | null

const bonusText = (bonus: number) => `+${bonus}`

function LubecTakenSkillRow({ skill }: { skill: LubecTakenSkill }) {
  return (
    <li className={skill.tier === null ? 'lubec-taken-skill unknown' : 'lubec-taken-skill'}>
      <span className="lubec-taken-name">{skill.name}</span>
      {skill.free ? <span className="lubec-skill-mark">Free</span> : null}
      <span className="lubec-taken-tier">{skill.tier ?? 'Not a Lubec skill'}</span>
      <span className="lubec-taken-bonus">{skill.bonus === null ? 'counts for nothing' : bonusText(skill.bonus)}</span>
    </li>
  )
}

function LubecFreeSkillChoice({ sheet, onChange }: { sheet: LubecSheet; onChange: NonNullable<OnSkillsChange> }) {
  const free = sheet.skills.free
  return (
    <label className="lubec-free-skill">
      <span>Free class skill</span>
      <select value={free ?? ''} onChange={(event) => onChange(withFreeSkill(sheet.skills, event.target.value || null))}>
        <option value="">Not chosen</option>
        {lubecFreeSkillOptions(sheet.class.key, free).map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
  )
}

// The character's own skills: the free class skill and the picks, each with its tier and bonus.
function LubecTakenSkills({ sheet, onChange }: { sheet: LubecSheet; onChange: OnSkillsChange }) {
  const taken = lubecTakenSkills(sheet.skills)
  return (
    <section className="lubec-panel blue" aria-labelledby="lubec-panel-skills">
      <div className="lubec-section-head"><h3 id="lubec-panel-skills">Skills</h3></div>
      {onChange ? <LubecFreeSkillChoice sheet={sheet} onChange={onChange} /> : null}
      {taken.length === 0 ? <p className="lubec-skills-none">No skills yet.</p> : null}
      <ul className="lubec-taken-skills" aria-label="Skills taken">
        {taken.map((skill, index) => <LubecTakenSkillRow key={`${index}-${skill.name}`} skill={skill} />)}
      </ul>
    </section>
  )
}

type SkillNameProps = { name: string; mark: LubecSkillMark; onToggle: ((name: string) => void) | null }

// A pick toggles in creation; the free class skill is changed through its own choice instead.
function LubecSkillName({ name, mark, onToggle }: SkillNameProps) {
  if (!onToggle) return <span className="lubec-skill-name">{name}</span>
  return (
    <button type="button" className="lubec-skill-name" aria-pressed={mark !== null} disabled={mark === 'free'} onClick={() => onToggle(name)}>
      {name}
    </button>
  )
}

const markText = (mark: NonNullable<LubecSkillMark>, bonus: number) => `${mark === 'free' ? 'Free' : 'Pick'} ${bonusText(bonus)}`

type TreeCellProps = { name: string | null; skills: LubecSkills; onToggle: SkillNameProps['onToggle'] }

function LubecSkillTreeCell({ name, skills, onToggle }: TreeCellProps) {
  const skill = lubecSkill(name)
  if (skill === null) return <td className="lubec-tree-gap" />
  const mark = lubecSkillMark(skills, skill.name)
  return (
    <td className={mark === null ? 'lubec-tree-skill' : `lubec-tree-skill ${mark}`}>
      <LubecSkillName name={skill.name} mark={mark} onToggle={onToggle} />
      {mark === null ? null : <span className="lubec-skill-mark">{markText(mark, LUBEC_SKILL_BONUS[skill.tier])}</span>}
      {skill.prerequisites.length > 0 ? <span className="lubec-skill-needs">needs {anyOf(skill.prerequisites)}</span> : null}
    </td>
  )
}

// Every Trained skill beside the Expert it unlocks, as the rules data lays them out.
function LubecSkillTree({ skills, onChange }: { skills: LubecSkills; onChange: OnSkillsChange }) {
  const onToggle = onChange && ((name: string) => onChange(withPickToggled(skills, name)))
  return (
    <section className="lubec-panel pine" aria-labelledby="lubec-panel-skill-tree">
      <div className="lubec-section-head"><h3 id="lubec-panel-skill-tree">Skill tree</h3></div>
      <table className="lubec-skill-tree">
        <thead>
          <tr>
            <th scope="col">Trained {bonusText(LUBEC_SKILL_BONUS.Trained)}</th>
            <th scope="col">Expert {bonusText(LUBEC_SKILL_BONUS.Expert)}</th>
          </tr>
        </thead>
        <tbody>
          {LUBEC_SKILL_TREE_ROWS.map(([trained, expert]) => (
            <tr key={`${trained}-${expert}`}>
              <LubecSkillTreeCell name={trained} skills={skills} onToggle={onToggle} />
              <LubecSkillTreeCell name={expert} skills={skills} onToggle={onToggle} />
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** The Skills page: the character's skills and the whole skill tree, with picks changeable while `onChange` is given. */
export function LubecSkillsPage({ sheet, onChange }: { sheet: LubecSheet; onChange: OnSkillsChange }) {
  return (
    <div className="lubec-page lubec-skills">
      <LubecTakenSkills sheet={sheet} onChange={onChange} />
      <LubecSkillTree skills={sheet.skills} onChange={onChange} />
    </div>
  )
}
