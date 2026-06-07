import { nextDuplicateTokenName, type ExistingTokenName } from './duplicateTokenNaming'

export type TokenPlacementPoint = {
  x: number
  y: number
}

export type TokenPlacementIcon = {
  icon: 'pawn' | 'custom'
  color: string
  size: number
  customImagePath?: string
  customImageUrl?: string
  customImageName?: string
}

export const DEFAULT_PAWN_TOKEN_ICON: TokenPlacementIcon = {
  icon: 'pawn',
  color: '#2f5bbf',
  size: 34,
}

type BaseTokenPlacementSource = {
  id: string
  name: string
  tokenIcon?: TokenPlacementIcon | null
}

export type NpcTokenPlacementSource = BaseTokenPlacementSource & {
  kind: 'npc'
}

export type MonsterTokenPlacementSource = BaseTokenPlacementSource & {
  kind: 'monster'
}

export type PartyCharacterTokenPlacementSource = BaseTokenPlacementSource & {
  kind: 'partyCharacter'
}

export type GenericTokenPlacementSource = BaseTokenPlacementSource & {
  kind: 'genericToken'
  imagePath?: string
  imageUrl?: string
  imageWidth?: number
  imageHeight?: number
}

export type TokenPlacementSource =
  | NpcTokenPlacementSource
  | MonsterTokenPlacementSource
  | PartyCharacterTokenPlacementSource
  | GenericTokenPlacementSource

export type TokenPlacementQueueState =
  | {
      kind: 'one'
      source: Exclude<TokenPlacementSource, MonsterTokenPlacementSource>
      reservedNames: string[]
    }
  | {
      kind: 'wholeParty'
      sources: PartyCharacterTokenPlacementSource[]
      index: number
      reservedNames: string[]
    }
  | {
      kind: 'monster'
      source: MonsterTokenPlacementSource
      remaining: number
      total: number
      reservedNames: string[]
    }

export type TokenPlacementDisplay = {
  active: boolean
  kind: TokenPlacementQueueState['kind'] | null
  current: TokenPlacementSource | null
  remaining: number
  total: number
  canCancel: boolean
  countdown: number | null
}

export type TokenPlacementCommand = {
  type: 'placeToken'
  sourceKind: TokenPlacementSource['kind']
  sourceId: string
  name: string
  point: TokenPlacementPoint
  tokenIcon: TokenPlacementIcon
  party: boolean
  revealName: boolean
  monsterId: string
  characterId: string
  npcId: string
  tokenAssetId: string
  tokenImagePath: string
  tokenImageUrl: string
  tokenImageWidth: number
  tokenImageHeight: number
}

export type TokenPlacementDropResult = {
  command: TokenPlacementCommand | null
  nextQueue: TokenPlacementQueueState | null
  completed: boolean
  display: TokenPlacementDisplay
}

export function startOneAtATimeTokenPlacement(
  source: Exclude<TokenPlacementSource, MonsterTokenPlacementSource>,
): TokenPlacementQueueState {
  return { kind: 'one', source, reservedNames: [] }
}

export function startWholePartyTokenPlacement(
  sources: readonly PartyCharacterTokenPlacementSource[],
): TokenPlacementQueueState | null {
  if (sources.length === 0) return null
  return { kind: 'wholeParty', sources: [...sources], index: 0, reservedNames: [] }
}

export function startMonsterTokenPlacement(
  source: MonsterTokenPlacementSource,
  count: number,
): TokenPlacementQueueState | null {
  const total = Math.floor(count)
  if (total <= 0) return null
  return { kind: 'monster', source, remaining: total, total, reservedNames: [] }
}

export function cancelTokenPlacementQueue(): null {
  return null
}

export function getTokenPlacementDisplay(
  queue: TokenPlacementQueueState | null,
): TokenPlacementDisplay {
  if (!queue) {
    return {
      active: false,
      kind: null,
      current: null,
      remaining: 0,
      total: 0,
      canCancel: false,
      countdown: null,
    }
  }

  if (queue.kind === 'wholeParty') {
    const remaining = Math.max(0, queue.sources.length - queue.index)
    return {
      active: true,
      kind: queue.kind,
      current: queue.sources[queue.index] ?? null,
      remaining,
      total: queue.sources.length,
      canCancel: true,
      countdown: remaining,
    }
  }

  if (queue.kind === 'monster') {
    return {
      active: true,
      kind: queue.kind,
      current: queue.source,
      remaining: queue.remaining,
      total: queue.total,
      canCancel: true,
      countdown: queue.remaining,
    }
  }

  return {
    active: true,
    kind: queue.kind,
    current: queue.source,
    remaining: 1,
    total: 1,
    canCancel: true,
    countdown: null,
  }
}

