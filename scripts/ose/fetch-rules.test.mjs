import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { fetchSourceTree, folderLister, generateRules, importRules, parseRulesPage } from './fetch-rules.mjs'

const directory = new URL('../../docs/rules/ose-classic/', import.meta.url)
const corpus = JSON.parse(readFileSync(new URL('corpus.json', directory), 'utf8'))
const monsters = JSON.parse(readFileSync(new URL('monsters.json', directory), 'utf8'))
const spellsAndItems = JSON.parse(readFileSync(new URL('spells-and-items.json', directory), 'utf8'))
const BUNDLES = { 'corpus.json': corpus, 'monsters.json': monsters, 'spells-and-items.json': spellsAndItems }
const license = readFileSync(new URL('OGL.txt', directory), 'utf8')
const WEAPON_RULES_PATH = '3. Equipment & Services/3. Weapons and Armor.md'
const ADVANCEMENT_PATH = '1. Characters/6. Advancement.md'
const CHARACTER_CREATION_PATH = '1. Characters/2. Creating a Character.md'
const REINCARNATION_PATH = '4. Magic/Magic-User Spells/6 - Reincarnate.md'
const SOURCE_NOTICE = 'Old-School Essentials System Reference Document © 2019 Gavin Norman. Author Gavin Norman.'
const SOURCE_LICENSE = [
  'All text and tables not declared as product identity are Open Game Content.',
  '',
  '### OPEN GAME LICENSE Version 1.0a',
  '',
  '15 COPYRIGHT NOTICE',
  '',
  SOURCE_NOTICE,
  '',
  '## Creative Commons Attribution 4.0 International',
].join('\n')

