#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const API_BASE = 'https://oldschoolessentials.necroticgnome.com/srd/api.php'
const SOURCE_URL = 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Treasure_Types'
const OUTPUT_DEFAULT = 'src/features/treasure/generatedOseTreasureTypes.ts'
const EXPECTED_CODES = 'ABCDEFGHIJKLMNOPQRSTUV'.split('')

function usage() {
  console.error(
    'Usage: node scripts/fetch-ose-treasure-types.mjs [output-path]\n' +
      `Example: node scripts/fetch-ose-treasure-types.mjs ${OUTPUT_DEFAULT}`,
  )
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Table Keep OSE treasure importer',
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

function normalizeLine(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/×/g, 'x')
    .replace(/ ,/g, ',')
    .trim()
}

function parseAverageValue(text) {
  const match = text.match(/\(([\d,.]+)gp average\)/i)
  if (!match) {
    throw new Error(`Could not parse average gp value from heading: ${text}`)
  }
  return Number(match[1].replace(/,/g, ''))
}

function parseQuantity(text) {
  const normalized = normalizeLine(text)
  const diceMatch = normalized.match(/^(\d+)d(\d+)(?:\s*[x*]\s*([\d,]+))?$/i)
  if (diceMatch) {
    return {
      type: 'dice',
      dice: { count: Number(diceMatch[1]), sides: Number(diceMatch[2]) },
      ...(diceMatch[3] ? { multiplier: Number(diceMatch[3].replace(/,/g, '')) } : {}),
    }
  }

  const fixedMultiplierMatch = normalized.match(/^(\d+)\s*[x*]\s*([\d,]+)$/i)
  if (fixedMultiplierMatch) {
    return {
      type: 'fixed',
      value: Number(fixedMultiplierMatch[1]) * Number(fixedMultiplierMatch[2].replace(/,/g, '')),
    }
  }

  const fixedMatch = normalized.match(/^([\d,]+)$/)
  if (fixedMatch) {
    return {
      type: 'fixed',
      value: Number(fixedMatch[1].replace(/,/g, '')),
    }
  }

  throw new Error(`Unsupported quantity expression: ${text}`)
}

function parseCoins(segment) {
  const match = normalizeLine(segment).match(/^(.+?)\s*(cp|sp|ep|gp|pp)\.?$/i)
  if (!match) return null
  return {
    kind: 'coins',
    denomination: match[2].toLowerCase(),
    quantity: parseQuantity(match[1]),
  }
}

function parseGems(segment) {
  const match = normalizeLine(segment).match(/^(.+?)\s+gems?\.?$/i)
  if (!match) return null
  return {
    kind: 'gems',
    quantity: parseQuantity(match[1]),
  }
}

function parseJewellery(segment) {
  const match = normalizeLine(segment).match(/^(.+?)\s+pieces?\s+of\s+jewellery\.?$/i)
  if (!match) return null
  return {
    kind: 'jewellery',
    quantity: parseQuantity(match[1]),
  }
}

function parseMagicItems(segment) {
  const normalized = normalizeLine(segment).replace(/\.$/, '')
  const exactMap = [
    { pattern: /^(.+?)\s+potions?$/i, kind: 'potions' },
    { pattern: /^(.+?)\s+scrolls?$/i, kind: 'scrolls' },
    { pattern: /^(.+?)\s+magic\s+items?\s+\(not\s+weapons?\)$/i, kind: 'magic-items', constraint: 'excluding-weapons' },
    { pattern: /^(.+?)\s+magic\s+items?$/i, kind: 'magic-items', constraint: 'any' },
    {
      pattern: /^(.+?)\s+magic\s+sword,\s+suit\s+of\s+armou?r,\s+or\s+weapon$/i,
      kind: 'magic-items',
      constraint: 'weapon-armour-or-sword',
    },
  ]

  for (const entry of exactMap) {
    const match = normalized.match(entry.pattern)
    if (!match) continue
    return {
      kind: entry.kind,
      quantity: parseQuantity(match[1]),
      ...(entry.kind === 'magic-items' ? { constraint: entry.constraint } : {}),
    }
  }

  return null
}

function parseReward(segment) {
  const cleaned = normalizeLine(segment).replace(/[.,]+$/g, '')
  return parseCoins(cleaned) ?? parseGems(cleaned) ?? parseJewellery(cleaned) ?? parseMagicItems(cleaned)
}

