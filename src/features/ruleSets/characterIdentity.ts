import type { CharacterRecord } from '../../types/app'
import type { TokenIconConfig } from '../tokens/TokenIconEditor'
import type { StoredCharacter } from './storedCharacter'

export type CreationStatus = CharacterRecord['creationStatus']

// The fields every rule set's characters share, and the only ones shared code
// may read. Hit points, classes and any rule-set blob belong to the rule set.
export type CharacterIdentity = {
  id: string
  name: string
  ownerUserId: string
  ownerUsername?: string
  creationMode?: CharacterRecord['creationMode']
  // The creation status as stored; each rule set decides what a missing one means.
  creationStatus?: CreationStatus
  portraitPath?: string
  portraitFocusX?: number
  portraitFocusY?: number
  tokenIcon?: TokenIconConfig
  hidden: boolean
  deleted: boolean
  createdAt?: unknown
  updatedAt?: unknown
  // The rule set's id; OSE characters store none.
  system?: string
  // A missing version means 0, written before versioning.
  schemaVersion?: number
  schemaWrittenAt?: unknown
}

// What a rule set says of one of its characters on the map, read from the
// stored values with the map's own defaults rather than the sheet's.
export type CharacterSummary = {
  creationStatus: CreationStatus
  // Whether the character counts towards the party: whole-party token
  // placement and the GM's party list take only characters in play.
  inPlay: boolean
}

export type CharacterSummaryReader = (stored: StoredCharacter) => CharacterSummary

const CREATION_MODES = ['new', 'established'] as const
const CREATION_STATUSES = ['draft', 'established_draft', 'active'] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const optionalText = (value: unknown) => (typeof value === 'string' ? value : undefined)

const optionalNumber = (value: unknown) => (typeof value === 'number' ? value : undefined)

const optionalWholeNumber = (value: unknown) =>
  Number.isInteger(value) && (value as number) >= 0 ? value as number : undefined

const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined =>
  values.find((known) => known === value)

/** The creation status a stored character states outright, if it states a known one. */
export const storedCreationStatus = (stored: StoredCharacter): CreationStatus | undefined =>
  oneOf(CREATION_STATUSES, stored.creationStatus)

/** Reads the common identity off a stored character, whatever its rule set. */
export function readCharacterIdentity(id: string, stored: StoredCharacter): CharacterIdentity {
  return {
    id,
    name: optionalText(stored.name) ?? '',
    ownerUserId: optionalText(stored.ownerUserId) ?? '',
    ownerUsername: optionalText(stored.ownerUsername),
    creationMode: oneOf(CREATION_MODES, stored.creationMode),
    creationStatus: storedCreationStatus(stored),
    portraitPath: optionalText(stored.portraitPath),
    portraitFocusX: optionalNumber(stored.portraitFocusX),
    portraitFocusY: optionalNumber(stored.portraitFocusY),
    tokenIcon: isRecord(stored.tokenIcon) ? stored.tokenIcon as TokenIconConfig : undefined,
    hidden: stored.hidden === true,
    deleted: stored.deleted === true || stored.deletedAt != null,
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
    system: optionalText(stored.system),
    schemaVersion: optionalWholeNumber(stored.schemaVersion),
    schemaWrittenAt: stored.schemaWrittenAt,
  }
}
