import { describe, expect, it } from 'vitest'
import { classOptions, levelUpChecklistForClass, unlockedClassFeaturesForClass } from './characterClassData'

describe('character class data', () => {
  it.each([
    ['Cleric', 'cleric spell access'],
    ['Magic-User', 'spell slots'],
    ['Thief', 'thief skills'],
    ['Fighter', 'attack profile'],
    ['Elf', 'race-class abilities'],
  ])('preserves the %s level-up checklist', (className, phrase) => {
    expect(levelUpChecklistForClass(className, 6).join(' ')).toContain(phrase)
  })

  it('filters class features by unlocked level', () => {
    expect(unlockedClassFeaturesForClass('Thief', 3).map((feature) => feature.id)).not.toContain('read-languages')
    expect(unlockedClassFeaturesForClass('Thief', 4).map((feature) => feature.id)).toContain('read-languages')
    expect(classOptions).toContain('Magic-User')
  })
})