function markdownTable(header, ...rows) {
  return [header, header.map(() => '---'), ...rows].map(row => `| ${row.join(' | ')} |`).join('\n')
}

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
    for (const bundle of Object.values(BUNDLES)) {
      expect(bundle.generatedBy).toBe('scripts/ose/fetch-rules.mjs')
      expect(bundle.source).toMatchObject({ ...corpus.source, corrections: bundle.source.corrections })
      expect(bundle.license).toEqual(corpus.license)
    }
    expect(corpus.source.edition).toBe('2019 Classic Fantasy SRD')
    expect(corpus.source.revision).toMatch(/^[a-f0-9]{40}$/)
    expect(corpus.source.revisionDate).toBe('2024-08-13')
    expect(corpus.source.licenseUrl).toContain(`/blob/${corpus.source.revision}/License.md`)
    expect(corpus.license.file).toBe('OGL.txt')
    expect(license).toContain(
      'All rules text and tables in the pages arrays of corpus.json, monsters.json and spells-and-items.json are Open Game Content. ' +
      'Use is permitted only under the Open Game License Version 1.0a.',
    )
    expect(license).toContain('OPEN GAME LICENSE Version 1.0a')
    const clauses = [...license.matchAll(/^(\d+)[. ]/gm)].map(([, number]) => Number(number))
    expect(clauses).toEqual(Array.from({ length: 15 }, (_, index) => index + 1))
    expect(license).toContain('Old-School Essentials System Reference Document © 2019 Gavin Norman. Author Gavin Norman.')
    expect(license).toContain('TableKeep Classic Fantasy Rules Corpus © 2026 David Butler.')

    for (const page of Object.values(BUNDLES).flatMap(bundle => bundle.pages)) {
      expect(page.sourceUrl).toContain(`/blob/${corpus.source.revision}/`)
      expect(page.sections[0]).toMatchObject({ title: page.title, level: 1 })
      for (const section of page.sections) {
        expect(section.sourceUrl.startsWith(`${page.sourceUrl}?plain=1#L`)).toBe(true)
        expect(section.sourceUrl).toMatch(/#L[1-9]\d*$/)
        expect([section.title, ...section.markdownLines].join('\n')).not.toMatch(/old.school essentials|necrotic gnome|!\[/i)
      }
    }
    // Only the title of the page split between the core rules and the catalog is in two files.
    for (const bundle of Object.values(BUNDLES)) {
      const urls = bundle.pages.flatMap(page => page.sections.map(section => section.sourceUrl))
      expect(new Set(urls).size).toBe(urls.length)
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

describe('the monsters and the spells, equipment and treasure', () => {
  const titles = bundle => bundle.pages.map(page => page.title)
  const filedUnder = (bundle, parent) => bundle.pages.filter(page => page.partOf === parent)

  it('holds every monster after the monster rules, and the encounter tables and adventuring parties', () => {
    expect(titles(monsters).slice(0, 3)).toEqual(['General', 'Monster Descriptions', 'Acolyte'])
    expect(filedUnder(monsters, 'Monster Descriptions')).toHaveLength(138)
    expect(monsters.pages.filter(page => page.category === 'encounters').map(page => page.title)).toEqual([
      'Dungeon Encounters', 'Wilderness Encounters', 'Adventuring Parties', 'Stronghold Encounters',
    ])
    const ghoul = monsters.pages.find(page => page.title === 'Ghoul')
    expect(ghoul.sections[0].markdownLines.join('\n')).toMatch(/\| Armor Class \| 6 \[13\] \|[\s\S]*Paralysis/)
  })

  it('holds both spell lists with every spell filed under its list, then the gear, then all treasure and magic items', () => {
    expect(spellsAndItems.pages.map(page => page.category)).toEqual([
      ...Array(108).fill('spells'), ...Array(5).fill('equipment'), ...Array(100).fill('treasure'),
    ])
    expect(filedUnder(spellsAndItems, 'Cleric Spells')).toHaveLength(34)
    expect(filedUnder(spellsAndItems, 'Magic-User Spells')).toHaveLength(72)
    expect(filedUnder(spellsAndItems, 'Cleric Spells')[0].title).toBe('Cure Light Wounds (Cause Light Wounds)')
    for (const [kind, count] of [['Miscellaneous Items', 26], ['Potions', 21], ['Rings', 16], ['Rods, Staves, Wands', 21]]) {
      expect(filedUnder(spellsAndItems, kind), kind).toHaveLength(count)
    }
    expect(spellsAndItems.pages.filter(page => !page.partOf).map(page => page.title)).toEqual([
      'Cleric Spells', 'Magic-User Spells',
      'Adventuring Gear', 'Weapons And Armor', 'Mounts', 'Land Vehicles', 'Water Vessels',
      'Placing Treasure', 'Treasure Types', 'Gems and Jewellery', 'Magic Items (General)', 'Armor and Shields',
      'Miscellaneous Items', 'Potions', 'Rings', 'Rods, Staves, Wands', 'Scrolls and Maps', 'Swords', 'Weapons',
      'Sentient Swords', 'Extraordinary Powers of Sentient Swords', 'Sensory Powers of Sentient Swords', 'Special Purpose of Sentient Swords',
    ])
    const weapons = spellsAndItems.pages.find(page => page.title === 'Weapons And Armor')
    expect(weapons.sections.map(section => section.title)).not.toContain('Weapon Qualities')
    expect(weapons.sections.find(section => section.title === 'Weapons').markdownLines.join('\n')).toContain('| Battle axe | 7 | 50 | 1d8 | Melee, Slow, Two-handed |')
  })

  it('leaves out the referee chapters, the Advanced classes, and index pages that only point elsewhere', () => {
    const sources = [...monsters.pages, ...spellsAndItems.pages].map(page => decodeURIComponent(page.sourceUrl)).join('\n')
    expect(sources).not.toMatch(/\/6\. Running Adventures\/|\/1\. Characters\/|\/2\. Classes\/|\/5\. Adventures\/|Advanced/)
    expect(sources).not.toMatch(/1a\. Equipment|Rules for Vehicles|Fantasy-Statblocks/)
  })

  it('names the source of the reincarnation tables without the product name, and records that it did', () => {
    const reincarnation = spellsAndItems.pages.find(page => page.title === 'Reincarnation')
    expect(reincarnation.sections.flatMap(section => section.markdownLines).join('\n')).toContain('are drawn from *Classic Fantasy*.')
    expect(spellsAndItems.source.corrections).toEqual([expect.objectContaining({ section: 'Reincarnation' })])
    expect(monsters.source.corrections).toEqual([])
    expect(() => parseRulesPage('# Reincarnation\n\nDrawn from elsewhere.', REINCARNATION_PATH, 'spells'))
      .toThrow('no longer names product identity as expected')
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
    expect(() => parseRulesPage('# Sample\n\n| Roll | Effect |\n| --- | --- |\n| 12 | Reroll', 'Sample.md', 'adventuring'))
      .toThrow('Incomplete table row')
    expect(() => parseRulesPage('# Sample\n\n| Roll | Effect |', 'Sample.md', 'adventuring'))
      .toThrow('Malformed table')
    const fetched = []
    await expect(importRules(async path => {
      fetched.push(path)
      return 'No license'
    })).rejects.toThrow('Open Game Content designation and license')
    expect(fetched).toEqual(['License.md'])
    await expect(importRules(async () => SOURCE_LICENSE.replace('15 COPYRIGHT NOTICE', '')))
      .rejects.toThrow('copyright notice does not match')
    await expect(importRules(async () => SOURCE_LICENSE.replace(SOURCE_NOTICE, 'Other copyright notice')))
      .rejects.toThrow('copyright notice does not match')
  })

  it('flattens grouped column labels while preserving the source values', () => {
    const source = [
      '# Sample',
      '',
      markdownTable(
        ['', 'Saving Throws', 'Spells', '', '', '', '', '', '', ''],
        ['Level', 'XP', 'HD', 'THAC0', 'D', 'W', 'P', 'B', 'S', '1'],
        ['1', '0', '1d8', '19 [0]', '12', '13', '14', '15', '16', '1'],
      ),
      '',
      markdownTable(['', 'Hit Dice of Monster Type†', ''], ['Level', '1', '2*'], ['1', '7', '11']),
      '',
      markdownTable(['', 'Retainers', '', ''], ['CHA', 'NPC Reactions', 'Max #', 'Loyalty'], ['3', '-2', '1', '4']),
      '',
      markdownTable(['', 'Wage per Month', '', ''], ['Type', 'AC', 'Morale', 'Human'], ['Archer', '6 [13]', '8', '5gp']),
      '',
      markdownTable(['', 'Movement Rate', ''], ['Armor Worn', 'Without Treasure', 'Carrying Treasure'], ['Unarmored', '120’', '90’']),
      '',
      markdownTable(['Encumbrance', 'Movement Rate'], ['Up to 400 coins', '120’']),
    ].join('\n')
    const [result] = parseRulesPage(source, 'Sample.md', 'adventuring').sections
    expect(result.markdownLines).toEqual([
      '| Level | XP | HD | THAC0 | Save D | Save W | Save P | Save B | Save S | Spells (level 1) |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      '| 1 | 0 | 1d8 | 19 [0] | 12 | 13 | 14 | 15 | 16 | 1 |',
      '',
      '| Level | HD 1† | HD 2*† |',
      '| --- | --- | --- |',
      '| 1 | 7 | 11 |',
      '',
      '| CHA | NPC Reactions | Max Retainers | Retainer Loyalty |',
      '| --- | --- | --- | --- |',
      '| 3 | -2 | 1 | 4 |',
      '',
      '| Type | AC | Morale | Human Wage per Month |',
      '| --- | --- | --- | --- |',
      '| Archer | 6 [13] | 8 | 5gp |',
      '',
      '| Armor Worn | Movement Rate (Without Treasure) | Movement Rate (Carrying Treasure) |',
      '| --- | --- | --- |',
      '| Unarmored | 120’ | 90’ |',
      '',
      '| Encumbrance | Movement Rate |',
      '| --- | --- |',
      '| Up to 400 coins | 120’ |',
    ])
  })

  it('rejects turning or attack matrices missing their expected second header row', () => {
    const turning = markdownTable(['', 'Hit Dice of Monster Type†'], ['1', '7'])
    expect(() => parseRulesPage(`# Cleric\n\n${turning}`, 'Cleric.md', 'classes'))
      .toThrow('Turning table is missing its column labels')
    const attack = markdownTable(['', 'Attack Roll to Hit AC'])
    expect(() => parseRulesPage(`# Combat Tables\n\n${attack}`, 'Combat Tables.md', 'adventuring'))
      .toThrow('Attack matrix is missing its column labels')
  })

  it('restores both missing captions and guards the high-level correction against source drift', () => {
    const advancement = [
      '# Advancement', '', '# High-Level Play (Optional Rule)', '', '## Thieves', '', 'Thief rules.', '',
      markdownTable(
        ['Class and Level', 'Attack Roll to Hit AC', '', '', ''],
        ['Fighter', 'Cleric, Thief', 'Magic-User', '-3', '-2'],
        ['13–15', '17–20', '21–25', '13', '13'],
      ),
    ].join('\n')
    const result = parseRulesPage(advancement, ADVANCEMENT_PATH, 'characters')
    expect(result.sections.map(({ title, level }) => [title, level])).toEqual([
      ['Advancement', 1], ['High-Level Play (Optional Rule)', 2], ['Thieves', 3], ['High-Level Attack Table', 3],
    ])
    expect(result.sections[2].markdownLines).toEqual(['Thief rules.'])
    expect(result.sections[3].markdownLines).toEqual([
      '| Fighter | Cleric, Thief | Magic-User | AC -3 | AC -2 |',
      '| --- | --- | --- | --- | --- |',
      '| 13–15 | 17–20 | 21–25 | 13 | 12 |',
    ])
    expect(result.sections[3].sourceUrl).toMatch(/#L9$/)
    expect(() => parseRulesPage(advancement.replace('13 | 13 |', '13 | 12 |'), ADVANCEMENT_PATH, 'characters'))
      .toThrow('no longer matches the transcription')

    const creation = [
      '# Creating a Character', '', '## 5. Note Attack Values', '', '### Ascending AC (Optional Rule)', '',
      'Record the attack bonus.', '', markdownTable(['Attack Roll', '10'], ['AC Hit', '9']),
    ].join('\n')
    const [, , ascending, starting] = parseRulesPage(creation, CHARACTER_CREATION_PATH, 'characters').sections
    expect(ascending.markdownLines).toEqual(['Record the attack bonus.'])
    expect(starting).toMatchObject({
      title: '1st Level PC Attack Values', level: 3,
      markdownLines: ['| Attack Roll | 10 |', '| --- | --- |', '| AC Hit | 9 |'],
    })
  })

  it('keeps the weapon rules section and discards the catalog before parsing its body', () => {
    const source = [
      '# Weapons And Armor', '', '## Weapons', '', 'Catalog <table> layout.', '',
      '### Weapon Qualities', '', 'A slow weapon acts last.', '', '## Ammunition', '', 'Ammunition prices.',
    ].join('\n')
    const selected = parseRulesPage(source, WEAPON_RULES_PATH, 'services', { keep: 'Weapon Qualities' }).sections
    expect(selected).toHaveLength(2)
    expect(selected[1]).toMatchObject({ title: 'Weapon Qualities', level: 2, markdownLines: ['A slow weapon acts last.'] })
    expect(() => parseRulesPage('# Weapons And Armor\n\n## Weapons\n\nCatalog only.', WEAPON_RULES_PATH, 'services', { keep: 'Weapon Qualities' }))
      .toThrow('Weapon Qualities section is missing')
  })

  it('keeps everything but the weapon rules section for the catalog, and files a folder page under its list', () => {
    const source = [
      '# Weapons And Armor', '', '## Weapons', '', '| Weapon | Damage |', '| --- | --- |', '| Club | 1d4 |', '',
      '### Weapon Qualities', '', 'A slow weapon acts last.', '', '## Ammunition', '', 'Ammunition prices.',
    ].join('\n')
    const omitted = parseRulesPage(source, WEAPON_RULES_PATH, 'equipment', { omit: 'Weapon Qualities' })
    expect(omitted.sections.map(({ title }) => title)).toEqual(['Weapons And Armor', 'Weapons', 'Ammunition'])
    expect(omitted.partOf).toBeUndefined()
    expect(parseRulesPage('# Sleep\n\nSends creatures to sleep.', 'Sleep.md', 'spells', { partOf: 'Magic-User Spells' }).partOf)
      .toBe('Magic-User Spells')
  })

  it('reads every file path in the pinned revision, and refuses a failed or partial listing', async () => {
    const asked = []
    const tree = (body, status = 200) => async (url, init) => {
      asked.push({ url, init })
      return new Response(JSON.stringify(body), { status })
    }
    const listing = {
      truncated: false,
      tree: [{ path: '4. Magic', type: 'tree' }, { path: '4. Magic/1. Rules.md', type: 'blob' }, { path: 'License.md', type: 'blob' }],
    }
    await expect(fetchSourceTree(tree(listing))).resolves.toEqual(['4. Magic/1. Rules.md', 'License.md'])
    expect(asked[0].url).toBe(`https://api.github.com/repos/Obsidian-TTRPG-Community/Old-School-Essentials-Markdown/git/trees/${corpus.source.revision}?recursive=1`)
    expect(asked[0].init.redirect).toBe('error')
    await expect(fetchSourceTree(tree({ ...listing, truncated: true }))).rejects.toThrow('is truncated')
    await expect(fetchSourceTree(tree({}, 403))).rejects.toThrow(/^HTTP 403 for https:\/\/api\.github\.com\//)
  })

  it('lists the Markdown pages directly in a folder, reading the revision once', async () => {
    let reads = 0
    const listFolder = folderLister(async () => {
      reads += 1
      return [
        '8. Treasures/7. Potions.md', '8. Treasures/Potions/Potion of Healing.md', '8. Treasures/Potions/Notes.txt',
        '8. Treasures/Potions/Old/Potion of Old.md', '8. Treasures/Potions Extra/Potion of Nothing.md', 'Potions/Elsewhere.md',
      ]
    })
    await expect(listFolder('8. Treasures/Potions')).resolves.toEqual(['Potion of Healing'])
    await expect(listFolder('8. Treasures')).resolves.toEqual(['7. Potions'])
    await expect(listFolder('7. Monsters')).resolves.toEqual([])
    expect(reads).toBe(1)
  })

  it('rejects pages with unsupported content or a missing title', () => {
    for (const source of ['## Sample\n\nRules.', 'Intro\n\n# Sample\n\nRules.', 'Rules only.']) {
      expect(() => parseRulesPage(source, 'Sample.md', 'adventuring')).toThrow('Missing top-level rules title')
    }
    for (const source of ['# Sample', '# Sample\n\n![Image](art.png)', '# Sample\n\n<span>Non-rule markup.</span>']) {
      expect(() => parseRulesPage(source, 'Sample.md', 'adventuring')).toThrow('Unexpected content')
    }
  })

  it('generates licensed data and verifies both outputs without modifying them', async () => {
    const outputPath = await mkdtemp(join(tmpdir(), 'ose-rules-'))
    const outputDirectory = pathToFileURL(outputPath + sep)
    const readSource = async path => {
      if (path === 'License.md') return SOURCE_LICENSE
      if (path === WEAPON_RULES_PATH) {
        return '# Weapons And Armor\n\n## Weapons\n\nCatalog.\n\n### Weapon Qualities\n\nA slow weapon acts last.'
      }
      if (path === REINCARNATION_PATH) return '# Reincarnation\n\nFrom *Old-School Essentials Classic Fantasy*.'
      return '# Sample\n\nRules.'
    }
    // Two pages in each folder, listed out of order.
    const listFolder = async folder => folder === '4. Magic/Magic-User Spells' ? ['6 - Reincarnate', '1 - Sleep'] : ['B', 'A']
    const options = { readSource, listFolder, outputDirectory }
    const counts = 'corpus.json, 8 pages and 8 sections into monsters.json, 35 pages and 36 sections into spells-and-items.json'
    try {
      await expect(generateRules(options)).resolves.toBe(`Imported 43 pages and 44 sections into ${counts}`)
      const generated = JSON.parse(await readFile(new URL('corpus.json', outputDirectory), 'utf8'))
      expect(generated.pages).toHaveLength(43)
      expect(generated.pages[0].sections[0].markdownLines).toEqual(['Rules.'])
      const parts = JSON.parse(await readFile(new URL('spells-and-items.json', outputDirectory), 'utf8'))
      expect(parts.pages.slice(0, 4).map(page => [page.sourceUrl.split('/').at(-1), page.partOf])).toEqual([
        ['4.%20Cleric%20Spells.md', undefined], ['A.md', 'Sample'], ['B.md', 'Sample'], ['5.%20Magic-User%20Spells.md', undefined],
      ])
      expect(parts.pages[5].sections[0].markdownLines).toEqual(['From *Classic Fantasy*.'])
      const generatedLicense = new URL('OGL.txt', outputDirectory)
      expect(await readFile(generatedLicense, 'utf8')).toContain(SOURCE_NOTICE)
      await expect(generateRules({ ...options, check: true })).resolves.toBe(`Verified 43 pages and 44 sections into ${counts}`)
      await writeFile(generatedLicense, 'Changed license')
      await expect(generateRules({ ...options, check: true })).rejects.toThrow('OGL.txt differs')
      expect(await readFile(generatedLicense, 'utf8')).toBe('Changed license')
    } finally {
      await rm(outputPath, { recursive: true, force: true })
    }
  })
})
