import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

// A pre-2026 transcription of the Classic Fantasy SRD with the original OGL notice.
const SOURCE_REPOSITORY = 'Obsidian-TTRPG-Community/Old-School-Essentials-Markdown'
const SOURCE_REVISION = '3467db46613fe6f74edf9acd224420aed27e2545'
const SOURCE_DATE = '2024-08-13'
const GENERATED_BY = 'scripts/ose/fetch-rules.mjs'
const OUTPUT_DIRECTORY = new URL('../../docs/rules/ose-classic/', import.meta.url)

// Explicit paths keep supplemental classes, referee chapters, and homebrew
// out, even when a selected page refers to them. A name ending in "/" stands
// for every page in that folder, in name order, each filed under the page
// listed just before it. A page with `keep` or `omit` contributes only some
// of its sections.
const CORE_SOURCES = [
  {
    category: 'characters',
    directory: '1. Characters',
    pages: [
      '0. Player Characters', '1. Game Statistics', '2. Creating a Character',
      '3. Ability Scores', '4. Alignment', '5. Languages', '6. Advancement',
    ],
  },
  {
    category: 'classes',
    directory: '2. Classes',
    pages: [
      '1. Cleric', '2. Dwarf', '3. Elf', '4. Fighter', '5. Halfling', '6. Magic-User', '7. Thief',
    ],
  },
  {
    category: 'adventuring',
    directory: '5. Adventures',
    pages: [
      '1. Part Organization', '2. Time, Weight, Movement', '3a. Ability Checks',
      '3b. Damage, Healing and Death', '3c. Saving Throws', '4. Hazards and Challenges',
      '5. Dungeon Adventuring', '6. Wilderness Adventuring', '7. Waterborne Adventuring',
      '8. Encounters', '9. Evasion and Pursuit', '10. Combat', '11. Other Combat Issues',
      '12. Morale', '13. Combat Tables',
    ],
  },
  {
    category: 'magic',
    directory: '4. Magic',
    pages: ['1. Rules', '2. Spell Books', '3. Magical Research'],
  },
  {
    category: 'services',
    directory: '3. Equipment & Services',
    pages: [
      '1. Wealth', { name: '3. Weapons and Armor', keep: 'Weapon Qualities' }, '5. Rules for Vehicles',
      '8. Retainers', '9. Mercenaries', '10. Specialists', '11. Strongholds',
    ],
  },
  {
    category: 'refereeing',
    directory: '6. Running Adventures',
    pages: [
      "1. The Referee's Role", '2. Handling PCs', '3. Running the Game', '9. Awarding XP',
    ],
  },
]

const MONSTER_SOURCES = [
  {
    category: 'monsters',
    directory: '7. Monsters',
    pages: ['1. General', '2. Monster Descriptions', 'Monster Stats/'],
  },
  {
    category: 'encounters',
    directory: '7. Monsters',
    pages: ['3. Dungeon Encounters', '4. Wilderness Encounters', '5. Adventuring Parties', '7. Stronghold Encounters'],
  },
]

const SPELL_AND_ITEM_SOURCES = [
  {
    category: 'spells',
    directory: '4. Magic',
    pages: ['4. Cleric Spells', 'Cleric Spells/', '5. Magic-User Spells', 'Magic-User Spells/'],
  },
  {
    category: 'equipment',
    directory: '3. Equipment & Services',
    pages: [
      '2. Adventuring Gear', { name: '3. Weapons and Armor', omit: 'Weapon Qualities' },
      '4. Mounts', '6. Land Vehicles', '7. Water Vehicles',
    ],
  },
  {
    category: 'treasure',
    directory: '8. Treasures',
    pages: [
      '1. Placing Treasure', '2. Treasure Types', '3. Gems and Jewellery', '4. Magic Items (General)',
      '5. Armor and Shields', '6. Miscellaneous Items', 'Miscellaneous/', '7. Potions', 'Potions/',
      '8. Rings', 'Rings/', '9. Rods, Staffs Wands', 'Rods, Staves, Wands/', '10 Scolls and Maps',
      '11. Swords', '12. Weapons', '13. Sentient Swords', '13a. Extraordinary Power of Sentient Swords',
      '13b. Sensory Powers of Sentient Swords', '13c. Special Purpose of Sentient Swords',
    ],
  },
]

