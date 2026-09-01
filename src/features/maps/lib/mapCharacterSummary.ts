import { isRenderableImageUrl } from '../../common/mediaStorage'
import type { TokenIconConfig } from '../../tokens/TokenIconEditor'
import type { CharacterTokenSummary } from './types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const creationStatusForMap = (
  data: Record<string, unknown>,
  system: CharacterTokenSummary['system'],
): CharacterTokenSummary['creationStatus'] => {
  if (data.creationStatus === 'draft' || data.creationStatus === 'established_draft' || data.creationStatus === 'active') {
    return data.creationStatus
  }
  if (system === 'vtm') {
    return data.creationMode === 'new' ? 'draft' : 'established_draft'
  }
  return data.creationModeExplicit === true && data.creationMode === 'new' ? 'draft' : 'active'
}

const vtmIncapacitated = (data: Record<string, unknown>) => {
  const vtm = isRecord(data.vtm) ? data.vtm : null
  const health = vtm && isRecord(vtm.health) ? vtm.health : null
  return health?.Incapacitated === true
}

export function mapCharacterSummaryFromData(
  id: string,
  data: Record<string, unknown>,
  local?: CharacterTokenSummary,
): CharacterTokenSummary {
  const system = data.system === 'vtm' ? 'vtm' : 'ose'
  const fallbackTokenIcon: TokenIconConfig = {
    icon: 'pawn',
    color: system === 'vtm' ? '#7a1a1f' : '#bf2f2a',
    size: 34,
  }
  const tokenIcon = isRecord(data.tokenIcon)
    ? data.tokenIcon as TokenIconConfig
    : fallbackTokenIcon
  const customImageUrl = tokenIcon.customImageUrl
    ?? (
      tokenIcon.customImagePath
      && local?.tokenIcon.customImagePath === tokenIcon.customImagePath
      && isRenderableImageUrl(local.tokenIcon.customImageUrl)
        ? local.tokenIcon.customImageUrl
        : undefined
    )

  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    ownerUserId: typeof data.ownerUserId === 'string' ? data.ownerUserId : '',
    system,
    creationStatus: creationStatusForMap(data, system),
    ...(system === 'ose'
      ? { hpCurrent: typeof data.hpCurrent === 'number' ? Math.max(0, data.hpCurrent) : 0 }
      : { incapacitated: vtmIncapacitated(data) }),
    hidden: data.hidden === true,
    deleted: data.deleted === true || data.deletedAt != null,
    tokenIcon: customImageUrl ? { ...tokenIcon, customImageUrl } : tokenIcon,
  }
}
