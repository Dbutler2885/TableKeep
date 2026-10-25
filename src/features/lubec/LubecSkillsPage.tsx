import { useRef, useState } from 'react'
import type { LubecSheet } from '../ruleSets/lubec/sheet'
import type { LubecSkills } from '../ruleSets/lubec/skillPicks'
import { LUBEC_SKILL_BONUS, LUBEC_SKILL_TREE_ROWS, lubecSkill } from '../ruleSets/lubec/skills'
import { LubecSkillDetail } from './LubecSkillDetail'
import { LubecSkillPackage } from './LubecSkillPackage'
import {
  LUBEC_TREE_EXPERT,
  LUBEC_TREE_TRAINED,
  lubecFreeList,
  lubecHasSkill,
  lubecHotSkills,
  lubecSuggestedSkills,
  withDotClicked,
  withFreeChipClicked,
  type LubecWire,
} from './lubecSkillTree'
import { useLubecSkillWires } from './useLubecSkillWires'

/** Called with the whole new skills value; absent when the viewer may not change the skills. */
type OnSkillsChange = ((skills: LubecSkills) => void) | null

/** What every dot and label on the page reads: the skills, whether they are being chosen, and which name is focused. */
type TreeView = {
  skills: LubecSkills
  picking: boolean
  /** The class's free list while no free class skill is chosen: the dashed dots. */
  suggested: readonly string[]
  focused: string | null
  /** The focused skill and everything wired to it. */
  hot: ReadonlySet<string>
  onDot: (name: string) => void
  onLabel: (name: string) => void
}

// The prototype's node classes: on for a skill the character has, fixed for
// the free class skill and suggested for its choices while skills are chosen,
// hot for the focused skill and everything wired to it.
function nodeClassName(name: string, view: TreeView): string {
  const marks: Record<string, boolean> = {
    on: lubecHasSkill(view.skills, name),
    fixed: view.picking && name === view.skills.free,
    suggested: view.suggested.includes(name),
    hot: view.hot.has(name),
  }
  return ['skill-node', ...Object.keys(marks).filter((mark) => marks[mark])].join(' ')
}

// A dot that chooses and a label that explains, as the prototype's nodeMarkup.
function LubecSkillNode({ name, view }: { name: string; view: TreeView }) {
  return (
    <span className={nodeClassName(name, view)} data-skill={name}>
      <button
        type="button"
        className="skill-dot"
        aria-pressed={lubecHasSkill(view.skills, name)}
        aria-label={`Choose ${name}`}
        aria-disabled={!view.picking}
        onClick={() => view.onDot(name)}
      />
      <button type="button" className="skill-label" aria-expanded={view.focused === name} onClick={() => view.onLabel(name)}>
        {name}
      </button>
    </span>
  )
}

function LubecSkillCell({ name, view, expert }: { name: string | null; view: TreeView; expert: boolean }) {
  return (
    <div className={expert ? 'skill-cell expert' : 'skill-cell'}>
      {name === null ? <span className="skill-empty" /> : <LubecSkillNode name={name} view={view} />}
    </div>
  )
}

const wireIsHot = (wire: LubecWire, focused: string | null) => wire.source === focused || wire.target === focused

// The wires under the nodes, the focused skill's drawn last so they lie on top.
function LubecSkillWires({ wires, focused }: { wires: readonly LubecWire[]; focused: string | null }) {
  const ordered = [...wires.filter((wire) => !wireIsHot(wire, focused)), ...wires.filter((wire) => wireIsHot(wire, focused))]
  return (
    <svg aria-hidden="true">
      <defs>
        <marker id="lubec-skill-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="#8f958f" />
        </marker>
        <marker id="lubec-skill-arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0 L10 5 L0 10 z" fill="#a34229" />
        </marker>
      </defs>
      {ordered.map((wire) => {
        const hot = wireIsHot(wire, focused)
        return (
          <path
            key={`${wire.source}>${wire.target}`}
            className={hot ? 'wire hot' : 'wire'}
            d={wire.d}
            markerEnd={hot ? 'url(#lubec-skill-arrow-hot)' : 'url(#lubec-skill-arrow)'}
          />
        )
      })}
    </svg>
  )
}