const ADVANCEMENT_PAGE = '1. Characters/6. Advancement.md'
const HIGH_LEVEL_TABLE = 'High-Level Attack Table'
const ADVANCEMENT_CROSS_CHECK = 'https://osesrd.opengamingnetwork.com/player-characters/character-advancement/'
const CHARACTER_CREATION_PAGE = '1. Characters/2. Creating a Character.md'
const FIRST_LEVEL_TABLE = '1st Level PC Attack Values'
const CHARACTER_CREATION_CROSS_CHECK = 'https://osesrd.opengamingnetwork.com/player-characters/'
const LICENSE_FILE = 'License.md'
const LICENSE_TITLE = 'OPEN GAME LICENSE Version 1.0a'
const OGC_NOTICE = 'All rules text and tables in the pages array are Open Game Content. Use is permitted only under the Open Game License Version 1.0a.'
const REINCARNATION_PAGE = '4. Magic/Magic-User Spells/6 - Reincarnate.md'

// The generated files, each holding pages in the same shape. The bot always
// sends the core rules and adds the other two when a question needs them.
const BUNDLES = [
  { file: 'corpus.json', sources: CORE_SOURCES, corrections: [
    {
      section: HIGH_LEVEL_TABLE,
      sourceUrl: ADVANCEMENT_CROSS_CHECK,
      note: 'Restored the table caption and corrected the roll to hit AC -2 from 13 to 12 for Fighter 13–15, Cleric/Thief 17–20, and Magic-User 21–25.',
    },
    {
      section: FIRST_LEVEL_TABLE,
      sourceUrl: CHARACTER_CREATION_CROSS_CHECK,
      note: 'Restored the table caption so the descending AC table is distinct from the adjacent optional ascending AC rule.',
    },
  ] },
  { file: 'monsters.json', sources: MONSTER_SOURCES, corrections: [] },
  { file: 'spells-and-items.json', sources: SPELL_AND_ITEM_SOURCES, corrections: [
    {
      section: 'Reincarnation',
      sourceUrl: sourceUrl(REINCARNATION_PAGE),
      note: 'Named the tables\' source as Classic Fantasy instead of by its product name, which is product identity.',
    },
  ] },
]
const DESIGNATION = `All rules text and tables in the pages arrays of ${BUNDLES.map(({ file }) => file).join(', ').replace(/, ([^,]+)$/, ' and $1')} are Open Game Content. Use is permitted only under the Open Game License Version 1.0a.`

// Source text that names product identity, replaced where it occurs exactly once.
const PRODUCT_NAME_REWRITES = new Map([
  [REINCARNATION_PAGE, { from: '*Old-School Essentials Classic Fantasy*', to: '*Classic Fantasy*' }],
])

const MISSING_TABLE_CAPTIONS = new Map([
  [ADVANCEMENT_PAGE, { pattern: /^\| Class and Level \| Attack Roll to Hit AC/, title: HIGH_LEVEL_TABLE, level: 2 }],
  [CHARACTER_CREATION_PAGE, { pattern: /^\| Attack Roll \|/, title: FIRST_LEVEL_TABLE, level: 3 }],
])

