import { describe, expect, it } from 'vitest'
import {
  VTM_ABILITIES,
  VTM_BACKGROUNDS,
  VTM_CLANS,
  VTM_GENERATIONS,
  VTM_VIRTUES,
  isVtmInClanDiscipline,
  vtmBloodPoolMax,
  vtmClanDisciplines,
  vtmClanWeakness,
} from './vtmRuleset'

describe('vtmRuleset', () => {
  it('resolves supplied clan disciplines and weaknesses', () => {
    expect(vtmClanDisciplines('brujah')).toEqual(['Celerity', 'Potence', 'Presence'])
    expect(vtmClanDisciplines('gangrel')).toEqual(['Animalism', 'Fortitude', 'Protean'])
    expect(vtmClanDisciplines('malkavian')).toEqual(['Auspex', 'Dominate', 'Obfuscate'])
    expect(vtmClanDisciplines('nosferatu')).toEqual(['Animalism', 'Obfuscate', 'Potence'])
    expect(vtmClanDisciplines('toreador')).toEqual(['Auspex', 'Celerity', 'Presence'])
    expect(vtmClanDisciplines('tremere')).toEqual(['Auspex', 'Dominate', 'Thaumaturgy'])
    expect(vtmClanDisciplines('ventrue')).toEqual(['Dominate', 'Fortitude', 'Presence'])
    expect(vtmClanDisciplines('caitiff')).toEqual([])
    expect(vtmClanWeakness('nosferatu')).toContain('Appearance 0')
    expect(vtmClanWeakness('caitiff')).toBe('No clan weakness.')
    expect(VTM_CLANS).toHaveLength(8)
  })

  it('resolves supplied generation blood pool maximums', () => {
    expect(VTM_GENERATIONS.map((entry) => [entry.value, vtmBloodPoolMax(entry.value)])).toEqual([
      ['13th', 10],
      ['12th', 11],
      ['11th', 12],
      ['10th', 13],
      ['9th', 14],
      ['8th', 15],
      ['7th', 20],
      ['6th', 30],
      ['5th', 40],
      ['4th', 50],
      ['3rd', null],
    ])
  })

  it('classifies clan and non-clan disciplines including Caitiff', () => {
    expect(isVtmInClanDiscipline('brujah', 'Celerity')).toBe(true)
    expect(isVtmInClanDiscipline('brujah', 'Animalism')).toBe(false)
    expect(isVtmInClanDiscipline('caitiff', 'Celerity')).toBe(false)
    expect(isVtmInClanDiscipline(null, 'Celerity')).toBe(false)
  })

  it('exports the supplied ability, background, and virtue lists', () => {
    expect(VTM_ABILITIES.talents).toEqual(['Acting', 'Alertness', 'Athletics', 'Brawl', 'Dodge', 'Empathy', 'Intimidation', 'Leadership', 'Streetwise', 'Subterfuge'])
    expect(VTM_ABILITIES.skills).toEqual(['Animal Ken', 'Drive', 'Etiquette', 'Firearms', 'Melee', 'Music', 'Repair', 'Security', 'Stealth', 'Survival'])
    expect(VTM_ABILITIES.knowledges).toEqual(['Bureaucracy', 'Computer', 'Finance', 'Investigation', 'Law', 'Linguistics', 'Medicine', 'Occult', 'Politics', 'Science'])
    expect([...VTM_BACKGROUNDS]).toEqual(['Allies', 'Contacts', 'Fame', 'Generation', 'Herd', 'Influence', 'Mentor', 'Resources', 'Retainers', 'Status'])
    expect([...VTM_VIRTUES]).toEqual(['Conscience', 'Self-Control', 'Courage'])
  })
})
