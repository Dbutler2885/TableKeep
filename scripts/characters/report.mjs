// The character migration's report. It holds counts and document paths only,
// never a character's name or anything from its sheet.

import { characterVersioningByRuleSet } from '../../src/features/ruleSets/characterMigrations.ts'
import { OSE_LEGACY_SHAPES } from '../../src/features/ruleSets/ose/legacyShapes.ts'

const SHAPE_LABELS = {
  oldListsWithoutInventory: 'old lists, no inventory',
  oldListsBesideInventory: 'old lists beside an inventory',
  emptyInventory: 'explicitly empty inventory',
  rowsWithoutIds: 'rows without ids',
  legacyGold: 'legacy gold',
  manualAcFlag: 'manual-AC flag',
  casterWithoutSpellBook: 'arcane caster without a spell book',
  noDetails: 'no details',
}

const IMPLICIT_LABELS = { missing: 'no system', empty: 'empty system', unregistered: 'unregistered system' }

export function createReport() {
  return {
    ruleSets: Object.fromEntries(Object.keys(characterVersioningByRuleSet).map((id) => [id, { total: 0, versions: {}, current: 0, toConvert: 0 }])),
    shapes: Object.fromEntries(OSE_LEGACY_SHAPES.map((shape) => [shape, 0])),
    implicitCampaigns: { missing: [], empty: [], unregistered: [] },
    toConvert: [],
    flagged: [],
  }
}

/** Notes a campaign whose stored `system` resolves to OSE without naming it. */
export function recordCampaign(report, path, implicit) {
  if (implicit) report.implicitCampaigns[implicit].push(path)
}

const increment = (counts, key) => {
  counts[key] = (counts[key] ?? 0) + 1
}

function countShapes(report, shapes) {
  for (const shape of shapes) increment(report.shapes, shape)
}

/** Counts one character's plan. A document deleted since it was listed is not counted. */
export function recordCharacter(report, path, plan) {
  if (plan.status === 'gone') return
  const counts = report.ruleSets[plan.ruleSetId]
  counts.total += 1
  increment(counts.versions, plan.version ?? 'unreadable')
  if (plan.status === 'current') counts.current += 1
  if (plan.status === 'flagged') report.flagged.push({ path, reason: plan.reason })
  if (plan.status === 'migrate') {
    counts.toConvert += 1
    report.toConvert.push(path)
    countShapes(report, plan.shapes)
  }
}

const versionCounts = (versions) =>
  Object.entries(versions).map(([version, count]) => `version ${version}: ${count}`).join(', ') || 'none'

function ruleSetLines(report, converting) {
  return Object.entries(report.ruleSets).map(([id, counts]) =>
    `  ${id} (current version ${characterVersioningByRuleSet[id].schemaVersion}): ${counts.total} documents; ${versionCounts(counts.versions)}; ${counts.toConvert} ${converting}, ${counts.current} already current`)
}

const shapeLines = (report) => OSE_LEGACY_SHAPES.map((shape) => `  ${SHAPE_LABELS[shape]}: ${report.shapes[shape]}`)

function implicitCampaignLines(report) {
  return Object.entries(report.implicitCampaigns).flatMap(([implicit, paths]) =>
    [`  ${IMPLICIT_LABELS[implicit]}: ${paths.length}`, ...paths.map((path) => `    ${path}`)])
}

const flaggedLines = (report) =>
  report.flagged.length ? report.flagged.map(({ path, reason }) => `  ${path}: ${reason}`) : ['  none']

/** The counts both runs print: per rule set, per OSE shape, implicit-OSE campaigns, and flagged documents. */
export function formatCounts(report, apply) {
  const converting = apply ? 'converted' : 'to convert'
  return [
    'Characters by rule set, by stored version',
    ...ruleSetLines(report, converting),
    `OSE characters ${converting}, by old shape`,
    ...shapeLines(report),
    'Campaigns that resolve to OSE without naming it',
    ...implicitCampaignLines(report),
    'Flagged documents, left unchanged',
    ...flaggedLines(report),
  ].join('\n')
}

/** The lines a write run prints for one document it wrote. */
export function formatWritten(path, plan) {
  const changes = plan.changes.map(({ path: field, removed }) => `  ${removed ? 'removed' : 'changed'} ${field}`)
  return [`${path}: version ${plan.version} to ${plan.document.schemaVersion}`, ...changes].join('\n')
}

/** The closing line of a run. */
export function formatSummary(report, apply) {
  const current = Object.values(report.ruleSets).reduce((sum, counts) => sum + counts.current, 0)
  const flagged = `${report.flagged.length} flagged and left unchanged`
  if (!apply) return `Dry run: ${report.toConvert.length} to convert, ${current} already current, ${flagged}. Nothing was written.`
  return `Wrote ${report.toConvert.length} documents; ${current} already current; ${flagged}.`
}
