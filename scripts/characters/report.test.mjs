import { describe, expect, it } from 'vitest'
import { createReport, formatCounts, formatSummary, formatWritten, recordCampaign, recordCharacter } from './report.mjs'

const path = (id) => `groups/g1/campaigns/c1/characters/${id}`

function sampleReport() {
  const report = createReport()
  recordCampaign(report, 'groups/g1/campaigns/c1', null)
  recordCampaign(report, 'groups/g1/campaigns/c2', 'empty')
  recordCampaign(report, 'groups/g1/campaigns/c3', 'unregistered')
  recordCharacter(report, path('a'), { ruleSetId: 'ose', version: 0, status: 'migrate', shapes: ['oldListsWithoutInventory', 'legacyGold'] })
  recordCharacter(report, path('b'), { ruleSetId: 'ose', version: 0, status: 'migrate', shapes: ['legacyGold'] })
  recordCharacter(report, path('c'), { ruleSetId: 'ose', version: 1, status: 'current' })
  recordCharacter(report, path('d'), { ruleSetId: 'vtm', version: 2, status: 'flagged', reason: 'version 2 is above the current version' })
  recordCharacter(report, path('e'), { ruleSetId: 'ose', version: null, status: 'flagged', reason: 'a migration step failed: x' })
  recordCharacter(report, path('f'), { ruleSetId: 'ose', status: 'gone' })
  return report
}

describe('the migration report', () => {
  it('prints the counts per rule set, per old shape, per implicit campaign, and the flagged paths', () => {
    expect(formatCounts(sampleReport(), false)).toBe([
      'Characters by rule set, by stored version',
      '  ose (current version 1): 4 documents; version 0: 2, version 1: 1, version unreadable: 1; 2 to convert, 1 already current',
      '  vtm (current version 1): 1 documents; version 2: 1; 0 to convert, 0 already current',
      'OSE characters to convert, by old shape',
      '  old lists, no inventory: 1',
      '  old lists beside an inventory: 0',
      '  explicitly empty inventory: 0',
      '  rows without ids: 0',
      '  legacy gold: 2',
      '  manual-AC flag: 0',
      '  arcane caster without a spell book: 0',
      '  no details: 0',
      'Campaigns that resolve to OSE without naming it',
      '  no system: 0',
      '  empty system: 1',
      '    groups/g1/campaigns/c2',
      '  unregistered system: 1',
      '    groups/g1/campaigns/c3',
      'Flagged documents, left unchanged',
      `  ${path('d')}: version 2 is above the current version`,
      `  ${path('e')}: a migration step failed: x`,
    ].join('\n'))
  })

  it('says what a write run converted, and when nothing was flagged', () => {
    const report = createReport()
    const counts = formatCounts(report, true).split('\n')
    expect(counts).toContain('  ose (current version 1): 0 documents; none; 0 converted, 0 already current')
    expect(counts).toContain('OSE characters converted, by old shape')
    expect(counts.at(-1)).toBe('  none')
  })

  it('closes a dry run and a write run with their totals', () => {
    expect(formatSummary(sampleReport(), false)).toBe('Dry run: 2 to convert, 1 already current, 2 flagged and left unchanged. Nothing was written.')
    expect(formatSummary(sampleReport(), true)).toBe('Wrote 2 documents; 1 already current; 2 flagged and left unchanged.')
  })

  it('lists the field paths a written document changed or lost', () => {
    const plan = {
      version: 0,
      document: { schemaVersion: 1 },
      changes: [{ path: 'details.inventory', removed: false }, { path: 'details.weapons', removed: true }],
    }
    expect(formatWritten(path('a'), plan)).toBe([
      `${path('a')}: version 0 to 1`,
      '  changed details.inventory',
      '  removed details.weapons',
    ].join('\n'))
  })
})