export function dropTokenPlacement(
  queue: TokenPlacementQueueState | null,
  point: TokenPlacementPoint,
  existingTokensOrNames: readonly ExistingTokenName[],
): TokenPlacementDropResult {
  if (!queue) {
    return {
      command: null,
      nextQueue: null,
      completed: true,
      display: getTokenPlacementDisplay(null),
    }
  }

  const source = currentTokenPlacementSource(queue)
  if (!source) {
    return {
      command: null,
      nextQueue: null,
      completed: true,
      display: getTokenPlacementDisplay(null),
    }
  }

  const command = buildPlacementCommand(source, point, [
    ...existingTokensOrNames,
    ...queue.reservedNames,
  ])
  const reservedNames = [...queue.reservedNames, command.name]
  const nextQueue = advanceQueue(queue, reservedNames)
  const completed = nextQueue === null

  return {
    command,
    nextQueue,
    completed,
    display: getTokenPlacementDisplay(nextQueue),
  }
}

function currentTokenPlacementSource(queue: TokenPlacementQueueState): TokenPlacementSource | null {
  switch (queue.kind) {
    case 'one':
    case 'monster':
      return queue.source
    case 'wholeParty':
      return queue.sources[queue.index] ?? null
    default:
      return null
  }
}

function advanceQueue(
  queue: TokenPlacementQueueState,
  reservedNames: string[],
): TokenPlacementQueueState | null {
  switch (queue.kind) {
    case 'one':
      return null
    case 'wholeParty': {
      const nextIndex = queue.index + 1
      if (nextIndex >= queue.sources.length) return null
      return { ...queue, index: nextIndex, reservedNames }
    }
    case 'monster': {
      const nextRemaining = queue.remaining - 1
      if (nextRemaining <= 0) return null
      return { ...queue, remaining: nextRemaining, reservedNames }
    }
    default:
      return null
  }
}

function buildPlacementCommand(
  source: TokenPlacementSource,
  point: TokenPlacementPoint,
  existingTokensOrNames: readonly ExistingTokenName[],
): TokenPlacementCommand {
  const tokenIcon = resolveTokenPlacementIcon(source)
  const name = nextDuplicateTokenName(source.name, existingTokensOrNames)

  return {
    type: 'placeToken',
    sourceKind: source.kind,
    sourceId: source.id,
    name,
    point,
    tokenIcon,
    party: source.kind === 'partyCharacter',
    revealName: source.kind === 'partyCharacter' || source.kind === 'npc',
    monsterId: source.kind === 'monster' ? source.id : '',
    characterId: source.kind === 'partyCharacter' ? source.id : '',
    npcId: source.kind === 'npc' ? source.id : '',
    tokenAssetId: source.kind === 'genericToken' ? source.id : '',
    tokenImagePath: tokenImagePathFor(source, tokenIcon),
    tokenImageUrl: tokenImageUrlFor(source, tokenIcon),
    tokenImageWidth: source.kind === 'genericToken' ? source.imageWidth ?? 0 : 0,
    tokenImageHeight: source.kind === 'genericToken' ? source.imageHeight ?? 0 : 0,
  }
}

function resolveTokenPlacementIcon(source: TokenPlacementSource): TokenPlacementIcon {
  if (source.tokenIcon && isConfiguredTokenIcon(source.tokenIcon)) return source.tokenIcon
  if (source.kind === 'genericToken' && (source.imagePath || source.imageUrl)) {
    return {
      icon: 'custom',
      color: DEFAULT_PAWN_TOKEN_ICON.color,
      size: source.tokenIcon?.size ?? DEFAULT_PAWN_TOKEN_ICON.size,
      customImagePath: source.imagePath,
      customImageUrl: source.imageUrl,
      customImageName: source.name,
    }
  }
  return DEFAULT_PAWN_TOKEN_ICON
}

function isConfiguredTokenIcon(tokenIcon: TokenPlacementIcon): boolean {
  return tokenIcon.icon === 'pawn' || Boolean(tokenIcon.customImagePath || tokenIcon.customImageUrl)
}

function tokenImagePathFor(source: TokenPlacementSource, tokenIcon: TokenPlacementIcon): string {
  if (source.kind === 'genericToken') return source.imagePath ?? tokenIcon.customImagePath ?? ''
  return tokenIcon.customImagePath ?? ''
}

function tokenImageUrlFor(source: TokenPlacementSource, tokenIcon: TokenPlacementIcon): string {
  if (source.kind === 'genericToken') return source.imageUrl ?? tokenIcon.customImageUrl ?? ''
  return tokenIcon.icon === 'custom' ? tokenIcon.customImageUrl ?? '' : ''
}
