import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { importRules, parseRulesPage } from './fetch-rules.mjs'

const directory = new URL('../../docs/rules/ose-classic/', import.meta.url)
const corpus = JSON.parse(readFileSync(new URL('corpus.json', directory), 'utf8'))
const license = readFileSync(new URL('OGL.txt', directory), 'utf8')

function page(title) {
  const match = corpus.pages.find(page => page.title === title)
  expect(match, title).toBeDefined()
  return match
}

function section(pageTitle, sectionTitle, level) {
  const match = page(pageTitle).sections.find(section =>
    section.title === sectionTitle && (level === undefined || section.level === level))
  expect(match, `${pageTitle} / ${sectionTitle}`).toBeDefined()
  return match.markdownLines.join('\n')
}

describe('the published Classic Fantasy corpus', () => {
  it('covers all seven Classic classes and the core rules without catalog pages', () => {
    const classes = corpus.pages.filter(page => page.category === 'classes')
    expect(classes.map(page => page.title)).toEqual([
      'Cleric', 'Dwarf', 'Elf', 'Fighter', 'Halfling', 'Magic-User', 'Thief',
    ])
    expect(corpus.pages).toHaveLength(43)
    expect(corpus.pages.flatMap(page => page.sections)).toHaveLength(421)
    for (const title of [
      'Creating a Character', 'Ability Scores', 'Advancement', 'Saving Throws',
      'Dungeon Adventuring', 'Wilderness Adventuring', 'Waterborne Adventuring',
      'Encounters', 'Evasion and Pursuit', 'Combat', 'Combat Tables',
      'Rules of Magic', 'Spell Books', 'Retainers', 'Awarding XP',
    ]) page(title)
    expect(corpus.pages.map(page => decodeURIComponent(page.sourceUrl)).join('\n')).not.toMatch(
      /\/7\. Monsters\/|\/8\. Treasures\/|\/4\. Magic\/[45]\. |\/Adventuring Gear\.md|\/Advanced Fantasy\//,
    )
    expect(page('Weapons And Armor').sections.map(section => section.title)).toEqual([
      'Weapons And Armor', 'Weapon Qualities',
    ])
  })

  it('identifies the licensed content and pins each section to a unique source location', () => {
    expect(corpus.generatedBy).toBe('scripts/ose/fetch-rules.mjs')
    expect(corpus.source.edition).toBe('2019 Classic Fantasy SRD')
    expect(corpus.source.revision).toMatch(/^[a-f0-9]{40}$/)
    expect(corpus.source.revisionDate).toBe('2024-08-13')
    expect(corpus.source.licenseUrl).toContain(`/blob/${corpus.source.revision}/License.md`)
    expect(corpus.license.file).toBe('OGL.txt')
    expect(license).toContain(corpus.license.notice)
    expect(license).toContain('OPEN GAME LICENSE Version 1.0a')
    const clauses = [...license.matchAll(/^(\d+)[. ]/gm)].map(([, number]) => Number(number))
    expect(clauses).toEqual(Array.from({ length: 15 }, (_, index) => index + 1))
    expect(license).toContain('Old-School Essentials System Reference Document © 2019 Gavin Norman. Author Gavin Norman.')
    expect(license).toContain('TableKeep Classic Fantasy Rules Corpus © 2026 David Butler.')

    const urls = new Set()
    for (const page of corpus.pages) {
      expect(page.sourceUrl).toContain(`/blob/${corpus.source.revision}/`)
      expect(page.sections[0]).toMatchObject({ title: page.title, level: 1 })
      for (const section of page.sections) {
        expect(section.sourceUrl.startsWith(`${page.sourceUrl}?plain=1#L`)).toBe(true)
        expect(section.sourceUrl).toMatch(/#L[1-9]\d*$/)
        expect(urls.has(section.sourceUrl)).toBe(false)
        urls.add(section.sourceUrl)
        expect([section.title, ...section.markdownLines].join('\n')).not.toMatch(/old.school essentials|necrotic gnome|!\[/i)
      }
    }
  })

  it('preserves progression rows, cleric turning qualifications, and thief skill exceptions', () => {
    const maximumLevels = { Cleric: 14, Dwarf: 12, Elf: 10, Fighter: 14, Halfling: 8, 'Magic-User': 14, Thief: 14 }
    for (const [title, maximum] of Object.entries(maximumLevels)) {
      const progression = section(title, `${title} Level Progression`)
      expect(progression).toContain('| Level | XP | HD | THAC0 | Save D | Save W | Save P | Save B | Save S |')
      const levels = [...progression.matchAll(/^\| (\d+) \|/gm)].map(([, level]) => Number(level))
      expect(levels).toEqual(Array.from({ length: maximum }, (_, index) => index + 1))
    }
    expect(section('Cleric', 'Cleric Level Progression')).toContain('| 2 | 1,500 | 2d6 | 19 [0] | 11 | 12 | 14 | 16 | 15 | 1 | - | - | - | - |')
    const turningTable = section('Cleric', 'Turning the Undead', 3)
    expect(turningTable).toContain('| 1 | 7 | 9 | 11 | - | - | - | - | - |')
    expect(turningTable).toContain('2 HD monsters with a special ability')
    expect(section('Cleric', 'Successful Turning')).toMatch(/2d6[\s\S]*At least one[\s\S]*lowest HD/)
    expect(section('Cleric', 'Turning Table Results')).toContain('higher or equal')
    expect(section('Thief', 'Thief Skills')).toContain('| 14 | 99 | 99 | 1–5 | 99 | 99 | 99 | 125 |')
    expect(section('Thief', 'Thief Skills')).toMatch(/every level above 5th[\s\S]*1% chance of failure/)
    expect(section('Thief', 'Rolling Skill Checks')).toMatch(/1d6[\s\S]*d%/)
  })

  it('preserves procedure order, separate optional rules, and the verified AC table correction', () => {
    expect(section('Combat', 'Combat Sequence Per Round')).toMatch(
      /Declare[\s\S]*Initiative[\s\S]*Monster morale[\s\S]*Movement[\s\S]*Missile attacks[\s\S]*Spell casting[\s\S]*Melee attacks/,
    )
    expect(section('Combat', 'Disrupting Spells')).toMatch(/loses initiative[\s\S]*fails a saving throw[\s\S]*removed from/)
    expect(section('Time, Weight, Movement', 'Option 2: Detailed Encumbrance')).toContain('| Up to 1,600 coins | 30’ (10’) |')
    expect(section('Creating a Character', 'Ascending AC (Optional Rule)')).not.toContain('| Attack Roll |')
    expect(section('Creating a Character', '1st Level PC Attack Values')).toContain('| AC Hit | 9 | 8 | 7 |')
    expect(section('Advancement', 'High-Level Attack Table')).toContain('| 13–15 | 17–20 | 21–25 | 13 | 12 | 11 | **10** |')
  })
})

describe('the importer', () => {
  it('retains the body, nesting, source line numbers, and a table footnote', () => {
    const source = [
      '', '# Sample', '', 'First paragraph.', '', '## Optional Rule', '',
      '1. Roll 2d6.', '   - Apply a bonus if both sides agree.', '',
      '| Roll | Effect |', '| :--: | --- |', '| 12 | Reroll* |', '', '* Only once.',
    ].join('\n')
    const result = parseRulesPage(source, 'Sample.md', 'adventuring')
    expect(result.sections).toEqual([
      { title: 'Sample', level: 1, sourceUrl: `${result.sourceUrl}?plain=1#L2`, markdownLines: ['First paragraph.'] },
      {
        title: 'Optional Rule',
        level: 2,
        sourceUrl: `${result.sourceUrl}?plain=1#L6`,
        markdownLines: [
          '1. Roll 2d6.', '   - Apply a bonus if both sides agree.', '',
          '| Roll | Effect |', '| --- | --- |', '| 12 | Reroll* |', '', '* Only once.',
        ],
      },
    ])
  })

  it('rejects malformed tables and unlicensed input before generation', async () => {
    expect(() => parseRulesPage('# Sample\n\n| Roll | Effect |\n| --- | --- |\n| 12 |', 'Sample.md', 'adventuring'))
      .toThrow('Malformed table')
    const fetched = []
    await expect(importRules(async path => {
      fetched.push(path)
      return 'No license'
    })).rejects.toThrow('Open Game Content designation and license')
    expect(fetched).toEqual(['License.md'])
  })
})
