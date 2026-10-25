import type { LubecSheet } from '../ruleSets/lubec/sheet'
import type { LubecSkills } from '../ruleSets/lubec/skillPicks'
import { lubecSkillText } from '../ruleSets/lubec/skillText'
import { LUBEC_SKILL_BONUS, lubecSkill } from '../ruleSets/lubec/skills'
import { lubecDetailTag, lubecKitLine, lubecLeadsTo, lubecPackageProgress, lubecUnknownSkills } from './lubecSkillTree'

const PICKING_HINT = 'Click a dot to choose a skill. Click a name to read it and see its connections.'
const VIEWING_HINT = 'Click a name to read it and see its connections.'

function LubecMetaLine({ label, names }: { label: string; names: readonly string[] }) {
  return names.length > 0 ? <div className="meta">{label}: {names.join(', ')}</div> : null
}

// One skill as the prototype's showSkillDetail writes it: name, tier and bonus,
// whether the character has it, its description, prerequisites, what it leads
// to and its kit. Only skills on the tree are ever shown.
function LubecSkillDetailBody({ name, skills }: { name: string; skills: LubecSkills }) {
  const skill = lubecSkill(name)!
  const text = lubecSkillText(name)!
  const tag = lubecDetailTag(skills, name)
  const kit = lubecKitLine(text)
  return (
    <>
      <div className="top">
        <h4>{name}</h4>
        <span className={skill.tier === 'Expert' ? 'detail-chip expert' : 'detail-chip'}>{skill.tier} +{LUBEC_SKILL_BONUS[skill.tier]}</span>
        {tag ? <span className="detail-chip">{tag}</span> : null}
      </div>
      <p>{text.description}</p>
      <LubecMetaLine label="Prerequisite (any one)" names={skill.prerequisites} />
      <LubecMetaLine label="Leads to" names={lubecLeadsTo(name)} />
      {kit ? <div className="meta">{kit}</div> : null}
    </>
  )
}

type ActionsProps = Pick<DetailProps, 'sheet' | 'picking' | 'onHideTree' | 'onChangeClass'>

// Choosing shows how far the package has come and offers Change class; viewing offers the way back to the Core sheet.
function LubecSkillActions({ sheet, picking, onHideTree, onChangeClass }: ActionsProps) {
  if (!picking) {
    return (
      <div className="skill-actions">
        <span className="package-progress">Your skills are filled in</span>
        <button type="button" className="secondary-button" onClick={onHideTree}>Hide skill tree</button>
      </div>
    )
  }
  const progress = lubecPackageProgress(sheet)
  if (progress === null) return null
  return (
    <div className="skill-actions">
      <span className="package-progress">{progress}</span>
      {onChangeClass ? <button type="button" className="secondary-button" onClick={onChangeClass}>Change class</button> : null}
    </div>
  )
}

type DetailProps = {
  sheet: LubecSheet
  shown: string | null
  picking: boolean
  onHideTree: () => void
  /** Clears the class and its skills to choose again; null unless the viewer may change the class. */
  onChangeClass: (() => void) | null
}

/**
 * The prototype's sticky dark detail bar: the skill last chosen or read, or
 * the hint until there is one, any stored name the tree does not have, and the
 * package progress with Change class, or the way back to the Core sheet.
 */
export function LubecSkillDetail({ sheet, shown, picking, onHideTree, onChangeClass }: DetailProps) {
  const unknown = lubecUnknownSkills(sheet.skills)
  return (
    <aside className="skill-detail" aria-label="Skill detail">
      <div aria-live="polite">
        {shown ? <LubecSkillDetailBody name={shown} skills={sheet.skills} /> : <div className="hint">{picking ? PICKING_HINT : VIEWING_HINT}</div>}
      </div>
      {unknown.length > 0 ? <div className="meta msg">Not on the tree, counting for nothing: {unknown.join(', ')}</div> : null}
      <LubecSkillActions sheet={sheet} picking={picking} onHideTree={onHideTree} onChangeClass={onChangeClass} />
    </aside>
  )
}
