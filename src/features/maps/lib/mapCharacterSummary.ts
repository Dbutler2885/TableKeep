import { isRenderableImageUrl } from '../../common/mediaStorage'
import type { TokenIconConfig } from '../../tokens/TokenIconEditor'
import type { CharacterTokenSummary } from './types'

type MapSystem = CharacterTokenSummary['system']
type CreationStatus = CharacterTokenSummary['creationStatus']
type SummaryFields = Pick<CharacterTokenSummary, 'creationStatus' | 'hpCurrent' | 'incapacitated'>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const CREATION_STATUSES = ['draft', 'established_draft', 'active'] as const

// The creation status the document states outright, if it states a known one.
const storedCreationStatus = (data: Record<string, unknown>): CreationStatus | undefined =>
  CREATION_STATUSES.find((status) => status === data.creationStatus)

// An OSE character is a draft only when it was explicitly started as new.
const oseCreationStatus = (data: Record<string, unknown>): CreationStatus =>
  storedCreationStatus(data)
    ?? (data.creationModeExplicit === true && data.creationMode === 'new' ? 'draft' : 'active')

const vtmCreationStatus = (data: Record<string, unknown>): CreationStatus =>
  storedCreationStatus(data) ?? (data.creationMode === 'new' ? 'draft' : 'established_draft')

const vtmIncapacitated = (data: Record<string, unknown>) => {
  const vtm = isRecord(data.vtm) ? data.vtm : null
  const health = vtm && isRecord(vtm.health) ? vtm.health : null
  return health?.Incapacitated === true
}

const oseSummaryFields = (data: Record<string, unknown>): SummaryFields => ({
  creationStatus: oseCreationStatus(data),
  hpCurrent: typeof data.hpCurrent === 'number' ? Math.max(0, data.hpCurrent) : 0,
})

const vtmSummaryFields = (data: Record<string, unknown>): SummaryFields => ({
  creationStatus: vtmCreationStatus(data),
  incapacitated: vtmIncapacitated(data),
})

const SUMMARY_FIELDS: Record<MapSystem, (data: Record<string, unknown>) => SummaryFields> = {
  ose: oseSummaryFields,
  vtm: vtmSummaryFields,
}

const DEFAULT_TOKEN_COLORS: Record<MapSystem, string> = {
  ose: '#bf2f2a',
  vtm: '#7a1a1f',
}

const storedTokenIcon = (data: Record<string, unknown>, system: MapSystem): TokenIconConfig =>
  isRecord(data.tokenIcon)
    ? data.tokenIcon as TokenIconConfig
    : { icon: 'pawn', color: DEFAULT_TOKEN_COLORS[system], size: 34 }

// The URL the local summary already resolved for the same Storage path, so a
// snapshot without one does not blank the token while it is fetched again.
const carriedCustomImageUrl = (tokenIcon: TokenIconConfig, local?: CharacterTokenSummary) =>
  tokenIcon.customImagePath
  && local?.tokenIcon.customImagePath === tokenIcon.customImagePath
  && isRenderableImageUrl(local.tokenIcon.customImageUrl)
    ? local.tokenIcon.customImageUrl
    : undefined

const mapTokenIcon = (
  data: Record<string, unknown>,
  system: MapSystem,
  local?: CharacterTokenSummary,
): TokenIconConfig => {
  const tokenIcon = storedTokenIcon(data, system)
  const customImageUrl = tokenIcon.customImageUrl ?? carriedCustomImageUrl(tokenIcon, local)
  return customImageUrl ? { ...tokenIcon, customImageUrl } : tokenIcon
}

export function mapCharacterSummaryFromData(
  id: string,
  data: Record<string, unknown>,
  local?: CharacterTokenSummary,
): CharacterTokenSummary {
  const system = data.system === 'vtm' ? 'vtm' : 'ose'
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    ownerUserId: typeof data.ownerUserId === 'string' ? data.ownerUserId : '',
    system,
    ...SUMMARY_FIELDS[system](data),
    hidden: data.hidden === true,
    deleted: data.deleted === true || data.deletedAt != null,
    tokenIcon: mapTokenIcon(data, system, local),
  }
}
