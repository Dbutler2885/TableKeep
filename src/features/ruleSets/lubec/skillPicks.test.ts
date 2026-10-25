import { describe, expect, it } from 'vitest'
import {
  lubecFreeSkillOptions,
  lubecSkillMark,
  lubecTakenSkills,
  withFreeSkill,
  withPickToggled,
} from './skillPicks'

describe('Lubec skill picks', () => {
  it('marks the free class skill, the picks, and nothing else', () => {
    const skills = { free: 'Boatwork', picked: ['Swimming', 'Diving'] }

    expect(lubecSkillMark(skills, 'Boatwork')).toBe('free')
    expect(lubecSkillMark(skills, 'Diving')).toBe('picked')
    expect(lubecSkillMark(skills, 'Science')).toBeNull()
  })

  it('adds a pick at the end and takes an existing one out, keeping every other stored field', () => {
    const skills = { free: 'Boatwork', picked: ['Swimming', 'Knot Tying'], note: 'kept' }

    expect(withPickToggled(skills, 'Diving')).toEqual({ free: 'Boatwork', picked: ['Swimming', 'Knot Tying', 'Diving'], note: 'kept' })
    expect(withPickToggled(skills, 'Swimming')).toEqual({ free: 'Boatwork', picked: ['Knot Tying'], note: 'kept' })
  })

  it('lets any skill be picked, whatever the class package or prerequisites say', () => {
    expect(withPickToggled({ free: null, picked: [] }, 'Firearms').picked).toEqual(['Firearms'])
  })

  it('sets or clears the free class skill, and a skill made free stops being a pick', () => {
    const skills = { free: 'Science', picked: ['Electronics & Radio', 'A/V Club'] }

    expect(withFreeSkill(skills, 'Electronics & Radio')).toEqual({ free: 'Electronics & Radio', picked: ['A/V Club'] })
    expect(withFreeSkill(skills, null)).toEqual({ free: null, picked: ['Electronics & Radio', 'A/V Club'] })
  })

  it('offers the class\'s free list, plus a stored free skill that is not on it', () => {
    expect(lubecFreeSkillOptions('nerd', null)).toEqual(['Electronics & Radio', 'Science', 'History & Geography'])
    expect(lubecFreeSkillOptions('nerd', 'Science')).toEqual(['Electronics & Radio', 'Science', 'History & Geography'])
    expect(lubecFreeSkillOptions('working', 'Knot Tying')).toEqual(['Boatwork', 'Jury-Rigging', 'Tides & Flats', 'Knot Tying'])
    expect(lubecFreeSkillOptions(null, null)).toEqual([])
    expect(lubecFreeSkillOptions('wizard', 'Science')).toEqual(['Science'])
  })

  it('lists the free class skill first and each pick with its tier and bonus, an unknown name with neither', () => {
    expect(lubecTakenSkills({ free: 'Boatwork', picked: ['Diving', 'Knot Tying'] })).toEqual([
      { name: 'Boatwork', free: true, tier: 'Trained', bonus: 10 },
      { name: 'Diving', free: false, tier: 'Expert', bonus: 15 },
      { name: 'Knot Tying', free: false, tier: null, bonus: null },
    ])
    expect(lubecTakenSkills({ free: null, picked: [] })).toEqual([])
  })
})
