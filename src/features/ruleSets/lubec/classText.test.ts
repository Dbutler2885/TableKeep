import { describe, expect, it } from 'vitest'
import { LUBEC_CLASSES } from './classes'
import { lubecClassModifierText } from './classText'

describe('a class\'s modifiers in words', () => {
  it('names one amount on every Stat or Save once, and each other modifier by its value, the choice last', () => {
    expect(Object.values(LUBEC_CLASSES).map(lubecClassModifierText)).toEqual([
      '+5 every Stat, +10 every Save',
      '+20 Intellect, +30 Sanity, -10 to one of Strength, Speed, Handle or Charm',
      '+10 Strength, +20 Fear, +10 Body',
      '+10 Intellect, +60 Fear, +5 to one of Strength, Speed, Handle or Charm',
      '+20 Charm, +20 Fear, -10 to one of Strength, Speed, Intellect or Handle',
    ])
  })
})
