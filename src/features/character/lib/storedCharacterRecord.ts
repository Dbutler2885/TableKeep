import type { CharacterRecord, CharacterSheetDetails, TokenIconConfig } from '../../../types/app'
import { isRenderableImageUrl, sanitizeTokenIconForPersistence } from '../../common/mediaFields'
import { oseCharacterVersioning } from '../../ruleSets/characterMigrations'
import { fieldsOutside, readCharacter, type CharacterParser } from '../../ruleSets/characterParser'

export type StoredCharacterFields = Record<string, unknown>

/** Who is reading, so a document without an owner name can be named after its owner when that is them. */
export type CharacterViewer = { userId: string; currentUsername: string }

type CreationFields = Pick<CharacterRecord, 'creationMode' | 'creationModeExplicit' | 'creationStatus'>

const defaultTokenIcon: TokenIconConfig = {
  icon: 'pawn',
  color: '#bf2f2a',
  size: 34,
}

const numberOr = (raw: unknown, fallback: number): number =>
  typeof raw === 'number' ? raw : fallback

const stringOr = <T>(raw: unknown, fallback: T): string | T =>
  typeof raw === 'string' ? raw : fallback

const isStoredCreationStatus = (raw: unknown): raw is CharacterRecord['creationStatus'] =>
  raw === 'draft' || raw === 'established_draft' || raw === 'active'

/**
 * The creation mode counts only when it was chosen explicitly; a status that
 * was never stored is a draft for an explicitly new character, else active.
 */
export function readCreationFields(data: StoredCharacterFields): CreationFields {
  const creationModeExplicit = data.creationModeExplicit === true
  const creationMode = creationModeExplicit && data.creationMode === 'established' ? 'established' : 'new'
  if (isStoredCreationStatus(data.creationStatus)) {
    return { creationMode, creationModeExplicit, creationStatus: data.creationStatus }
  }
  const creationStatus = creationModeExplicit && creationMode === 'new' ? 'draft' : 'active'
  return { creationMode, creationModeExplicit, creationStatus }
}

/** A copy of the stored sheet details without the retired AC override, or null when there are none. */
export function readDetails(raw: unknown): CharacterSheetDetails | null {
  if (typeof raw !== 'object' || raw === null) return null
  const normalized = { ...(raw as Record<string, unknown>) }
  delete normalized.acManualOverride
  return normalized as CharacterSheetDetails
}

/** Hit points with the max at least zero and the current between zero and the max. */
export function readHitPoints(data: StoredCharacterFields) {
  const hpMax = Math.max(0, numberOr(data.hpMax, 0))
  const hpCurrent = Math.max(0, Math.min(numberOr(data.hpCurrent, 0), hpMax))
  return { hpCurrent, hpMax }
}

export function readOwnerUsername(data: StoredCharacterFields, viewer: CharacterViewer): string | null {
  if (typeof data.ownerUsername === 'string') return data.ownerUsername
  return (data.ownerUserId ?? '') === viewer.userId ? viewer.currentUsername : null
}

/**
 * The stored portrait URL, or else the URL already resolved locally for the
 * same storage path, so a snapshot does not blank an image it did not change.
 */
export function readPortraitUrl(raw: unknown, portraitPath: string, local: CharacterRecord | undefined): string | null {
  const persisted = stringOr(raw, null)
  if (persisted !== null) return persisted
  return local?.portraitPath === portraitPath && isRenderableImageUrl(local.portraitUrl) ? local.portraitUrl : null
}

/** The token image URL already resolved locally for the same storage path, if any. */
const localTokenImageUrl = (tokenIcon: TokenIconConfig, local: CharacterRecord | undefined) =>
  local?.tokenIcon.customImagePath
  && local.tokenIcon.customImagePath === tokenIcon.customImagePath
  && isRenderableImageUrl(local.tokenIcon.customImageUrl)
    ? local.tokenIcon.customImageUrl
    : undefined

/** The token icon, carrying over the locally resolved image URL for the same storage path. */
export function withLocalTokenImage(tokenIcon: TokenIconConfig, local: CharacterRecord | undefined): TokenIconConfig {
  const customImageUrl = tokenIcon.customImageUrl ?? localTokenImageUrl(tokenIcon, local)
  return customImageUrl ? { ...tokenIcon, customImageUrl } : tokenIcon
}

