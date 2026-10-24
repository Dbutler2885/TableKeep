import { describe, expect, it } from 'vitest'
import { chosenStat, LUBEC_CLASSES, lubecClass } from './classes'

describe('Lubec classes', () => {
  it('has the five classes, the Overachiever under the key scout', () => {
    expect(Object.values(LUBEC_CLASSES).map(({ key, name }) => [key, name])).toEqual([
      ['working', 'Working Kid'],
      ['nerd', 'Nerd'],
      ['tough', 'Tough'],
      ['scout', 'Overachiever'],
      ['popular', 'Popular Kid'],
    ])
  })

  it('carries each class’s Stat and Save modifiers', () => {
    expect(LUBEC_CLASSES.working.modifiers).toEqual({
      Strength: 5, Speed: 5, Intellect: 5, Handle: 5, Charm: 5, Sanity: 10, Fear: 10, Body: 10,
    })
    expect(LUBEC_CLASSES.nerd.modifiers).toEqual({ Intellect: 20, Sanity: 30 })
    expect(LUBEC_CLASSES.tough.modifiers).toEqual({ Strength: 10, Body: 10, Fear: 20 })
    expect(LUBEC_CLASSES.scout.modifiers).toEqual({ Intellect: 10, Fear: 60 })
    expect(LUBEC_CLASSES.popular.modifiers).toEqual({ Charm: 20, Fear: 20 })
  })

  it('offers the Nerd and Popular Kid a Stat taking -10 and the Overachiever a Stat gaining +5', () => {
    const choices = Object.fromEntries(Object.values(LUBEC_CLASSES).map(({ key, choice }) => [key, choice]))
    expect(choices).toEqual({
      working: null,
      nerd: { field: 'statPenalty', label: 'Stat taking -10', amount: -10, options: ['Strength', 'Speed', 'Handle', 'Charm'] },
      tough: null,
      scout: { field: 'statBonus', label: 'Stat gaining +5', amount: 5, options: ['Strength', 'Speed', 'Handle', 'Charm'] },
      popular: { field: 'statPenalty', label: 'Stat taking -10', amount: -10, options: ['Strength', 'Speed', 'Intellect', 'Handle'] },
    })
  })

  it('carries each Trauma Response and the class rule text', () => {
    expect(Object.values(LUBEC_CLASSES).map(({ traumaResponse }) => traumaResponse.name)).toEqual([
      'Steady Under Pressure',
      'Failed Sanity Spreads Stress',
      'Your Panic Triggers Fear',
      'Your Success Raises the Stakes',
      'Everyone Looks to You',
    ])
    expect(LUBEC_CLASSES.working.traumaResponse.text).toBe('Once per session, you may take Advantage on a Panic Check.')
    expect(Object.values(LUBEC_CLASSES).map(({ classRule }) => classRule)).toEqual([
      null, null, null, 'Failed Stat Checks give +2 Stress instead of +1.', null,
    ])
  })

  it('calls for a Death Save at 5 Trauma for a Tough and 4 otherwise', () => {
    expect(Object.values(LUBEC_CLASSES).map(({ key, deathSaveTrauma }) => [key, deathSaveTrauma])).toEqual([
      ['working', 4], ['nerd', 4], ['tough', 5], ['scout', 4], ['popular', 4],
    ])
  })

  it('gives the Overachiever 2 Stress on a failed Stat Check and everyone else 1', () => {
    expect(Object.values(LUBEC_CLASSES).map(({ key, failedStatCheckStress }) => [key, failedStatCheckStress])).toEqual([
      ['working', 1], ['nerd', 1], ['tough', 1], ['scout', 2], ['popular', 1],
    ])
  })

  it('carries each class package, with the Nerd’s changed one', () => {
    const packages = Object.fromEntries(Object.values(LUBEC_CLASSES).map(({ key, skillPackage }) => [key, skillPackage]))
    const oneExpertOrTwoTrained = [{ trained: 0, expert: 1 }, { trained: 2, expert: 0 }]
    expect(packages).toEqual({
      working: { free: ['Boatwork', 'Jury-Rigging', 'Tides & Flats'], shapes: [{ trained: 1, expert: 1 }] },
      nerd: { free: ['Electronics & Radio', 'Science', 'History & Geography'], shapes: [{ trained: 1, expert: 2 }] },
      tough: { free: ['Scrapping', 'Athletics', 'Tough Talk'], shapes: oneExpertOrTwoTrained },
      scout: { free: ['Campcraft', 'First Aid', "Teacher's Pet"], shapes: oneExpertOrTwoTrained },
      popular: { free: ['Athletics', 'Art', 'Music', 'Class Clown', "Teacher's Pet"], shapes: oneExpertOrTwoTrained },
    })
  })

  it('reads a stored key, and a missing or unknown key as no class', () => {
    expect(lubecClass('scout')?.name).toBe('Overachiever')
    expect(lubecClass(null)).toBeNull()
    expect(lubecClass('wizard')).toBeNull()
    expect(lubecClass('toString')).toBeNull()
  })

  it('reads a class choice only when it is on the class’s list', () => {
    const penalty = LUBEC_CLASSES.nerd.choice!
    expect(chosenStat(penalty, { statPenalty: 'Speed' })).toBe('Speed')
    expect(chosenStat(penalty, { statPenalty: 'Intellect' })).toBeNull()
    expect(chosenStat(penalty, { statPenalty: null })).toBeNull()
    expect(chosenStat(penalty, { statBonus: 'Speed' })).toBeNull()
  })
})
