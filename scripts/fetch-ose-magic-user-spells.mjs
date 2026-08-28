#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const API_BASE = 'https://oldschoolessentials.necroticgnome.com/srd/api.php'
const PAGE_BASE = 'https://oldschoolessentials.necroticgnome.com/srd/index.php'
const MAGIC_USER_SPELLS_BY_LEVEL = {
  1: [
    'Charm Person',
    'Detect Magic',
    'Floating Disc',
    'Hold Portal',
    'Light',
    'Magic Missile',
    'Protection from Evil',
    'Read Languages',
    'Read Magic',
    'Shield',
    'Sleep',
    'Ventriloquism',
  ],
  2: [
    'Continual Light',
    'Detect Evil',
    'Detect Invisible',
    'ESP',
    'Invisibility',
    'Knock',
    'Levitate',
    'Locate Object',
    'Mirror Image',
    'Phantasmal Force',
    'Web',
    'Wizard Lock',
  ],
  3: [
    'Clairvoyance',
    'Dispel Magic',
    'Fire Ball',
    'Fly',
    'Haste',
    'Hold Person',
    'Infravision',
    "Invisibility 10' Radius",
    'Lightning Bolt',
    "Protection from Evil 10' Radius",
    'Protection from Normal Missiles',
    'Water Breathing',
  ],
  4: [
    'Charm Monster',
    'Confusion',
    'Dimension Door',
    'Growth of Plants',
    'Hallucinatory Terrain',
    'Massmorph',
    'Polymorph Others',
    'Polymorph Self',
    'Remove Curse',
    'Wall of Fire',
    'Wall of Ice',
    'Wizard Eye',
  ],
  5: [
    'Animate Dead',
    'Cloudkill',
    'Conjure Elemental',
    'Contact Higher Plane',
    'Feeblemind',
    'Hold Monster',
    'Magic Jar',
    'Pass-Wall',
    'Telekinesis',
    'Teleport',
    'Transmute Rock to Mud',
    'Wall of Stone',
  ],
  6: [
    'Anti-Magic Shell',
    'Control Weather',
    'Death Spell',
    'Disintegrate',
    'Geas',
    'Invisible Stalker',
    'Lower Water',
    'Move Earth',
    'Part Water',
    'Projected Image',
    'Reincarnation',
    'Stone to Flesh',
  ],
}
const SPELL_LEVEL_BY_NAME = Object.entries(MAGIC_USER_SPELLS_BY_LEVEL).reduce((acc, [level, names]) => {
  for (const name of names) acc.set(name, Number(level))
  return acc
}, new Map())