// The stored fields the OSE record models. The last four are the writers'
// own: each save sets `updatedAt` itself, a create sets `createdAt`, and the
// version fields are never carried in the record.
const OSE_CHARACTER_FIELDS: ReadonlySet<string> = new Set([
  'name', 'ownerUserId', 'ownerUsername', 'creationMode', 'creationModeExplicit', 'creationStatus', 'class', 'level',
  'hpCurrent', 'hpMax', 'ac', 'xp', 'portraitPath', 'portraitUrl', 'portraitFocusX', 'portraitFocusY', 'tokenIcon',
  'details', 'createdAt', 'updatedAt', 'schemaVersion', 'schemaWrittenAt',
])

/** The stored fields the record does not model, or nothing when there are none. */
function unknownFieldsOf(data: StoredCharacterFields): Pick<CharacterRecord, 'unknownFields'> {
  const unknownFields = fieldsOutside(data, OSE_CHARACTER_FIELDS)
  return Object.keys(unknownFields).length > 0 ? { unknownFields } : {}
}

/** A stored OSE character, at the current version, as the sheet's record, with every missing field defaulted. */
export function parseOseCharacter(id: string, data: StoredCharacterFields): CharacterRecord {
  return {
    id,
    name: (data.name ?? id) as string,
    ownerUserId: (data.ownerUserId ?? '') as string,
    ownerUsername: stringOr(data.ownerUsername, null),
    ...readCreationFields(data),
    className: (data.class ?? '-') as string,
    level: numberOr(data.level, 1),
    ...readHitPoints(data),
    ac: numberOr(data.ac, 10),
    xp: numberOr(data.xp, 0),
    portraitPath: stringOr(data.portraitPath, ''),
    portraitUrl: stringOr(data.portraitUrl, null),
    portraitFocusX: numberOr(data.portraitFocusX, 50),
    portraitFocusY: numberOr(data.portraitFocusY, 50),
    tokenIcon: (data.tokenIcon ?? defaultTokenIcon) as TokenIconConfig,
    details: readDetails(data.details),
    ...unknownFieldsOf(data),
  }
}

/**
 * The fields a save of the record writes. Media URLs are left out, because
 * they carry access tokens; only their storage paths are stored.
 */
export function serializeOseCharacter(character: CharacterRecord): StoredCharacterFields {
  return {
    ...character.unknownFields,
    name: character.name,
    ownerUserId: character.ownerUserId,
    ownerUsername: character.ownerUsername ?? null,
    creationMode: character.creationMode,
    creationModeExplicit: character.creationModeExplicit,
    creationStatus: character.creationStatus,
    class: character.className,
    level: character.level,
    hpCurrent: character.hpCurrent,
    hpMax: character.hpMax,
    ac: character.ac,
    xp: character.xp,
    portraitPath: character.portraitPath ?? '',
    portraitFocusX: character.portraitFocusX,
    portraitFocusY: character.portraitFocusY,
    tokenIcon: sanitizeTokenIconForPersistence(character.tokenIcon),
    details: character.details ? JSON.parse(JSON.stringify(character.details)) : null,
  }
}

export const oseCharacterParser: CharacterParser<CharacterRecord> = {
  parse: parseOseCharacter,
  serialize: serializeOseCharacter,
}

/**
 * A stored character document as the OSE sheet's record. OSE's steps bring it
 * up to the current version before it is parsed, and nothing is written
 * because of a read. A missing owner name and media URLs are then filled in
 * from the viewer and the local copy.
 */
export function readStoredCharacter(
  id: string,
  data: StoredCharacterFields,
  local: CharacterRecord | undefined,
  viewer: CharacterViewer,
): CharacterRecord {
  const record = readCharacter(oseCharacterVersioning, oseCharacterParser, id, data).record
  return {
    ...record,
    ownerUsername: readOwnerUsername(record, viewer),
    portraitUrl: readPortraitUrl(record.portraitUrl, record.portraitPath ?? '', local),
    tokenIcon: withLocalTokenImage(record.tokenIcon, local),
  }
}
