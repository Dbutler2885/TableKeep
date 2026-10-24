import type { CharacterStoreRuleSet } from '../../character/characterStore/characterStoreRecord'
import { sanitizeTokenIconForPersistence } from '../../common/mediaFields'
import { readCharacterIdentity, type CharacterIdentity } from '../characterIdentity'
import { lubecCharacterVersioning } from '../characterMigrations'
import { fieldsOutside, type CharacterParser } from '../characterParser'
import type { StoredCharacter } from '../storedCharacter'
import {
  LUBEC_STARTING_COUNTERS,
  lubecDefaultTokenIcon,
  type LubecCharacterRecord,
  type LubecCharacterSheet,
  type LubecDoor,
  type LubecStoredEntry,
} from './characterRecord'
import { lubecCharacterSummary } from './characterSummary'
import { LUBEC_VALUE_NAMES, type LubecSheet } from './sheet'

// Reads a stored Lubec character into the sheet's record and writes it back.
// Every stored field the record does not model, at the top level and inside
// each part of `lubec` it reads, comes through both ways as stored. A value
// the rules give no starting value for reads as a hole (`null`) when it is
// missing or unreadable, never as a made-up default.

type Fields = Record<string, unknown>

const LUBEC_DOORS: readonly LubecDoor[] = ['import', 'direct', 'guided']

const isRecord = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const fieldsOf = (raw: unknown): Fields => (isRecord(raw) ? raw : {})

const listOf = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : [])

const isText = (value: unknown): value is string => typeof value === 'string'

const textOrHole = (raw: unknown): string | null => (isText(raw) ? raw : null)

const wholeOrHole = (raw: unknown): number | null => (Number.isInteger(raw) ? raw as number : null)

const countOr = (raw: unknown, start: number): number =>
  Number.isInteger(raw) && (raw as number) >= 0 ? raw as number : start

const entryOrNone = (raw: unknown): LubecStoredEntry | null => (isRecord(raw) ? raw : null)

const doorOf = (raw: unknown): LubecDoor | null => LUBEC_DOORS.find((door) => door === raw) ?? null

function parseClass(raw: unknown): LubecSheet['class'] {
  const stored = fieldsOf(raw)
  const choices = fieldsOf(stored.choices)
  return {
    ...stored,
    key: textOrHole(stored.key),
    choices: { ...choices, statPenalty: textOrHole(choices.statPenalty), statBonus: textOrHole(choices.statBonus) },
  }
}

function parseBase(raw: unknown): LubecSheet['base'] {
  const stored = fieldsOf(raw)
  const values = Object.fromEntries(LUBEC_VALUE_NAMES.map((name) => [name, wholeOrHole(stored[name])]))
  return { ...stored, ...values } as LubecSheet['base']
}

function parseSkills(raw: unknown): LubecSheet['skills'] {
  const stored = fieldsOf(raw)
  return { ...stored, free: textOrHole(stored.free), picked: listOf(stored.picked).filter(isText) }
}

function parseCounters(raw: unknown): LubecCharacterSheet['counters'] {
  const stored = fieldsOf(raw)
  return {
    ...stored,
    stress: countOr(stored.stress, LUBEC_STARTING_COUNTERS.stress),
    minimumStress: countOr(stored.minimumStress, LUBEC_STARTING_COUNTERS.minimumStress),
    trauma: countOr(stored.trauma, LUBEC_STARTING_COUNTERS.trauma),
  }
}

/** A stored `lubec` field as the sheet reads it. */
export function parseLubecSheet(raw: unknown): LubecCharacterSheet {
  const stored = fieldsOf(raw)
  return {
    ...stored,
    age: wholeOrHole(stored.age),
    class: parseClass(stored.class),
    base: parseBase(stored.base),
    skills: parseSkills(stored.skills),
    door: doorOf(stored.door),
    rollUp: entryOrNone(stored.rollUp),
    counters: parseCounters(stored.counters),
    // Effect rows are kept as stored, unknown fields and all, until the
    // effects list reads them.
    effects: listOf(stored.effects) as LubecStoredEntry[],
    lastRoll: entryOrNone(stored.lastRoll),
    importNotes: listOf(stored.importNotes).filter(isText),
  }
}

// The stored fields the record models. `portraitUrl` is listed so that a URL
// stored by mistake is dropped rather than kept: only a portrait's Storage path
// is ever stored. The last four are the writers' own: each save sets
// `updatedAt` itself, a create sets `createdAt`, and the version fields are
// never carried in the record.
const LUBEC_CHARACTER_FIELDS: ReadonlySet<string> = new Set([
  'system', 'name', 'ownerUserId', 'ownerUsername', 'creationMode', 'creationStatus',
  'portraitPath', 'portraitUrl', 'portraitFocusX', 'portraitFocusY', 'tokenIcon', 'lubec',
  'createdAt', 'updatedAt', 'schemaVersion', 'schemaWrittenAt',
])

function unknownFieldsOf(data: StoredCharacter): Pick<LubecCharacterRecord, 'unknownFields'> {
  const unknownFields = fieldsOutside(data, LUBEC_CHARACTER_FIELDS)
  return Object.keys(unknownFields).length > 0 ? { unknownFields } : {}
}

const portraitOf = (identity: CharacterIdentity) => ({
  portraitPath: identity.portraitPath ?? '',
  portraitUrl: null,
  portraitFocusX: identity.portraitFocusX ?? 50,
  portraitFocusY: identity.portraitFocusY ?? 50,
})

/** A stored Lubec character, at the current version, as the sheet's record. */
export function parseLubecCharacter(id: string, data: StoredCharacter): LubecCharacterRecord {
  const identity = readCharacterIdentity(id, data)
  return {
    id,
    system: 'lubec',
    name: identity.name,
    ownerUserId: identity.ownerUserId,
    ownerUsername: identity.ownerUsername ?? null,
    creationMode: identity.creationMode === 'new' ? 'new' : 'established',
    creationStatus: lubecCharacterSummary(data).creationStatus,
    ...portraitOf(identity),
    tokenIcon: identity.tokenIcon ?? lubecDefaultTokenIcon,
    lubec: parseLubecSheet(data.lubec),
    ...unknownFieldsOf(data),
  }
}

/** The fields a save of the record writes; media URLs are left out, because they carry access tokens. */
export function serializeLubecCharacter(character: LubecCharacterRecord): StoredCharacter {
  return {
    ...character.unknownFields,
    system: 'lubec',
    name: character.name,
    ownerUserId: character.ownerUserId,
    ownerUsername: character.ownerUsername,
    creationMode: character.creationMode,
    creationStatus: character.creationStatus,
    portraitPath: character.portraitPath,
    portraitFocusX: character.portraitFocusX,
    portraitFocusY: character.portraitFocusY,
    tokenIcon: sanitizeTokenIconForPersistence(character.tokenIcon),
    lubec: JSON.parse(JSON.stringify(character.lubec)) as unknown,
  }
}

export const lubecCharacterParser: CharacterParser<LubecCharacterRecord> = {
  parse: parseLubecCharacter,
  serialize: serializeLubecCharacter,
}

/** How the shared character store loads and saves Lubec characters. */
export const lubecCharacterStore: CharacterStoreRuleSet<LubecCharacterRecord> = {
  system: 'lubec',
  label: 'Lubec',
  versioning: lubecCharacterVersioning,
  parser: lubecCharacterParser,
}