function splitRewardSegments(text) {
  return text
    .replace(/\.$/, '')
    .split(/\s+plus\s+/i)
    .map((segment) => normalizeLine(segment))
    .filter(Boolean)
}

function parseEntry(rawText) {
  const normalized = normalizeLine(rawText)
  const match = normalized.match(/^(?:(\d+)%:\s*)?(.+?)$/)
  if (!match) {
    throw new Error(`Could not parse entry: ${rawText}`)
  }

  const chance = match[1] ? Number(match[1]) : null
  const rewardText = match[2]
  const rewards = splitRewardSegments(rewardText).map((segment) => {
    const parsed = parseReward(segment)
    if (!parsed) {
      throw new Error(`Could not parse reward segment: ${segment}`)
    }
    return parsed
  })

  return {
    chance,
    rewards,
    rawText: normalized,
  }
}

function parseSectionHeading(line) {
  const normalized = normalizeLine(line).toLowerCase()
  if (normalized === 'hoards: a-o') return 'hoard'
  if (normalized === 'individual treasure: p-t') return 'individual'
  if (normalized === 'group treasure: u-v') return 'group'
  return null
}

function inferGroupFromCode(code) {
  if ('ABCDEFGHIJKLMNO'.includes(code)) return 'hoard'
  if ('PQRST'.includes(code)) return 'individual'
  if ('UV'.includes(code)) return 'group'
  throw new Error(`Could not infer treasure group from code: ${code}`)
}

function parseTreasureTypes(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const records = []
  let currentGroup = null
  let currentRecord = null

  for (const line of lines) {
    const maybeGroup = parseSectionHeading(line)
    if (maybeGroup) {
      if (currentRecord) {
        records.push(currentRecord)
        currentRecord = null
      }
      currentGroup = maybeGroup
      continue
    }

    const typeMatch = line.match(/^Type\s+([A-V])\s+\(([\d,.]+)gp average\)$/i)
    if (typeMatch) {
      if (currentRecord) records.push(currentRecord)
      const code = typeMatch[1].toUpperCase()
      currentRecord = {
        id: `ose-tt-${code.toLowerCase()}`,
        code,
        name: `Type ${code}`,
        group: currentGroup ?? inferGroupFromCode(code),
        averageValueGp: parseAverageValue(line),
        entries: [],
        sourceUrl: SOURCE_URL,
      }
      continue
    }

    if (!currentRecord) continue

    if (line.startsWith('- ')) {
      currentRecord.entries.push(parseEntry(line.slice(2)))
    }
  }

  if (currentRecord) records.push(currentRecord)
  return records
}

function validateRecords(records) {
  if (records.length !== EXPECTED_CODES.length) {
    throw new Error(`Expected ${EXPECTED_CODES.length} treasure type records, got ${records.length}`)
  }

  const codes = records.map((record) => record.code)
  const missing = EXPECTED_CODES.filter((code) => !codes.includes(code))
  if (missing.length > 0) {
    throw new Error(`Missing treasure type codes: ${missing.join(', ')}`)
  }

  for (const record of records) {
    if (record.entries.length === 0) {
      throw new Error(`Treasure type ${record.code} has no parsed entries`)
    }
  }
}

function toTsModule(records) {
  const lines = [
    "import type { OseTreasureTypeRecord } from './types'",
    '',
    '// Generated by scripts/fetch-ose-treasure-types.mjs',
    'export const OSE_TREASURE_TYPES: OseTreasureTypeRecord[] = [',
  ]

  for (const record of records) {
    lines.push('  {')
    for (const [key, value] of Object.entries(record)) {
      lines.push(`    ${key}: ${JSON.stringify(value)},`)
    }
    lines.push('  },')
  }

  lines.push(']')
  lines.push('')
  return lines.join('\n')
}

async function main() {
  const [, , outputPathArg] = process.argv
  if (outputPathArg === '--help' || outputPathArg === '-h') {
    usage()
    return
  }

  const outputPath = path.resolve(outputPathArg ?? OUTPUT_DEFAULT)
  const url = `${API_BASE}?action=parse&page=Treasure_Types&prop=text&format=json&formatversion=2`
  const data = await fetchJson(url)
  const html = data?.parse?.text
  if (typeof html !== 'string') {
    throw new Error('No rendered HTML returned for Treasure Types page')
  }

  const text = stripHtml(html).replace(/^From OSE SRD\s*/i, '').trim()
  const records = parseTreasureTypes(text)
  validateRecords(records)

  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, toTsModule(records))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
