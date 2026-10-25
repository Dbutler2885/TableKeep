import { describe, expect, it } from 'vitest'
import { LUBEC_SKILL_TEXT, lubecSkillText } from './skillText'
import { LUBEC_EXPERT_PREREQUISITES, LUBEC_TRAINED_SKILLS } from './skills'

describe('Lubec skill text', () => {
  it('has words for exactly the skills the skill data knows', () => {
    const known = [...LUBEC_TRAINED_SKILLS, ...Object.keys(LUBEC_EXPERT_PREREQUISITES)]

    expect(Object.keys(LUBEC_SKILL_TEXT).sort()).toEqual(known.sort())
  })

  it('gives a skill its description, what it always comes with, and its kit', () => {
    expect(lubecSkillText('Slingshot / Archery')).toEqual({
      description: 'Skilled use of bows, slingshots, and similar practical ranged weapons a woods kid might realistically practice with.',
      always: 'A Wrist-Rocket slingshot',
      kit: ['A recurve bow', 'A quiver of target arrows', 'Broadhead tips', 'A compound bow', 'A crossbow'],
    })
    expect(lubecSkillText('Swimming')).toMatchObject({ always: null, kit: [] })
  })

  it('has no words for a name the skill data does not know', () => {
    expect(lubecSkillText('Knot Tying')).toBeNull()
  })
})
