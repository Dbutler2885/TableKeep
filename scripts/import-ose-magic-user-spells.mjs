#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

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

const REVERSIBLE_SPELL_NAMES = new Map([
  ['Light', 'Darkness'],
  ['Continual Light', 'Continual Darkness'],
  ['Remove Curse', 'Curse'],
  ['Transmute Rock to Mud', 'Mud to Rock'],
  ['Geas', 'Remove Geas'],
  ['Stone to Flesh', 'Flesh to Stone'],
])

const SPELL_LEVEL_BY_NAME = Object.entries(MAGIC_USER_SPELLS_BY_LEVEL).reduce((acc, [level, names]) => {
  for (const name of names) {
    acc.set(name, Number(level))
  }
  return acc
}, new Map())

const ORDERED_MAGIC_USER_NAMES = Object.values(MAGIC_USER_SPELLS_BY_LEVEL).flat()

function usage() {
  console.error(
    'Usage: node scripts/import-ose-magic-user-spells.mjs <path-to-ose-plain-text.rtf|txt> [output-path]\n' +
      'Example: node scripts/import-ose-magic-user-spells.mjs ~/Downloads/OSE-Cleric-and-Magic-User-Spells.rtf tmp/ose-magic-user-spells.json',
  )
}

function stripRtf(raw) {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\line/g, '\n')
    .replace(/\\[a-z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
}

function normalizeText(raw) {
  return raw
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\t/g, ' ')
    .replace(/[ ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitLines(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function titleToId(title) {
  return `arcane-${title
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`
}

function canonicalSpellName(title) {
  const cleaned = title.replace(/\s+\([^)]*\)\s*$/u, '').trim()
  if (SPELL_LEVEL_BY_NAME.has(cleaned)) return cleaned
  return cleaned
}

function extractMagicUserSection(lines) {
  const startIndex = lines.findIndex((line) => line === 'Magic-User Spells')
  if (startIndex === -1) {
    throw new Error('Could not find "Magic-User Spells" heading in the provided file.')
  }

  const remaining = lines.slice(startIndex + 1)
  const spellStart = remaining.findIndex((line) => ORDERED_MAGIC_USER_NAMES.includes(canonicalSpellName(line)))
  if (spellStart === -1) {
    throw new Error('Could not find the first magic-user spell entry after the heading.')
  }

  const section = remaining.slice(spellStart)
  const stopIndex = section.findIndex((line, index) => index > 0 && /^Open Game License$/i.test(line))
  return stopIndex === -1 ? section : section.slice(0, stopIndex)
}

function parseSpellBlocks(lines) {
  const records = []
  let current = null

  for (const line of lines) {
    const maybeName = canonicalSpellName(line)
    if (SPELL_LEVEL_BY_NAME.has(maybeName)) {
      if (current) records.push(current)
      current = {
        name: maybeName,
        titleLine: line,
        level: SPELL_LEVEL_BY_NAME.get(maybeName),
        lines: [],
      }
      continue
    }

    if (!current) continue
    current.lines.push(line)
  }

  if (current) records.push(current)

  return records
}

function extractField(lines, label) {
  const prefix = `${label}:`
  const entry = lines.find((line) => line.startsWith(prefix))
  return entry ? entry.slice(prefix.length).trim() : undefined
}

function makeDescription(lines) {
  const body = lines.filter((line) => !/^(Duration|Range|Area of Effect|Saving Throw|Effect|Area):/.test(line))
  return body.join('\n').trim()
}

function inferAreaText(lines) {
  return extractField(lines, 'Area of Effect') ?? extractField(lines, 'Area')
}

function inferSavingThrowText(lines) {
  return extractField(lines, 'Saving Throw')
}

function buildSpellRecord(block) {
  const description = makeDescription(block.lines)
  return {
    id: titleToId(block.name),
    name: block.name,
    level: block.level,
    description,
    rangeText: extractField(block.lines, 'Range'),
    durationText: extractField(block.lines, 'Duration'),
    areaText: inferAreaText(block.lines),
    savingThrowText: inferSavingThrowText(block.lines),
    reversible: REVERSIBLE_SPELL_NAMES.has(block.name),
    reversedName: REVERSIBLE_SPELL_NAMES.get(block.name),
    sourceTitle: block.titleLine,
  }
}

function toTsString(value) {
  return JSON.stringify(value)
}

function formatTsModule(spells) {
  const lines = [
    "import type { CharacterSpell } from '../../types/app'",
    '',
    '// Generated by scripts/import-ose-magic-user-spells.mjs',
    'export const ARCANE_SPELL_CATALOG: CharacterSpell[] = [',
  ]

  for (const spell of spells) {
    lines.push('  {')
    for (const [key, value] of Object.entries(spell)) {
      if (value === undefined || key === 'sourceTitle' || key === 'reversedName') continue
      lines.push(`    ${key}: ${toTsString(value)},`)
    }
    lines.push('  },')
  }

  lines.push(']')
  lines.push('')
  return lines.join('\n')
}

async function main() {
  const [, , inputPathArg, outputPathArg] = process.argv
  if (!inputPathArg || inputPathArg === '--help' || inputPathArg === '-h') {
    usage()
    process.exitCode = inputPathArg ? 0 : 1
    return
  }

  const inputPath = path.resolve(inputPathArg)
  const outputPath = outputPathArg ? path.resolve(outputPathArg) : null

  const raw = await fs.readFile(inputPath, 'utf8')
  const stripped = inputPath.endsWith('.rtf') ? stripRtf(raw) : raw
  const normalized = normalizeText(stripped)
  const lines = splitLines(normalized)
  const magicUserSection = extractMagicUserSection(lines)
  const blocks = parseSpellBlocks(magicUserSection)
  const spells = blocks.map(buildSpellRecord)

  const missing = ORDERED_MAGIC_USER_NAMES.filter((name) => !spells.some((spell) => spell.name === name))
  if (missing.length > 0) {
    throw new Error(`Parsed ${spells.length} spells, but missing: ${missing.join(', ')}`)
  }

  const payload =
    outputPath && outputPath.endsWith('.ts') ? formatTsModule(spells) : `${JSON.stringify(spells, null, 2)}\n`
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, payload)
  } else {
    process.stdout.write(payload)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