function encodedPath(path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

function sourceUrl(path) {
  return `https://github.com/${SOURCE_REPOSITORY}/blob/${SOURCE_REVISION}/${encodedPath(path)}`
}

async function fetchSource(path) {
  const url = `https://raw.githubusercontent.com/${SOURCE_REPOSITORY}/${SOURCE_REVISION}/${encodedPath(path)}`
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  return response.text()
}

function readUpstreamLicense(source) {
  const start = source.indexOf(`### ${LICENSE_TITLE}\n`)
  const end = source.indexOf('\n## Creative Commons Attribution 4.0 International', start)
  if (start < 0 || end < 0 || !source.includes('All text and tables not declared as product identity are Open Game Content.')) {
    throw new Error('The source does not include the expected Open Game Content designation and license')
  }
  return source.slice(start + 4, end).trimEnd()
}

function corpusLicense(source) {
  const upstreamLicense = readUpstreamLicense(source)
  if (!upstreamLicense.includes('15 COPYRIGHT NOTICE') || !upstreamLicense.endsWith('Old-School Essentials System Reference Document © 2019 Gavin Norman. Author Gavin Norman.')) {
    throw new Error('The source Open Game License copyright notice does not match the pinned release')
  }
  return [
    `Generated by ${GENERATED_BY}.\nSource: ${sourceUrl(LICENSE_FILE)}`,
    `DESIGNATION OF OPEN GAME CONTENT\n\n${DESIGNATION}`,
    upstreamLicense,
    'TableKeep Classic Fantasy Rules Corpus © 2026 David Butler.',
    'END OF LICENSE',
  ].join('\n\n') + '\n'
}

// The transcription puts merged headings in the first Markdown row and the
// actual column labels in the first data row. The progression table even
// places "Saving Throws" over XP. Put the headings on the correct columns.
function progressionLabels(labels) {
  return [
    ...labels.slice(0, 4),
    ...labels.slice(4, 9).map(label => `Save ${label}`),
    ...labels.slice(9).map(label => `Spells (level ${label})`),
  ]
}

function attackLabels(labels) {
  const firstArmorClass = labels.indexOf('-3')
  if (firstArmorClass < 0) throw new Error('Attack matrix is missing its column labels')
  return [...labels.slice(0, firstArmorClass), ...labels.slice(firstArmorClass).map(label => `AC ${label}`)]
}

function turningLabels(labels) {
  if (labels[0] !== 'Level') throw new Error('Turning table is missing its column labels')
  return ['Level', ...labels.slice(1).map(label => `HD ${label}†`)]
}

// Check for the actual labels too when a group name can also be an ordinary column.
const GROUPED_HEADERS = [
  { group: 'Saving Throws', column: 3, title: 'THAC0', format: progressionLabels },
  { group: 'Attack Roll to Hit AC', format: attackLabels },
  { group: 'Hit Dice of Monster Type†', format: turningLabels },
  { group: 'Retainers', column: 0, title: 'CHA', format: () => ['CHA', 'NPC Reactions', 'Max Retainers', 'Retainer Loyalty'] },
  {
    group: 'Wage per Month',
    column: 0,
    title: 'Type',
    format: labels => [...labels.slice(0, 3), ...labels.slice(3).map(label => `${label} Wage per Month`)],
  },
  {
    group: 'Movement Rate',
    column: 0,
    title: 'Armor Worn',
    format: () => ['Armor Worn', 'Movement Rate (Without Treasure)', 'Movement Rate (Carrying Treasure)'],
  },
]

function columnLabels(header, nextRow = []) {
  const grouped = GROUPED_HEADERS.find(({ group, column, title }) =>
    header.includes(group) && (column === undefined || nextRow[column] === title))
  return grouped ? grouped.format(nextRow) : header
}

function readTableRow(line) {
  if (!line.endsWith('|')) throw new Error(`Incomplete table row in: ${line}`)
  return line.slice(1, -1).split(/(?<!\\)\|/).map(cell => cell.trim())
}

function readTable(lines) {
  const rows = lines.map(readTableRow)
  const [header, divider, ...data] = rows
  if (!divider?.every(cell => /^:?-+:?$/.test(cell)) || rows.some(row => row.length !== header.length)) {
    throw new Error(`Malformed table starting with: ${lines[0]}`)
  }
  return { header, divider, data }
}

function correctHighLevelAttack(labels, rows) {
  // The legacy SRD and the standard attack matrix both give 12 here.
  const row = rows.find(row => row.slice(0, 3).join('/') === '13–15/17–20/21–25')
  if (row?.[4] !== '13' || labels[4] !== 'AC -2') {
    throw new Error('High-level attack table no longer matches the transcription being corrected')
  }
  row[4] = '12'
}

function tableLines(lines) {
  const { header, divider, data } = readTable(lines)
  const labels = columnLabels(header, data[0])
  const body = labels === header ? data : data.slice(1)
  if (header.includes('Class and Level') && header.includes('Attack Roll to Hit AC')) {
    correctHighLevelAttack(labels, body)
  }
  return [labels, divider.map(() => '---'), ...body].map(row => `| ${row.join(' | ')} |`)
}

function markdownLines(lines) {
  const body = lines.join('\n').trim().replace(/ *\u2014 */g, ' - ').trim()
  if (!body) return []
  return body.replace(/(?:^\|[^\n]*(?:\n|$))+/gm, table => {
    const formatted = tableLines(table.trimEnd().split('\n').map(line => line.trimEnd())).join('\n')
    return table.endsWith('\n') ? formatted + '\n' : formatted
  }).split('\n')
}

function readHeadings(lines, path) {
  const headings = []
  const caption = MISSING_TABLE_CAPTIONS.get(path)
  for (const [index, line] of lines.entries()) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line)
    if (heading) headings.push({ line: index, level: heading[1].length, title: heading[2], bodyStart: index + 1 })
    if (caption?.pattern.test(line)) {
      headings.push({ line: index, level: caption.level, title: caption.title, bodyStart: index })
    }
  }
  return headings
}