function usage() {
  console.error(
    'Usage: node scripts/fetch-ose-magic-user-spells.mjs [output-path]\n' +
      'Example: node scripts/fetch-ose-magic-user-spells.mjs tmp/ose-magic-user-spells.json',
  )
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Table Keep OSE spell importer',
      accept: 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} for ${url}`)
  }
  return response.json()
}

function decodeHtml(text) {
  return text
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function normalizeSpellName(name) {
  return decodeHtml(name)
    .replace(/\s+/g, ' ')
    .trim()
}

function canonicalLookupName(name) {
  return normalizeSpellName(name).replace(/\s+\([^)]*\)\s*$/u, '').trim()
}

function displaySpellName(name) {
  return normalizeSpellName(name).replace(/\s+\((?:MU|C)\)\s*$/u, '').trim()
}

function stripHtml(html) {
  return decodeHtml(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<li>/gi, '- ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r\n/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/[’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–]/g, '-')
      .replace(/\[edit\]/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
}

function slugifyName(name) {
  return name
    .normalize('NFKD')
    .replace(/[()]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function spellIdFromName(name) {
  const baseName = name.replace(/\s+\([^)]*\)\s*$/u, '').trim()
  return `arcane-${slugifyName(baseName)}`
}

function parseIndexHtml(html) {
  const spells = new Map()
  const links = [...html.matchAll(/<a href="\/srd\/index\.php\/([^"#?]+)"[^>]*title="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]

  for (const [, slug, titleAttr, innerHtml] of links) {
    const candidateName = displaySpellName(stripHtml(innerHtml) || titleAttr)
    const titleName = displaySpellName(titleAttr)
    const candidateLookup = canonicalLookupName(candidateName)
    const titleLookup = canonicalLookupName(titleName)
    const matchedName = SPELL_LEVEL_BY_NAME.has(candidateName)
      ? candidateName
      : SPELL_LEVEL_BY_NAME.has(titleName)
        ? titleName
        : SPELL_LEVEL_BY_NAME.has(candidateLookup)
          ? candidateLookup
          : SPELL_LEVEL_BY_NAME.has(titleLookup)
            ? titleLookup
            : null

    if (!matchedName) continue

    spells.set(matchedName, {
      level: SPELL_LEVEL_BY_NAME.get(matchedName),
      slug: decodeURIComponent(slug),
      name: candidateName,
    })
  }

  return [...spells.values()].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
}

function splitDescription(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    throw new Error('Spell page produced no text.')
  }

  const meta = {
    durationText: undefined,
    rangeText: undefined,
    areaText: undefined,
    savingThrowText: undefined,
  }

  let startIndex = 0
  if (/^\d+(?:st|nd|rd|th) Level Magic-User Spell$/i.test(lines[0])) {
    startIndex = 1
  }

  for (let i = startIndex; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.startsWith('Duration:')) {
      meta.durationText = line.slice('Duration:'.length).trim()
      startIndex = i + 1
      continue
    }
    if (line.startsWith('Range:')) {
      meta.rangeText = line.slice('Range:'.length).trim()
      startIndex = i + 1
      continue
    }
    if (line.startsWith('Area of Effect:')) {
      meta.areaText = line.slice('Area of Effect:'.length).trim()
      startIndex = i + 1
      continue
    }
    if (line.startsWith('Saving Throw:')) {
      meta.savingThrowText = line.slice('Saving Throw:'.length).trim()
      startIndex = i + 1
      continue
    }
    break
  }

  return {
    ...meta,
    description: lines.slice(startIndex).join('\n'),
  }
}

function toTsModule(spells) {
  const lines = [
    "import type { CharacterSpell } from '../../types/app'",
    '',
    '// Generated by scripts/fetch-ose-magic-user-spells.mjs',
    'export const ARCANE_SPELL_CATALOG: CharacterSpell[] = [',
  ]

  for (const spell of spells) {
    lines.push('  {')
    for (const [key, value] of Object.entries(spell)) {
      if (key === 'sourceUrl') continue
      if (value === undefined) continue
      lines.push(`    ${key}: ${JSON.stringify(value)},`)
    }
    lines.push('  },')
  }

  lines.push(']')
  lines.push('')
  return lines.join('\n')
}

async function fetchSpellPage(slug) {
  const url = `${API_BASE}?action=parse&page=${encodeURIComponent(slug)}&prop=text&redirects=1&format=json&formatversion=2`
  const data = await fetchJson(url)
  const html = data?.parse?.text
  if (typeof html !== 'string') {
    throw new Error(`No rendered HTML returned for page ${slug}`)
  }

  const text = stripHtml(html)
    .replace(/^From OSE SRD\s*/i, '')
    .trim()

  return splitDescription(text)
}

async function main() {
  const [, , outputPathArg] = process.argv
  if (outputPathArg === '--help' || outputPathArg === '-h') {
    usage()
    return
  }

  const indexUrl = `${API_BASE}?action=parse&page=Magic-User_Spells&prop=text&format=json&formatversion=2`
  const indexData = await fetchJson(indexUrl)
  const indexHtml = indexData?.parse?.text
  if (typeof indexHtml !== 'string') {
    throw new Error('No rendered HTML returned for Magic-User Spells index page')
  }

  const indexSpells = parseIndexHtml(indexHtml)
  if (indexSpells.length === 0) {
    throw new Error('No magic-user spell links were discovered on the SRD index page')
  }
  const spells = []

  for (const entry of indexSpells) {
    const details = await fetchSpellPage(entry.slug)
    spells.push({
      id: spellIdFromName(entry.name),
      name: entry.name,
      level: entry.level,
      sourceUrl: `${PAGE_BASE}/${entry.slug}`,
      ...details,
    })
  }

  const output = outputPathArg?.endsWith('.ts')
    ? toTsModule(spells)
    : `${JSON.stringify(spells, null, 2)}\n`

  if (outputPathArg) {
    const outputPath = path.resolve(outputPathArg)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, output)
  } else {
    process.stdout.write(output)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
