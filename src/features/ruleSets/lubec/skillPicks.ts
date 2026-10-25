import { lubecClass } from './classes'
import type { LubecSheet } from './sheet'
import { lubecSkillBonus, lubecSkillTier, type LubecSkillTier } from './skills'

// How the Skills page changes a character's skills in creation. Only names
// are stored; nothing here refuses a pick, because the class package and the
// prerequisites are Finalize warnings, never blocks.

export type LubecSkills = LubecSheet['skills']

/** Where a skill sits on a character: its free class skill, one of its picks, or neither. */
export type LubecSkillMark = 'free' | 'picked' | null

/** A skill the character has, with its tier and bonus read from the skill data; both are null for a name the data does not know. */
export type LubecTakenSkill = { name: string; free: boolean; tier: LubecSkillTier | null; bonus: number | null }

export function lubecSkillMark(skills: LubecSkills, name: string): LubecSkillMark {
  if (name === skills.free) return 'free'
  return skills.picked.includes(name) ? 'picked' : null
}

/** The skills with `name` added to the picks, or taken out of them when it is already picked. */
export function withPickToggled(skills: LubecSkills, name: string): LubecSkills {
  const picked = skills.picked.includes(name) ? skills.picked.filter((pick) => pick !== name) : [...skills.picked, name]
  return { ...skills, picked }
}

/** The skills with `name` as the free class skill (null for none); a skill that becomes free stops being a pick. */
export function withFreeSkill(skills: LubecSkills, name: string | null): LubecSkills {
  return { ...skills, free: name, picked: skills.picked.filter((pick) => pick !== name) }
}

/** What the free class skill can be: the class's free list, and the stored skill too when it is not on that list. */
export function lubecFreeSkillOptions(classKey: string | null, free: string | null): string[] {
  const list = lubecClass(classKey)?.skillPackage.free ?? []
  return free === null || list.includes(free) ? [...list] : [...list, free]
}

const takenSkill = (name: string, free: boolean): LubecTakenSkill =>
  ({ name, free, tier: lubecSkillTier(name), bonus: lubecSkillBonus(name) })

/** The character's skills, the free class skill first, then the picks as stored. */
export function lubecTakenSkills(skills: LubecSkills): LubecTakenSkill[] {
  const free = skills.free === null ? [] : [takenSkill(skills.free, true)]
  return [...free, ...skills.picked.map((name) => takenSkill(name, false))]
}
