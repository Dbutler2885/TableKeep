import type { TokenIconConfig } from '../../types/app'
import { isRenderableImageUrl, sanitizeTokenIconForPersistence } from '../common/mediaFields'
import { vtmCharacterVersioning } from '../ruleSets/characterMigrations'
import { fieldsOutside, readStoredCharacter, type CharacterParser } from '../ruleSets/characterParser'
import { defaultVtmSheet, defaultVtmTokenIcon } from './vtmDefaults'
import type { VtmCharacterRecord, VtmCharacterSheet } from './vtmTypes'

type StoredFields = Record<string, unknown>

const isRecord = (value: unknown): value is StoredFields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const mergeObject = <T extends StoredFields>(defaults: T, raw: unknown): T => {
  if (!isRecord(raw)) return defaults
  return { ...defaults, ...raw } as T
}

/** One named group out of a stored group-of-groups, such as `attributes.physical`. */
const storedGroup = (groups: unknown, key: string): unknown =>
  groups && isRecord(groups) ? groups[key] : null

const listOr = <T>(raw: unknown, fallback: T): T =>
  Array.isArray(raw) ? raw as T : fallback

const stringOr = <T>(raw: unknown, fallback: T): string | T =>
  typeof raw === 'string' ? raw : fallback

const numberOr = (raw: unknown, fallback: number): number =>
  typeof raw === 'number' ? raw : fallback

/** A stored sheet laid over the default sheet, so a sheet saved before a field existed still has it. */
export function normalizeVtmSheet(raw: unknown): VtmCharacterSheet {
  const defaults = defaultVtmSheet()
  if (!isRecord(raw)) return defaults
  return {
    ...defaults,
    ...raw,
    attributes: {
      physical: mergeObject(defaults.attributes.physical, storedGroup(raw.attributes, 'physical')),
      social: mergeObject(defaults.attributes.social, storedGroup(raw.attributes, 'social')),
      mental: mergeObject(defaults.attributes.mental, storedGroup(raw.attributes, 'mental')),
    },
    abilities: {
      talents: mergeObject(defaults.abilities.talents, storedGroup(raw.abilities, 'talents')),
      skills: mergeObject(defaults.abilities.skills, storedGroup(raw.abilities, 'skills')),
      knowledges: mergeObject(defaults.abilities.knowledges, storedGroup(raw.abilities, 'knowledges')),
    },
    attributePriority: mergeObject(defaults.attributePriority, raw.attributePriority),
    abilityPriority: mergeObject(defaults.abilityPriority, raw.abilityPriority),
    virtues: mergeObject(defaults.virtues, raw.virtues),
    freebieDots: mergeObject(defaults.freebieDots, raw.freebieDots),
    health: mergeObject(defaults.health, raw.health),
    expandedBackground: mergeObject(defaults.expandedBackground, raw.expandedBackground),
    possessions: mergeObject(defaults.possessions, raw.possessions),
    appearance: mergeObject(defaults.appearance, raw.appearance),
    disciplines: listOr(raw.disciplines, defaults.disciplines),
    backgrounds: listOr(raw.backgrounds, defaults.backgrounds),
    otherTraits: listOr(raw.otherTraits, defaults.otherTraits),
    rituals: listOr(raw.rituals, defaults.rituals),
    bloodBonds: listOr(raw.bloodBonds, defaults.bloodBonds),
    havens: listOr(raw.havens, defaults.havens),
    combatWeapons: listOr(raw.combatWeapons, defaults.combatWeapons),
    armor: listOr(raw.armor, defaults.armor),
    xpLedger: listOr(raw.xpLedger, defaults.xpLedger),
  }
}

type CreationMode = VtmCharacterRecord['creationMode']
type CreationStatus = VtmCharacterRecord['creationStatus']

function readCreationStatus(raw: unknown, creationMode: CreationMode): CreationStatus {
  if (raw === 'draft' || raw === 'established_draft' || raw === 'active') return raw
  return creationMode === 'new' ? 'draft' : 'established_draft'
}

// The stored fields the VtM record models. The last four are the writers'
// own: each save sets `updatedAt` itself, a create sets `createdAt`, and the
// version fields are never carried in the record.
const VTM_CHARACTER_FIELDS: ReadonlySet<string> = new Set([
  'system', 'name', 'ownerUserId', 'ownerUsername', 'creationMode', 'creationModeExplicit', 'creationStatus', 'xp',
  'portraitPath', 'portraitUrl', 'portraitFocusX', 'portraitFocusY', 'tokenIcon', 'vtm',
  'createdAt', 'updatedAt', 'schemaVersion', 'schemaWrittenAt',
])

