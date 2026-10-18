import type { CharacterRecord, CharacterSheetDetails, TokenIconConfig } from '../../../types/app'
import { isRenderableImageUrl } from '../../common/mediaStorage'

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

/** A stored character document as a character record, with every missing field defaulted. */
export function readStoredCharacter(
  id: string,
  data: StoredCharacterFields,
  local: CharacterRecord | undefined,
  viewer: CharacterViewer,
): CharacterRecord {
  const portraitPath = stringOr(data.portraitPath, '')
  const tokenIcon = (data.tokenIcon ?? defaultTokenIcon) as TokenIconConfig
  return {
    id,
    name: (data.name ?? id) as string,
    ownerUserId: (data.ownerUserId ?? '') as string,
    ownerUsername: readOwnerUsername(data, viewer),
    ...readCreationFields(data),
    className: (data.class ?? '-') as string,
    level: numberOr(data.level, 1),
    ...readHitPoints(data),
    ac: numberOr(data.ac, 10),
    xp: numberOr(data.xp, 0),
    portraitPath,
    portraitUrl: readPortraitUrl(data.portraitUrl, portraitPath, local),
    portraitFocusX: numberOr(data.portraitFocusX, 50),
    portraitFocusY: numberOr(data.portraitFocusY, 50),
    tokenIcon: withLocalTokenImage(tokenIcon, local),
    details: readDetails(data.details),
  }
}