// Every Trained skill beside the Expert it unlocks, wired to each Expert it is a prerequisite of.
function LubecSkillTree({ view }: { view: TreeView }) {
  const treeRef = useRef<HTMLDivElement>(null)
  const wires = useLubecSkillWires(treeRef)
  return (
    <div ref={treeRef} className={view.focused === null ? 'skill-tree' : 'skill-tree focus'} role="group" aria-label="Skill tree">
      <LubecSkillWires wires={wires} focused={view.focused} />
      <div>
        {LUBEC_SKILL_TREE_ROWS.map(([trained, expert]) => (
          <div className="skill-row" key={`${trained}-${expert}`}>
            <LubecSkillCell name={trained} view={view} expert={false} />
            <LubecSkillCell name={expert} view={view} expert />
          </div>
        ))}
      </div>
    </div>
  )
}

// The tree as two plain lists, which a narrow screen shows instead of it.
function LubecSkillList({ view }: { view: TreeView }) {
  return (
    <div className="skill-list" role="group" aria-label="Skill list">
      <h4>Trained Skills<span>+{LUBEC_SKILL_BONUS.Trained} bonus</span></h4>
      {LUBEC_TREE_TRAINED.map((name) => <div className="skill-item" key={name}><LubecSkillNode name={name} view={view} /></div>)}
      <h4>Expert Skills<span>+{LUBEC_SKILL_BONUS.Expert} bonus / needs any one prerequisite</span></h4>
      {LUBEC_TREE_EXPERT.map((name) => (
        <div className="skill-item" key={name}>
          <LubecSkillNode name={name} view={view} />
          <div className="skill-from">From: {lubecSkill(name)?.prerequisites.join(', ')}</div>
        </div>
      ))}
    </div>
  )
}

function LubecTreeHeads() {
  return (
    <div className="tree-heads" aria-hidden="true">
      <div className="tree-head"><b>Trained Skills</b><span>+{LUBEC_SKILL_BONUS.Trained} bonus</span></div>
      <div className="tree-head expert"><b>Expert Skills</b><span>+{LUBEC_SKILL_BONUS.Expert} bonus</span></div>
    </div>
  )
}

function LubecSkillsBar({ picking }: { picking: boolean }) {
  return (
    <div className="section-bar">
      <h3 id="lubec-skills-title">{picking ? 'Choose your skills' : 'Skill tree'}</h3>
      <span className="section-kicker">{picking ? 'Any Expert needs one of its prerequisites' : 'Your skills are filled in'}</span>
    </div>
  )
}

/** The focused name lights up its wires; the shown one is in the detail bar. */
type SkillFocus = { focused: string | null; shown: string | null }

const NO_FOCUS: SkillFocus = { focused: null, shown: null }

// Reading a name focuses it and a second read clears it; choosing a skill only shows it.
function useSkillFocus() {
  const [focus, setFocus] = useState<SkillFocus>(NO_FOCUS)
  return {
    focus,
    show: (name: string) => setFocus((current) => ({ ...current, shown: name })),
    toggle: (name: string) => setFocus((current) => (current.focused === name ? NO_FOCUS : { focused: name, shown: name })),
  }
}

type PageProps = {
  sheet: LubecSheet
  onChange: OnSkillsChange
  onHideTree: () => void
  /** Clears the class and its skills to choose again; null unless the viewer may change the class. */
  onChangeClass: (() => void) | null
}

/**
 * The combined prototype's Skills section: the class package and the tree's
 * dots for choosing while `onChange` is given, and otherwise the tree to read,
 * with the sticky detail bar under it either way.
 */
export function LubecSkillsPage({ sheet, onChange, onHideTree, onChangeClass }: PageProps) {
  const { focus, show, toggle } = useSkillFocus()
  const skills = sheet.skills
  const picking = onChange !== null
  const freeList = lubecFreeList(sheet.class.key)
  const choose = (next: LubecSkills, name: string) => {
    onChange?.(next)
    show(name)
  }
  const view: TreeView = {
    skills,
    picking,
    suggested: lubecSuggestedSkills(skills, freeList, picking),
    focused: focus.focused,
    hot: lubecHotSkills(focus.focused),
    onDot: (name) => { if (picking) choose(withDotClicked(skills, name, freeList), name) },
    onLabel: toggle,
  }
  return (
    <div className="lubec-page lubec-skills">
      <section className={view.picking ? 'skills-section' : 'skills-section viewing'} aria-labelledby="lubec-skills-title">
        <LubecSkillsBar picking={view.picking} />
        {view.picking ? <LubecSkillPackage sheet={sheet} onFreeChip={(name) => choose(withFreeChipClicked(skills, name), name)} /> : null}
        <LubecTreeHeads />
        <LubecSkillTree view={view} />
        <LubecSkillList view={view} />
        <LubecSkillDetail sheet={sheet} shown={focus.shown} picking={view.picking} onHideTree={onHideTree} onChangeClass={onChangeClass} />
      </section>
    </div>
  )
}