function validatePageTitle(headings, lines, path) {
  const [root] = headings
  if (root?.level !== 1 || lines.slice(0, root.line).some(line => line.trim())) {
    throw new Error(`Missing top-level rules title in ${path}`)
  }
}

function sectionRanges(headings) {
  // Two pages collect multiple source chapters. Keep those headings inside
  // their containing page and retain their subheadings.
  const chapterOffset = Number(headings.slice(1).some(heading => heading.level === 1))
  return headings.map((heading, index) => ({
    ...heading,
    level: index === 0 ? heading.level : heading.level + chapterOffset,
    bodyEnd: headings[index + 1]?.line,
  }))
}

// A page that is split between bundles: `keep` takes only the named section,
// as a child of the page title, and `omit` takes everything but it.
function selectSections(ranges, { keep, omit }) {
  const title = keep ?? omit
  if (title === undefined) return ranges
  const [root, ...rest] = ranges
  const named = rest.filter(section => section.title === title)
  if (named.length !== 1) throw new Error(`The expected ${title} section is missing`)
  return keep ? [root, { ...named[0], level: 2 }] : [root, ...rest.filter(section => section !== named[0])]
}

function removeProductNames(source, path) {
  const rewrite = PRODUCT_NAME_REWRITES.get(path)
  if (!rewrite) return source
  if (source.split(rewrite.from).length !== 2) throw new Error(`${path} no longer names product identity as expected`)
  return source.replace(rewrite.from, rewrite.to)
}

