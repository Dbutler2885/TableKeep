import { describe, expect, it } from 'vitest'
import { lubecRuleWarnings, type LubecRuleWarningCode } from './ruleChecks'
import type { LubecSheet } from './sheet'
import { lubecSheet, tommyEves } from './sheetFixtures'

const tommyBase = tommyEves().base
const codes = (sheet: LubecSheet): LubecRuleWarningCode[] => lubecRuleWarnings(sheet).map(({ code }) => code)
const skills = (free: string | null, ...picked: string[]) => ({ skills: { free, picked } })

describe('Lubec rule checks', () => {
  it('find nothing wrong with Tommy Eves', () => {
    expect(lubecRuleWarnings(tommyEves())).toEqual([])
  })

  it('accept the Nerd package: free + 1 Trained + 2 Expert, one Expert hanging off the chosen Trained skill', () => {
    const nerd = lubecSheet({
      class: { key: 'nerd', choices: { statPenalty: 'Handle' } },
      ...skills('Electronics & Radio', 'Hunting', 'A/V Club', 'Firearms'),
    })
    expect(lubecRuleWarnings(nerd)).toEqual([])
  })

  it('hold the Nerd to the changed package, not the standalone sheet’s free + 2 Expert', () => {
    const nerd = lubecSheet({
      class: { key: 'nerd', choices: { statPenalty: 'Handle' } },
      ...skills('Electronics & Radio', 'A/V Club', 'Science Fair Champ'),
    })
    expect(lubecRuleWarnings(nerd)).toEqual([
      { code: 'package', message: 'The Nerd picks 1 Trained and 2 Expert beside the free class skill.' },
    ])
  })

  it('accept either shape of a one-Expert-or-two-Trained package', () => {
    const tough = { class: { key: 'tough', choices: {} } }
    expect(lubecRuleWarnings(lubecSheet({ ...tough, ...skills('Scrapping', 'Boxing') }))).toEqual([])
    expect(lubecRuleWarnings(lubecSheet({ ...tough, ...skills('Scrapping', 'Fibbing', 'Art') }))).toEqual([])
    expect(lubecRuleWarnings(lubecSheet({ ...tough, ...skills('Scrapping', 'Fibbing') }))).toEqual([
      { code: 'package', message: 'The Tough picks 1 Expert or 2 Trained beside the free class skill.' },
    ])
  })

  it('let a character pick more skills than its package, silently', () => {
    const tough = { class: { key: 'tough', choices: {} } }
    expect(lubecRuleWarnings(lubecSheet({ ...tough, ...skills('Scrapping', 'Boxing', 'Fibbing', 'Art') }))).toEqual([])
    expect(lubecRuleWarnings(lubecSheet(skills('Boatwork', 'Swimming', 'Diving', 'Fibbing', 'Art')))).toEqual([])
    const nerd = lubecSheet({
      class: { key: 'nerd', choices: { statPenalty: 'Handle' } },
      ...skills('Electronics & Radio', 'Hunting', 'Science', 'A/V Club', 'Firearms', 'Science Fair Champ'),
    })
    expect(lubecRuleWarnings(nerd)).toEqual([])
  })

  it('still warn when extra picks leave a tier of the package short', () => {
    const nerd = lubecSheet({
      class: { key: 'nerd', choices: { statPenalty: 'Handle' } },
      ...skills('Electronics & Radio', 'A/V Club', 'Science Fair Champ', 'Treasure Hunting'),
    })
    expect(lubecRuleWarnings(nerd)).toEqual([
      { code: 'package', message: 'The Nerd picks 1 Trained and 2 Expert beside the free class skill.' },
    ])
  })

  it('warn about a missing or unknown class key', () => {
    expect(lubecRuleWarnings(lubecSheet({ class: { key: null, choices: {} } }))).toEqual([
      { code: 'class', message: 'No class is chosen.' },
    ])
    expect(lubecRuleWarnings(lubecSheet({ class: { key: 'wizard', choices: {} } }))).toEqual([
      { code: 'class', message: '"wizard" is not a Lubec class.' },
    ])
  })

  it('warn about a missing or invalid class choice', () => {
    const popular = (statPenalty?: string | null) => lubecSheet({
      class: { key: 'popular', choices: { statPenalty } },
      ...skills('Art', 'Photography'),
    })
    const message = 'The Popular Kid needs a Stat taking -10: Strength, Speed, Intellect or Handle.'
    expect(lubecRuleWarnings(popular())).toEqual([{ code: 'class-choice', message }])
    expect(lubecRuleWarnings(popular('Charm'))).toEqual([{ code: 'class-choice', message }])
    expect(lubecRuleWarnings(popular('Speed'))).toEqual([])
    expect(codes(lubecSheet({ class: { key: 'scout', choices: {} }, ...skills('First Aid', 'Field Medicine') }))).toEqual(['class-choice'])
  })

  it('warn about a missing or non-whole base value', () => {
    expect(lubecRuleWarnings(lubecSheet({ base: { ...tommyBase, Speed: null, Body: 20.5 } }))).toEqual([
      { code: 'base-value', message: 'Speed has no whole-number base value.' },
      { code: 'base-value', message: 'Body has no whole-number base value.' },
    ])
  })

  it('warn about a base value guided roll-up cannot produce: Stats 21 to 60, Saves 12 to 30', () => {
    const edges = { ...tommyBase, Strength: 21, Speed: 60, Sanity: 12, Fear: 30 }
    expect(lubecRuleWarnings(lubecSheet({ base: edges }))).toEqual([])
    expect(lubecRuleWarnings(lubecSheet({ base: { ...tommyBase, Strength: 20, Charm: 61, Sanity: 11, Body: 31 } }))).toEqual([
      { code: 'base-range', message: 'Strength base 20 is outside what guided roll-up can produce (21 to 60).' },
      { code: 'base-range', message: 'Charm base 61 is outside what guided roll-up can produce (21 to 60).' },
      { code: 'base-range', message: 'Sanity base 11 is outside what guided roll-up can produce (12 to 30).' },
      { code: 'base-range', message: 'Body base 31 is outside what guided roll-up can produce (12 to 30).' },
    ])
  })

  it('warn about a free skill missing or not on the class’s free list', () => {
    expect(lubecRuleWarnings(lubecSheet(skills('Swimming', 'Hunting', 'Diving')))).toEqual([
      { code: 'free-skill', message: 'Swimming is not on the Working Kid free list (Boatwork, Jury-Rigging or Tides & Flats).' },
    ])
    expect(lubecRuleWarnings(lubecSheet(skills(null, 'Swimming', 'Diving')))).toEqual([
      { code: 'free-skill', message: 'No free class skill is chosen.' },
    ])
  })

  it('warn about an unknown skill, which counts for nothing', () => {
    expect(lubecRuleWarnings(lubecSheet(skills('Boatwork', 'Swimming', 'Diving', 'Basket Weaving')))).toEqual([
      { code: 'unknown-skill', message: '"Basket Weaving" is not a Lubec skill.' },
    ])
  })

  it('warn about a repeated skill, counted once', () => {
    expect(lubecRuleWarnings(lubecSheet(skills('Boatwork', 'Swimming', 'Diving', 'Swimming')))).toEqual([
      { code: 'repeated-skill', message: 'Swimming is taken more than once.' },
    ])
    expect(codes(lubecSheet(skills('Boatwork', 'Boatwork', 'Swimming', 'Diving')))).toEqual(['repeated-skill'])
  })

  it('warn about picks that do not fit the class package', () => {
    expect(lubecRuleWarnings(lubecSheet(skills('Boatwork', 'Swimming')))).toEqual([
      { code: 'package', message: 'The Working Kid picks 1 Trained and 1 Expert beside the free class skill.' },
    ])
  })

  it('warn about an Expert with none of its prerequisites', () => {
    expect(lubecRuleWarnings(lubecSheet(skills('Boatwork', 'Swimming', 'Breaking & Entering')))).toEqual([
      { code: 'prerequisite', message: 'Breaking & Entering needs Light on Your Feet, Tough Talk or Sleight of Hand.' },
    ])
    expect(lubecRuleWarnings(lubecSheet(skills('Boatwork', 'Swimming', 'Field Medicine')))).toEqual([
      { code: 'prerequisite', message: 'Field Medicine needs First Aid.' },
    ])
  })

  it('still check skill names and prerequisites when the class is missing', () => {
    expect(codes(lubecSheet({ class: { key: null, choices: {} }, ...skills('Boatwork', 'Firearms', 'Nope') }))).toEqual([
      'class', 'unknown-skill', 'prerequisite',
    ])
  })
})
