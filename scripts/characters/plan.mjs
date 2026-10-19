// What the character migration would do to one stored character, worked out
// without touching the database. It runs the rule sets' own migration steps,
// loaded straight from their `.ts` files.

import {
  characterVersioningByRuleSet,
  migrateCharacter,
  resolveCharacterRuleSetId,
  storedSchemaVersion,
} from '../../src/features/ruleSets/characterMigrations.ts'
import { oseLegacyShapes } from '../../src/features/ruleSets/ose/legacyShapes.ts'

// The old shapes the dry run counts, per rule set. Only OSE has any.
const legacyShapes = { ose: oseLegacyShapes, vtm: () => [], lubec: () => [] }

/** The rule set a campaign's stored `system` resolves to, and how it got there. */
export function campaignRuleSet(system) {
  const ruleSetId = resolveCharacterRuleSetId(system)
  if (system === ruleSetId) return { ruleSetId, implicit: null }
  if (system === undefined || system === null) return { ruleSetId, implicit: 'missing' }
  return { ruleSetId, implicit: system === '' ? 'empty' : 'unregistered' }
}

/** A stored character's version, or null when its `schemaVersion` is not a whole number. */
function readableVersion(data) {
  try {
    return storedSchemaVersion(data)
  } catch {
    return null
  }
}

function runSteps(ruleSetId, characterId, data) {
  try {
    return migrateCharacter(characterVersioningByRuleSet[ruleSetId], characterId, data)
  } catch (error) {
    return { status: 'failed', message: error.message }
  }
}

const isPlainRecord = (value) =>
  typeof value === 'object' && value !== null && [Object.prototype, null].includes(Object.getPrototypeOf(value))

const sameList = (a, b) => a.length === b.length && a.every((entry, index) => sameValue(entry, b[index]))

const sameRecord = (a, b) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))

const bothLists = (a, b) => Array.isArray(a) && Array.isArray(b)

const bothRecords = (a, b) => isPlainRecord(a) && isPlainRecord(b)

const hasIsEqual = (value) => typeof value?.isEqual === 'function'

/** Whether two stored values are equal, comparing timestamps and other SDK values by their own `isEqual`. */
export function sameValue(a, b) {
  if (a === b) return true
  if (bothLists(a, b)) return sameList(a, b)
  if (bothRecords(a, b)) return sameRecord(a, b)
  return hasIsEqual(a) && a.isEqual(b)
}

function fieldChange(before, after, path) {
  const key = path.at(-1)
  if (!Object.hasOwn(after, key)) return [{ path: path.join('.'), removed: true }]
  if (bothRecords(before[key], after[key])) return changedFieldPaths(before[key], after[key], path)
  return sameValue(before[key], after[key]) ? [] : [{ path: path.join('.'), removed: false }]
}

/**
 * The field paths that differ between a stored document and its migrated
 * version: changed or added fields, and removed ones. Maps are followed down;
 * a list is one field.
 */
export function changedFieldPaths(before, after, parent = []) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return keys.flatMap((key) => fieldChange(before, after, [...parent, key]))
}

/**
 * The plan for one character in a campaign of the given rule set: `current`,
 * `migrate` with the document to write, `flagged` with a reason, or `gone`
 * when the document no longer exists.
 */
export function planCharacter(characterId, data, ruleSetId) {
  if (data === undefined) return { status: 'gone', ruleSetId }
  const plan = { ruleSetId, version: readableVersion(data) }
  if (resolveCharacterRuleSetId(data.system) !== ruleSetId) {
    return { ...plan, status: 'flagged', reason: 'its system disagrees with its campaign\'s rule set' }
  }
  const result = runSteps(ruleSetId, characterId, data)
  if (result.status === 'failed') return { ...plan, status: 'flagged', reason: `a migration step failed: ${result.message}` }
  if (result.status === 'newer') return { ...plan, status: 'flagged', reason: `version ${plan.version} is above the current version` }
  if (result.status === 'current') return { ...plan, status: 'current' }
  return { ...plan, status: 'migrate', document: result.document, changes: changedFieldPaths(data, result.document), shapes: legacyShapes[ruleSetId](data) }
}

/**
 * Where the script may read and write, from its options and environment: the
 * emulator when `FIRESTORE_EMULATOR_HOST` is set, and a real project only when
 * named with `--live --project <id>`.
 */
export function migrationTarget(options, env) {
  const emulator = env.FIRESTORE_EMULATOR_HOST
  if (emulator && options.live) throw new Error('--live was given but FIRESTORE_EMULATOR_HOST is set. Unset one of them.')
  if (emulator) return { label: `the emulator at ${emulator}`, projectId: options.project }
  if (!options.live) throw new Error('No emulator is running (FIRESTORE_EMULATOR_HOST is not set). To use a real project, add --live --project <id>.')
  if (!options.project) throw new Error('--live needs the project named with --project <id>.')
  return { label: `the live project ${options.project}`, projectId: options.project }
}