function validateSectionContent(sections, path) {
  if (!sections.some(section => section.markdownLines.length > 0) ||
      sections.some(section => /Old[- ]School Essentials|Necrotic Gnome|!\[|<\/?[a-z][a-z\d]*\b[^>]*>/i.test(
        [section.title, ...section.markdownLines].join('\n'),
      ))) {
    throw new Error(`Unexpected content in ${path}`)
  }
}

export function parseRulesPage(source, path, category, { keep, omit, partOf } = {}) {
  const url = sourceUrl(path)
  const lines = removeProductNames(source, path).split(/\r?\n/)
  const headings = readHeadings(lines, path)
  validatePageTitle(headings, lines, path)
  const ranges = selectSections(sectionRanges(headings), { keep, omit })
  const sections = ranges.map(({ title, level, line, bodyStart, bodyEnd }) => ({
    title,
    level,
    sourceUrl: `${url}?plain=1#L${line + 1}`,
    markdownLines: markdownLines(lines.slice(bodyStart, bodyEnd)),
  }))
  validateSectionContent(sections, path)
  return { title: headings[0].title, category, ...(partOf && { partOf }), sourceUrl: url, sections }
}

async function fetchSourceTree() {
  const url = `https://api.github.com/repos/${SOURCE_REPOSITORY}/git/trees/${SOURCE_REVISION}?recursive=1`
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`)
  const { tree, truncated } = await response.json()
  if (truncated) throw new Error(`The listing of ${SOURCE_REPOSITORY} at ${SOURCE_REVISION} is truncated`)
  return tree.filter(entry => entry.type === 'blob').map(entry => entry.path)
}

let sourceTree
// The page names in one folder of the pinned revision, without ".md".
async function listSource(folder) {
  sourceTree ??= fetchSourceTree()
  const prefix = `${folder}/`
  return (await sourceTree)
    .filter(path => path.startsWith(prefix) && path.endsWith('.md') && !path.slice(prefix.length).includes('/'))
    .map(path => path.slice(prefix.length, -'.md'.length))
}

function byName(a, b) {
  return a.localeCompare(b, 'en', { numeric: true })
}

async function importPages(sources, readSource, listFolder) {
  const pages = []
  for (const { category, directory, pages: entries } of sources) {
    let partOf
    for (const entry of entries) {
      const { name, ...selection } = typeof entry === 'string' ? { name: entry } : entry
      if (name.endsWith('/')) {
        const folder = `${directory}/${name.slice(0, -1)}`
        const names = (await listFolder(folder)).sort(byName)
        if (names.length === 0) throw new Error(`There are no pages in ${folder}`)
        pages.push(...await Promise.all(names.map(async page => {
          const path = `${folder}/${page}.md`
          return parseRulesPage(await readSource(path), path, category, { partOf })
        })))
      } else {
        const path = `${directory}/${name}.md`
        const page = parseRulesPage(await readSource(path), path, category, selection)
        partOf = page.title
        pages.push(page)
      }
    }
  }
  return pages
}

export async function importRules(readSource = fetchSource, listFolder = listSource) {
  const license = corpusLicense(await readSource(LICENSE_FILE))
  const bundles = {}
  for (const { file, sources, corrections } of BUNDLES) {
    bundles[file] = {
      schemaVersion: 1,
      generatedBy: GENERATED_BY,
      source: {
        edition: '2019 Classic Fantasy SRD',
        revision: SOURCE_REVISION,
        revisionDate: SOURCE_DATE,
        sourceUrl: `https://github.com/${SOURCE_REPOSITORY}/tree/${SOURCE_REVISION}`,
        licenseUrl: sourceUrl(LICENSE_FILE),
        corrections,
      },
      license: { name: 'Open Game License Version 1.0a', file: 'OGL.txt', notice: OGC_NOTICE },
      pages: await importPages(sources, readSource, listFolder),
    }
  }
  return { bundles, license }
}

async function verifyOutput(target, contents) {
  if (await readFile(target, 'utf8') !== contents) {
    throw new Error(`${target.pathname.split('/').at(-1)} differs from its generated contents`)
  }
}

export async function generateRules({ check, readSource, listFolder, outputDirectory = OUTPUT_DIRECTORY }) {
  const { bundles, license } = await importRules(readSource, listFolder)
  const outputs = { 'OGL.txt': license }
  for (const [file, bundle] of Object.entries(bundles)) outputs[file] = JSON.stringify(bundle, null, 2) + '\n'
  const publish = check ? verifyOutput : writeFile
  for (const [name, contents] of Object.entries(outputs)) {
    await publish(new URL(name, outputDirectory), contents)
  }
  const counts = Object.entries(bundles).map(([file, { pages }]) =>
    `${pages.length} pages and ${pages.reduce((total, page) => total + page.sections.length, 0)} sections into ${file}`)
  return `${check ? 'Verified' : 'Imported'} ${counts.join(', ')}`
}

async function main() {
  const { values: { check } } = parseArgs({ options: { check: { type: 'boolean' } } })
  console.log(await generateRules({ check }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
