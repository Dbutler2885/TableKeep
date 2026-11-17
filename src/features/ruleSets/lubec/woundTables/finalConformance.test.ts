import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readLubecFinalTable, type LubecFinalRow } from './finalMarkdown'
import { LUBEC_FINAL_SOURCES, lubecContentVersion, type LubecFinalSource } from './finalSources'
import { LUBEC_WOUND_TABLES } from './index'
import { LUBEC_FINAL_OVERRIDES } from './finalOverrides'
import type { LubecWoundTableRow } from './types'

// The final tables are the authority: every row the app has transcribed must
// say what its source file says, location, Impact, band, severity, Trauma, name
// and words, except where a settled term overrides the words, and each such
// override is listed once in `finalOverrides.ts`.

const read = (file: string) => readFileSync(new URL(`./final/${file}`, import.meta.url))

/** Which source file each app table is transcribed from. */
const SOURCE_OF: Readonly<Record<string, LubecFinalSource>> = {
  blunt: 'blunt-force.md', cutting: 'cutting.md', fisticuffs: 'fisticuffs.md', gunshot: 'gunshot.md', piercing: 'piercing.md', thrown: 'thrown.md',
}

/** The tables whose every row is final so far; the rest still carry provisional rows resolved by hand. */
const COMPLETE: readonly string[] = ['fisticuffs', 'blunt', 'cutting', 'piercing', 'gunshot', 'thrown']

type AppRow = { key: string; parts: string[]; row: LubecWoundTableRow }

const appRows = (key: string): AppRow[] =>
  LUBEC_WOUND_TABLES[key].locations.flatMap((location) => location.rows.map((row) => ({ key, parts: location.parts, row })))

const sameParts = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join()

function sourceRow(key: string, entry: AppRow): LubecFinalRow | undefined {
  return readLubecFinalTable(read(SOURCE_OF[key]).toString('utf8')).find((row) => sameParts(row.parts, entry.parts) && row.impact === entry.row.impact)
}

describe('the vendored final sources', () => {
  it.each(Object.entries(LUBEC_FINAL_SOURCES))('%s is byte for byte the agreed file', (file, sha) => {
    expect(createHash('sha256').update(read(file)).digest('hex')).toBe(sha)
  })
})

describe('reading the final files', () => {
  // Counted when the tables were ticketed; the parser must find every row, and only rows (the Thrown Heft table is not a wound table).
  it.each([['fisticuffs.md', 83], ['blunt-force.md', 62], ['cutting.md', 84], ['piercing.md', 81], ['gunshot.md', 50], ['thrown.md', 62]] as const)('%s has %i wound rows', (file, count) => {
    const rows = readLubecFinalTable(read(file).toString('utf8'))
    expect(rows).toHaveLength(count)
    expect(rows.every((row) => row.parts.length && row.prose)).toBe(true)
  })
})

describe('every transcribed final row agrees with its source', () => {
  const finalRows = Object.keys(LUBEC_WOUND_TABLES).flatMap(appRows).filter((entry) => entry.row.outcome)

  it('has rows to check', () => {
    expect(finalRows.length).toBeGreaterThan(0)
  })

  it.each(finalRows.map((entry) => [`${entry.key} ${entry.parts.join('+')} ${entry.row.impact}`, entry] as const))('%s', (_, entry) => {
    const source = sourceRow(entry.key, entry)
    expect(source, 'a row the source has').toBeDefined()
    const override = LUBEC_FINAL_OVERRIDES.find((item) => item.table === entry.key && sameParts(item.parts, entry.parts) && item.impact === entry.row.impact)
    expect({ impact: entry.row.impact, orMore: entry.row.orMore ?? false, severity: entry.row.severity, trauma: entry.row.trauma, name: entry.row.name, text: entry.row.text })
      .toEqual({ impact: source!.impact, orMore: source!.orMore, severity: source!.severity, trauma: source!.trauma, name: source!.name, text: override?.text ?? source!.prose })
    expect(entry.row.contentVersion).toBe(lubecContentVersion(SOURCE_OF[entry.key]))
  })

  it.each(COMPLETE)('%s has every source row, and no other', (key) => {
    const source = readLubecFinalTable(read(SOURCE_OF[key]).toString('utf8'))
    const rows = appRows(key)
    expect(rows.every((entry) => entry.row.outcome)).toBe(true)
    expect(rows.map((entry) => `${[...entry.parts].sort().join('+')} ${entry.row.impact}`).sort())
      .toEqual(source.map((row) => `${[...row.parts].sort().join('+')} ${row.impact}`).sort())
  })

  it('lists each override against a row the source really has', () => {
    for (const override of LUBEC_FINAL_OVERRIDES) {
      const source = readLubecFinalTable(read(SOURCE_OF[override.table]).toString('utf8'))
      const row = source.find((entry) => sameParts(entry.parts, override.parts) && entry.impact === override.impact)
      expect(row, `${override.table} ${override.parts.join('+')} ${override.impact}`).toBeDefined()
      expect(override.text, 'an override that changes nothing').not.toBe(row!.prose)
    }
  })
})
