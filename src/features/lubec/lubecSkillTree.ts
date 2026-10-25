import { lubecClass, type LubecClass, type LubecClassKey, type LubecPackageShape } from '../ruleSets/lubec/classes'
import { lubecRuleWarnings, type LubecRuleWarning } from '../ruleSets/lubec/ruleChecks'
import type { LubecSheet } from '../ruleSets/lubec/sheet'
import { withFreeSkill, withPickToggled, type LubecSkills } from '../ruleSets/lubec/skillPicks'
import type { LubecSkillText } from '../ruleSets/lubec/skillText'
import { LUBEC_EXPERT_PREREQUISITES, LUBEC_SKILL_TREE_ROWS, lubecSkill } from '../ruleSets/lubec/skills'

// The combined prototype's skill tree, read for the Skills page: its two
// columns, what each skill leads to, the dot and free-chip clicks, the class
// package's progress, and the wires from each Trained skill to the Experts it
// unlocks.

const present = (name: string | null): name is string => name !== null

/** The Trained column top to bottom, as the tree lays it out. */
export const LUBEC_TREE_TRAINED: readonly string[] = LUBEC_SKILL_TREE_ROWS.map(([trained]) => trained).filter(present)

/** The Expert column top to bottom, as the tree lays it out. */
export const LUBEC_TREE_EXPERT: readonly string[] = LUBEC_SKILL_TREE_ROWS.map(([, expert]) => expert).filter(present)

/** The Experts a skill is a prerequisite of, in the skill data's order. */
export function lubecLeadsTo(name: string): string[] {
  return Object.entries(LUBEC_EXPERT_PREREQUISITES).filter(([, prerequisites]) => prerequisites.includes(name)).map(([expert]) => expert)
}

/** The skill, what it needs and what it leads to: what lights up when its name is chosen. */
export function lubecRelatedSkills(name: string): Set<string> {
  return new Set([name, ...(lubecSkill(name)?.prerequisites ?? []), ...lubecLeadsTo(name)])
}

/**
 * What a dot click does, as the prototype's toggleSkill without its blocks: the
 * free class skill's dot clears it, the first dot taken from the class's free
 * list while none is chosen becomes the free class skill, and any other dot
 * toggles a pick.
 */
export function withDotClicked(skills: LubecSkills, name: string, freeList: readonly string[]): LubecSkills {
  if (name === skills.free) return withFreeSkill(skills, null)
  if (skills.free === null && freeList.includes(name) && !skills.picked.includes(name)) return withFreeSkill(skills, name)
  return withPickToggled(skills, name)
}

/** A free chip chooses its skill as the free class skill, or clears it when it already is. */
export function withFreeChipClicked(skills: LubecSkills, name: string): LubecSkills {
  return withFreeSkill(skills, name === skills.free ? null : name)
}

/** The picks beside the free class skill, counted by tier; names the skill data does not know count for nothing. */
export function lubecPickCounts(skills: LubecSkills): LubecPackageShape {
  const tiers = [...new Set(skills.picked)].filter((name) => name !== skills.free).map((name) => lubecSkill(name)?.tier)
  return { trained: tiers.filter((tier) => tier === 'Trained').length, expert: tiers.filter((tier) => tier === 'Expert').length }
}

/** "1 Expert + 1 Trained", Expert first, as the prototype's package counter reads. */
export function lubecShapeLabel(shape: LubecPackageShape): string {
  return [shape.expert && `${shape.expert} Expert`, shape.trained && `${shape.trained} Trained`].filter(Boolean).join(' + ')
}

/**
 * Each class's package in the prototype's words, read after its "Bonus:". The
 * Nerd's follows the grilling decision (the free class skill, 1 Trained and 2
 * Expert) rather than the standalone sheet's 2 Expert.
 */
export const LUBEC_PACKAGE_RULES: Readonly<Record<LubecClassKey, string>> = {
  working: "1 Trained and 1 Expert. Your family's work goes here.",
  nerd: '1 Trained and 2 Expert. Each Expert needs one of its prerequisites among your Trained skills, the free class skill included.',
  tough: '1 Expert or 2 Trained.',
  scout: '1 Expert or 2 Trained.',
  popular: '1 Expert or 2 Trained.',
}

/** The shapes a class's picks may take, as "1 Expert or 2 Trained". */
export function lubecPackageTarget(definition: LubecClass): string {
  return definition.skillPackage.shapes.map(lubecShapeLabel).join(' or ')
}