/** The stored fields the record does not model, or nothing when there are none. */
function unknownFieldsOf(data: StoredFields): Pick<VtmCharacterRecord, 'unknownFields'> {
  const unknownFields = fieldsOutside(data, VTM_CHARACTER_FIELDS)
  return Object.keys(unknownFields).length > 0 ? { unknownFields } : {}
}

/** A stored VtM character, at the current version, as the sheet's record. */
export function parseVtmCharacter(id: string, data: StoredFields): VtmCharacterRecord {
  const creationMode = data.creationMode === 'established' ? 'established' : 'new'
  return {
    id,
    system: 'vtm',
    name: stringOr(data.name, 'New Vampire'),
    ownerUserId: stringOr(data.ownerUserId, ''),
    ownerUsername: stringOr(data.ownerUsername, null),
    creationMode,
    creationModeExplicit: data.creationModeExplicit === true,
    creationStatus: readCreationStatus(data.creationStatus, creationMode),
    xp: numberOr(data.xp, 0),
    portraitPath: stringOr(data.portraitPath, ''),
    portraitUrl: stringOr(data.portraitUrl, null),
    portraitFocusX: numberOr(data.portraitFocusX, 50),
    portraitFocusY: numberOr(data.portraitFocusY, 50),
    tokenIcon: (isRecord(data.tokenIcon) ? data.tokenIcon : defaultVtmTokenIcon) as TokenIconConfig,
    vtm: normalizeVtmSheet(data.vtm),
    ...unknownFieldsOf(data),
  }
}

/**
 * The fields a save of the record writes. Media URLs are left out, because
 * they carry access tokens; only their storage paths are stored.
 */
export function serializeVtmCharacter(character: VtmCharacterRecord): StoredFields {
  return {
    ...character.unknownFields,
    system: 'vtm',
    name: character.name,
    ownerUserId: character.ownerUserId,
    ownerUsername: character.ownerUsername ?? null,
    creationMode: character.creationMode,
    creationModeExplicit: character.creationModeExplicit,
    creationStatus: character.creationStatus,
    xp: character.xp,
    portraitPath: character.portraitPath ?? '',
    portraitFocusX: character.portraitFocusX,
    portraitFocusY: character.portraitFocusY,
    tokenIcon: sanitizeTokenIconForPersistence(character.tokenIcon),
    vtm: JSON.parse(JSON.stringify(character.vtm)) as unknown,
  }
}

export const vtmCharacterParser: CharacterParser<VtmCharacterRecord> = {
  parse: parseVtmCharacter,
  serialize: serializeVtmCharacter,
}

/** The portrait URL already resolved locally for the same storage path, if any. */
const localPortraitUrl = (portraitPath: string | undefined, local: VtmCharacterRecord | undefined) =>
  local && local.portraitPath === portraitPath && isRenderableImageUrl(local.portraitUrl) ? local.portraitUrl : null

/** The token image URL already resolved locally for the same storage path, if any. */
const localTokenImageUrl = (tokenIcon: TokenIconConfig, local: VtmCharacterRecord | undefined) =>
  tokenIcon.customImagePath
  && local?.tokenIcon.customImagePath === tokenIcon.customImagePath
  && isRenderableImageUrl(local.tokenIcon.customImageUrl)
    ? local.tokenIcon.customImageUrl
    : undefined

/** The token icon, carrying over the locally resolved image URL for the same storage path. */
function withLocalTokenImage(tokenIcon: TokenIconConfig, local: VtmCharacterRecord | undefined): TokenIconConfig {
  const customImageUrl = tokenIcon.customImageUrl ?? localTokenImageUrl(tokenIcon, local)
  return customImageUrl ? { ...tokenIcon, customImageUrl } : tokenIcon
}

/**
 * The record with any media URL it lacks taken from the local copy, so a
 * snapshot does not blank an image it did not change. A stored URL wins.
 */
const withLocalMedia = (character: VtmCharacterRecord, local: VtmCharacterRecord | undefined): VtmCharacterRecord => ({
  ...character,
  portraitUrl: character.portraitUrl ?? localPortraitUrl(character.portraitPath, local),
  tokenIcon: withLocalTokenImage(character.tokenIcon, local),
})

/**
 * A stored character document as a VtM character, or null when it belongs to
 * another system. VtM's steps bring it up to the current version before it is
 * parsed; nothing is written because of a read.
 */
export function readVtmCharacterDoc(
  id: string,
  data: StoredFields,
  local: VtmCharacterRecord | undefined,
): VtmCharacterRecord | null {
  if (data.system !== 'vtm') return null
  return withLocalMedia(readStoredCharacter(vtmCharacterVersioning, vtmCharacterParser, id, data), local)
}
