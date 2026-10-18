import type { TokenIconConfig } from '../../types/app'
import { isRenderableImageUrl } from '../common/mediaStorage'
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

/**
 * The stored portrait URL, or else the URL already resolved locally for the
 * same storage path, so a snapshot does not blank an image it did not change.
 */
function readPortraitUrl(raw: unknown, portraitPath: string, local: VtmCharacterRecord | undefined): string | null {
  const persisted = stringOr(raw, null)
  if (persisted !== null) return persisted
  return local?.portraitPath === portraitPath && isRenderableImageUrl(local.portraitUrl) ? local.portraitUrl : null
}

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

/** A stored character document as a VtM character, or null when it belongs to another system. */
export function readVtmCharacterDoc(
  id: string,
  data: StoredFields,
  local: VtmCharacterRecord | undefined,
): VtmCharacterRecord | null {
  if (data.system !== 'vtm') return null
  const tokenIcon = (isRecord(data.tokenIcon) ? data.tokenIcon : defaultVtmTokenIcon) as TokenIconConfig
  const portraitPath = stringOr(data.portraitPath, '')
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
    portraitPath,
    portraitUrl: readPortraitUrl(data.portraitUrl, portraitPath, local),
    portraitFocusX: numberOr(data.portraitFocusX, 50),
    portraitFocusY: numberOr(data.portraitFocusY, 50),
    tokenIcon: withLocalTokenImage(tokenIcon, local),
    vtm: normalizeVtmSheet(data.vtm),
  }
}