/** The rule warnings the Skills page answers, by code: the same ones the Finalize dialog lists. */
export function lubecSkillWarningCodes(sheet: LubecSheet): Set<LubecRuleWarning['code']> {
  return new Set(lubecRuleWarnings(sheet).map((warning) => warning.code))
}

const PACKAGE_CODES: readonly LubecRuleWarning['code'][] = ['free-skill', 'package', 'prerequisite']

/** The prototype's package progress line under the detail bar; null while the class is a hole. */
export function lubecPackageProgress(sheet: LubecSheet): string | null {
  const definition = lubecClass(sheet.class.key)
  if (!definition) return null
  const codes = lubecSkillWarningCodes(sheet)
  if (!PACKAGE_CODES.some((code) => codes.has(code))) return 'Package complete'
  if (sheet.skills.free === null) return 'Choose your free class skill'
  const picked = lubecShapeLabel(lubecPickCounts(sheet.skills))
  return picked ? `Picked ${picked} of ${lubecPackageTarget(definition)}` : `Pick ${lubecPackageTarget(definition)}`
}

/** "Always have: ... / Kit: ...", or null for a skill with neither. */
export function lubecKitLine(text: LubecSkillText): string | null {
  const parts = [text.always && `Always have: ${text.always}`, text.kit.length > 0 && `Kit: ${text.kit.join(', ')}`].filter(Boolean)
  return parts.length > 0 ? parts.join(' / ') : null
}

/** The detail bar's mark for the character's own skill: its class skill or one of its picks. */
export function lubecDetailTag(skills: LubecSkills, name: string): string | null {
  if (name === skills.free) return 'Class skill'
  return skills.picked.includes(name) ? 'Chosen' : null
}

/** The character's stored skill names the tree does not have, which count for nothing. */
export function lubecUnknownSkills(skills: LubecSkills): string[] {
  return [skills.free, ...skills.picked].filter(present).filter((name) => lubecSkill(name) === null)
}

/** Where a skill's dot and label sit inside the tree, in pixels from its top left corner. */
export type LubecNodePosition = { y: number; dotLeft: number; labelRight: number }

/** One wire from a Trained skill to an Expert it unlocks, as an SVG path. */
export type LubecWire = { source: string; target: string; d: string }

const WIRE_RADIUS = 5

// A straight wire when the two sit level, a square step when they are too close
// for the rounded corners, and otherwise down the source's lane with rounded corners.
function wirePath(from: LubecNodePosition, to: LubecNodePosition, lane: number): string {
  const sx = from.labelRight + 6
  const sy = from.y
  const ex = to.dotLeft - 3
  const ey = to.y
  if (Math.abs(ey - sy) < 1) return `M${sx},${sy} H${ex}`
  if (Math.abs(ey - sy) < 2 * WIRE_RADIUS + 1) return `M${sx},${sy} H${lane} V${ey} H${ex}`
  const direction = ey > sy ? 1 : -1
  return `M${sx},${sy} H${lane - WIRE_RADIUS} Q${lane},${sy} ${lane},${sy + direction * WIRE_RADIUS} `
    + `V${ey - direction * WIRE_RADIUS} Q${lane},${ey} ${lane + WIRE_RADIUS},${ey} H${ex}`
}

// Each Trained skill that leads anywhere gets its own vertical lane, spread
// evenly between the widest Trained label and the leftmost Expert dot.
function wireLanes(positions: Readonly<Record<string, LubecNodePosition>>): Map<string, number> {
  const sources = LUBEC_TREE_TRAINED.filter((name) => lubecLeadsTo(name).length > 0)
  const left = Math.max(...LUBEC_TREE_TRAINED.map((name) => positions[name].labelRight)) + 14
  const right = Math.min(...LUBEC_TREE_EXPERT.map((name) => positions[name].dotLeft)) - 18
  const step = Math.max(3, (right - left) / Math.max(1, sources.length - 1))
  return new Map(sources.map((name, index) => [name, left + index * step]))
}

/** The prototype's drawWires: every wire on the tree, for nodes placed at `positions`. */
export function lubecWires(positions: Readonly<Record<string, LubecNodePosition>>): LubecWire[] {
  const lanes = wireLanes(positions)
  return LUBEC_TREE_EXPERT.flatMap((target) => LUBEC_EXPERT_PREREQUISITES[target].map((source) => ({
    source,
    target,
    d: wirePath(positions[source], positions[target], lanes.get(source) ?? 0),
  })))
}
