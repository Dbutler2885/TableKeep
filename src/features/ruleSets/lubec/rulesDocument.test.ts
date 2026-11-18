import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LUBEC_DEATH_TABLE } from './deathReminders'
import { LUBEC_PANIC_TABLE } from './panicTable'
import { readLubecFinalTable } from './woundTables/finalMarkdown'
import { LUBEC_WOUND_TABLES } from './woundTables/index'

const document = readFileSync(new URL('../../../../docs/lubec/rules.md', import.meta.url), 'utf8')
const words = (text: string) => text.replaceAll('\u2014', '-').replaceAll('**', '').replace(/\s+/g, ' ').trim()

describe('the rules document supplied to chat', () => {
  const tables = Object.values(LUBEC_WOUND_TABLES).filter((table) => table.key !== 'dodgeball')

  it.each(tables)('$name has every final app row with its settled overrides', (table) => {
    const title = `### ${table.name === 'Thrown' ? 'Thrown Objects' : table.name} wound table`
    const start = document.indexOf(title)
    expect(start, title).toBeGreaterThan(-1)
    const end = document.indexOf('\n### ', start + title.length)
    const markdown = document.slice(start, end < 0 ? undefined : end)
      .replace(/^#### [^:]+: (.*)$/gm, '## $1')
    // The source parser recognises an initial bold d2 branch as an unnamed row.
    // Restore its punctuation before parsing; comparison below ignores that typography.
    const rows = readLubecFinalTable(markdown.replace(/\*\*(\d+) - /g, '**$1 \u2014 '))
    const actual = rows.map((row) => ({
      parts: row.parts, impact: row.impact, orMore: row.orMore, severity: row.severity, trauma: row.trauma,
      wound: words(row.name ? `${row.name}. ${row.prose}` : row.prose),
    }))
    const expected = table.locations.flatMap((location) => location.rows.map((row) => ({
      parts: [...location.parts], impact: row.impact, orMore: row.orMore ?? false, severity: row.severity, trauma: row.trauma,
      wound: words(row.name ? `${row.name}. ${row.text}` : row.text),
    })))
    expect(actual).toEqual(expected)
  })

  it('prints all current Panic rows and all adapted Death outcomes', () => {
    const panic = document.slice(document.indexOf('### Panic table'), document.indexOf('### Stress Recovery'))
    const actual = panic.split('\n').filter((line) => /^\| \d+ \|/.test(line)).map(words)
    expect(actual).toEqual(LUBEC_PANIC_TABLE.map((row) => words(`| ${row.roll} | **${row.name}.** ${row.text} |`)))
    const death = document.slice(document.indexOf('### Death Table'), document.indexOf('### Morale'))
    expect(death.split('\n').filter((line) => /^\| \d/.test(line)))
      .toEqual(LUBEC_DEATH_TABLE.map((row) => `| ${row.roll} | ${row.result} |`))
  })
})
