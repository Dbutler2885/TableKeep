import { describe, expect, it } from 'vitest'
import { LUBEC_CLASSES } from '../ruleSets/lubec/classes'
import { lubecFreeSkillLine, lubecModifierBars } from './lubecClassCards'

describe('Lubec class cards', () => {
  it('prints each class\'s modifier bars as the prototype does: Stats, the choice, then Saves', () => {
    expect(Object.values(LUBEC_CLASSES).map(lubecModifierBars)).toEqual([
      ['+5 all Stats', '+10 all Saves'],
      ['+20 Intellect', '-10 one other Stat', '+30 Sanity'],
      ['+10 Strength', '+10 Body', '+20 Fear'],
      ['+10 Intellect', '+5 one other Stat', '+60 Fear'],
      ['+20 Charm', '-10 one other Stat', '+20 Fear'],
    ])
  })

  it('names the free skills and the picks beside them, with the Nerd\'s from the grilling decision', () => {
    expect(Object.values(LUBEC_CLASSES).map(lubecFreeSkillLine)).toEqual([
      'Free skill: Boatwork, Jury-Rigging or Tides & Flats + 1 Trained and 1 Expert',
      'Free skill: Electronics & Radio, Science or History & Geography + 1 Trained and 2 Expert, each Expert with a Trained prerequisite',
      'Free skill: Scrapping, Athletics or Tough Talk + 1 Expert or 2 Trained',
      "Free skill: Campcraft, First Aid or Teacher's Pet + 1 Expert or 2 Trained",
      "Free skill: Athletics, Art, Music, Class Clown or Teacher's Pet + 1 Expert or 2 Trained",
    ])
  })
})
