import { describe, expect, it } from 'vitest'
import {
  isFightingOrShootingSkill,
  LUBEC_EXPERT_PREREQUISITES,
  LUBEC_FIGHTING_OR_SHOOTING_SKILLS,
  LUBEC_SKILL_TREE_ROWS,
  LUBEC_TRAINED_SKILLS,
  lubecSkill,
  lubecSkillBonus,
  lubecSkillTier,
} from './skills'

const expertNames = Object.keys(LUBEC_EXPERT_PREREQUISITES)

describe('Lubec skill data', () => {
  it('holds 27 distinct Trained and 27 distinct Expert skills', () => {
    expect(new Set(LUBEC_TRAINED_SKILLS).size).toBe(27)
    expect(expertNames).toHaveLength(27)
    expect(expertNames.filter((name) => LUBEC_TRAINED_SKILLS.includes(name))).toEqual([])
  })

  it('gives every Expert at least one prerequisite, each of them a Trained skill', () => {
    for (const [name, prerequisites] of Object.entries(LUBEC_EXPERT_PREREQUISITES)) {
      expect(prerequisites.length, name).toBeGreaterThan(0)
      expect(prerequisites.filter((prerequisite) => !LUBEC_TRAINED_SKILLS.includes(prerequisite)), name).toEqual([])
    }
  })

  it('lets Breaking & Entering hang off Light on Your Feet, Tough Talk or Sleight of Hand', () => {
    expect(lubecSkill('Breaking & Entering')?.prerequisites).toEqual(['Light on Your Feet', 'Tough Talk', 'Sleight of Hand'])
  })

  it('draws every skill once in the tree, Trained on the left and Expert on the right', () => {
    const left = LUBEC_SKILL_TREE_ROWS.map(([trained]) => trained).filter((name) => name !== null)
    const right = LUBEC_SKILL_TREE_ROWS.map(([, expert]) => expert).filter((name) => name !== null)
    expect([...left].sort()).toEqual([...LUBEC_TRAINED_SKILLS].sort())
    expect([...right].sort()).toEqual([...expertNames].sort())
  })

  it('reads tier and bonus by name', () => {
    expect([lubecSkillTier('Swimming'), lubecSkillBonus('Swimming')]).toEqual(['Trained', 10])
    expect([lubecSkillTier('Diving'), lubecSkillBonus('Diving')]).toEqual(['Expert', 15])
    expect(lubecSkill('Diving')).toEqual({ name: 'Diving', tier: 'Expert', prerequisites: ['Swimming', 'Tides & Flats'] })
    expect(lubecSkill('Swimming')?.prerequisites).toEqual([])
  })

  it('reads a name the data does not know, or no name, as no skill', () => {
    expect([lubecSkill('Basket Weaving'), lubecSkillTier('Basket Weaving'), lubecSkillBonus('Basket Weaving')]).toEqual([null, null, null])
    expect([lubecSkill(null), lubecSkillBonus(null)]).toEqual([null, null])
  })
})

describe('the fighting-or-shooting declaration', () => {
  it('marks Scrapping, Boxing, Firearms and Slingshot / Archery', () => {
    expect([...LUBEC_FIGHTING_OR_SHOOTING_SKILLS].sort()).toEqual(['Boxing', 'Firearms', 'Scrapping', 'Slingshot / Archery'])
    expect(['Scrapping', 'Boxing', 'Firearms', 'Slingshot / Archery'].every(isFightingOrShootingSkill)).toBe(true)
  })

  it('leaves Hunting and Throwing Arm unmarked', () => {
    expect(isFightingOrShootingSkill('Hunting')).toBe(false)
    expect(isFightingOrShootingSkill('Throwing Arm')).toBe(false)
  })

  it('names only skills the data knows', () => {
    expect([...LUBEC_FIGHTING_OR_SHOOTING_SKILLS].filter((name) => lubecSkill(name) === null)).toEqual([])
  })
})
