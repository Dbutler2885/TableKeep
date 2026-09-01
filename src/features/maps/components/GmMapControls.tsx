import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { onSnapshot } from 'firebase/firestore'
import {
  ALargeSmall, Binoculars, ChessPawn, Eraser, Eye, EyeOff, Flag, FlipHorizontal,
  FlipVertical, Grid3X3, Hand, Hexagon, LoaderCircle, Minus, PenTool, Pencil, Plus,
  RotateCw, Ruler, RulerDimensionLine, SprayCan, SquareDashedMousePointer,
  Tag, Trash2, TvMinimalPlay, User, UserRoundPen, Users, X,
} from 'lucide-react'
import { db } from '../../../firebase'
import type { NpcPrivateRecord } from '../../../types/app'
import { campaignDocRef } from '../../campaign/firestorePaths'
import { TokenIconEditor, type TokenIconConfig } from '../../tokens/TokenIconEditor'
import { ConfirmModal } from '../../common/ConfirmModal'
import { IconValueSlider } from '../../common/IconValueSlider'
import { sanitizeRichText } from '../../common/richText'
import type { NpcSummary, TokenAssetRecord, TokenRecord } from '../lib/types'
import { DEFAULT_TOKEN_VIEW_DISTANCE, TOKEN_SIZE_MAX, TOKEN_SIZE_MIN } from '../lib/constants'
import { getTokenPlacementDisplay, type MonsterTokenPlacementSource, type TokenPlacementSource } from '../lib/tokenPlacementQueue'
import {
  buildWholePartyTokenPlacementSources,
  partyPlacementControlsAvailable,
  toGenericTokenPlacementSource,
  toNpcTokenPlacementSource,
} from '../lib/tokenPlacementSources'
import { normalizeTokenRotation } from '../lib/tokenRotation'
import { sceneNpcPrivateDocSegments, toNpcGmNotes } from '../lib/sceneNpcRecord'
import { BrushSizeControl } from './BrushSizeControl'
import { DistanceTrackerBadge } from './DistanceTrackerBadge'
import { ModeConfirmAction } from './ModeConfirmAction'
import { SceneNpcEditorModal } from './SceneNpcEditorModal'

export function GmMapControls({
  campaignId,
  groupId,
  dark = false,
  showTopTools = true,
  fogTool,
  setFogTool,
  visionTool,
  setVisionTool,
  fogBrushSize,
  setFogBrushSize,
  tokenSelectMode,
  setTokenSelectMode,
  annotationPlaceMode,
  setAnnotationPlaceMode,
  playerLabelPlaceMode,
  setPlayerLabelPlaceMode,
  gmHideLabels,
  setGmHideLabels,
  handToolActive,
  setHandToolActive,
  tokenColor,
  setTokenColor,
  tokenSize,
  setTokenSize,
  tokenAssets,
  selectedTokenAssetId,
  setSelectedTokenAssetId,
  selectedTokenImageUrl,
  uploadingTokenImage,
  onUploadTokenImage,
  onArchiveTokenAsset,
  onRequestDeleteTokenAsset,
  placementDisplay,
  partyPlacementSources,
  monsterPlacementSources,
  npcPlacementSources,
  genericPlacementSources,
  onStartSinglePlacement,
  onStartWholePartyPlacement,
  onStartMonsterPlacement,
  onCancelPlacement,
  playerViewPreview,
  setPlayerViewPreview,
  npcSceneMode,
  setNpcSceneMode,
  gridVisible,
  gridType,
  gridAdjustMode,
  onToggleGridVisible,
  onSetGridType,
  onApplyGrid,
  hexDetecting,
  hexDetectConfidence,
  gridAdjustReady,
  gridAdjustSaved,
  gridCalibrateMode,
  onToggleGridCalibrate,
  gridCalibrateReady,
  gridCalibrateSaved,
  onApplyGridCalibration,
  measurementToolEnabled,
  gridMeasureMode,
  onToggleGridMeasure,
  measurementFeetLabel,
  distanceTrackerFeet,
  distanceTrackerMode,
  distanceTrackerRoll,
  onResetDistanceTracker,
  applyFogPreset,
  canApplyPreset,
  fullyHidden,
  tokens,
  selectedTokenIds,
  onSelectedTokenIdsChange,
  onUpdateToken,
  onUpdateTokenSize,
  onUpdateTokenViewDistance,
  tokenViewDistanceSliderValue,
  onRequestDeleteTokens,
  mapNpcs,
  sceneNpcs,
  presentedNpc,
  selectedMapSceneNpcIds,
  onToggleSceneNpc,
  onPresentNpc,
  onClearPresentedNpc,
}: {
  campaignId: string
  groupId: string
  dark?: boolean
  showTopTools?: boolean
  fogTool: 'reveal' | 'hide' | null
  setFogTool: (tool: 'reveal' | 'hide' | null) => void
  visionTool: 'draw' | 'drawFull' | 'erase' | null
  setVisionTool: (tool: 'draw' | 'drawFull' | 'erase' | null) => void
  fogBrushSize: number
  setFogBrushSize: (size: number) => void
  tokenSelectMode: boolean
  setTokenSelectMode: (value: boolean) => void
  annotationPlaceMode: boolean
  setAnnotationPlaceMode: (value: boolean) => void
  playerLabelPlaceMode: boolean
  setPlayerLabelPlaceMode: (value: boolean) => void
  gmHideLabels: boolean
  setGmHideLabels: (value: boolean) => void
  handToolActive: boolean
  setHandToolActive: (value: boolean) => void
  tokenColor: string
  setTokenColor: (value: string) => void
  tokenSize: number
  setTokenSize: (value: number) => void
  tokenAssets: TokenAssetRecord[]
  selectedTokenAssetId: string
  setSelectedTokenAssetId: (value: string) => void
  selectedTokenImageUrl: string
  uploadingTokenImage: boolean
  onUploadTokenImage: (file: File, assetName?: string) => Promise<void>
  onArchiveTokenAsset: (assetId: string, archived: boolean) => Promise<void>
  onRequestDeleteTokenAsset: (assetId: string) => void
  placementDisplay: ReturnType<typeof getTokenPlacementDisplay>
  partyPlacementSources: ReturnType<typeof buildWholePartyTokenPlacementSources>
  monsterPlacementSources: MonsterTokenPlacementSource[]
  npcPlacementSources: ReturnType<typeof toNpcTokenPlacementSource>[]
  genericPlacementSources: ReturnType<typeof toGenericTokenPlacementSource>[]
  onStartSinglePlacement: (source: Exclude<TokenPlacementSource, MonsterTokenPlacementSource>) => void
  onStartWholePartyPlacement: () => void
  onStartMonsterPlacement: (source: MonsterTokenPlacementSource, count: number) => void
  onCancelPlacement: () => void
  playerViewPreview: boolean
  setPlayerViewPreview: (value: boolean) => void
  npcSceneMode: boolean
  setNpcSceneMode: (value: boolean) => void
  gridVisible: boolean
  gridType: 'square' | 'hex-pointy' | 'hex-flat'
  gridAdjustMode: boolean
  onToggleGridVisible: () => void
  onSetGridType: (gridType: 'square' | 'hex-pointy' | 'hex-flat') => void
  onApplyGrid: () => void
  hexDetecting: boolean
  hexDetectConfidence: number | null
  gridAdjustReady: boolean
  gridAdjustSaved: boolean
  gridCalibrateMode: boolean
  onToggleGridCalibrate: () => void
  gridCalibrateReady: boolean
  gridCalibrateSaved: boolean
  onApplyGridCalibration: () => void
  measurementToolEnabled: boolean
  gridMeasureMode: boolean
  onToggleGridMeasure: () => void
  measurementFeetLabel: string
  distanceTrackerFeet: number
  distanceTrackerMode: 'count' | 'first' | 'roll'
  distanceTrackerRoll: number | null
  onResetDistanceTracker: () => void
  applyFogPreset: (preset: 'hide-all' | 'unhide-all') => Promise<void>
  canApplyPreset: boolean
  fullyHidden: boolean
  tokens: TokenRecord[]
  selectedTokenIds: string[]
  onSelectedTokenIdsChange: Dispatch<SetStateAction<string[]>>
  onUpdateToken: (
    tokenId: string,
    updates: Partial<
      Pick<
        TokenRecord,
        | 'color'
        | 'size'
        | 'sizeScale'
        | 'rotationDeg'
        | 'flipHorizontal'
        | 'flipVertical'
        | 'viewDistance'
        | 'viewDistanceScale'
        | 'party'
        | 'name'
        | 'revealName'
        | 'hidden'
        | 'group'
      >
    >,
  ) => Promise<void>
  onUpdateTokenSize: (tokenId: string, size: number) => Promise<void>
  onUpdateTokenViewDistance: (tokenId: string, viewDistance: number) => Promise<void>
  tokenViewDistanceSliderValue: (token: TokenRecord) => number
  onRequestDeleteTokens: (tokenIds: string[]) => void
  mapNpcs: NpcSummary[]
  sceneNpcs: NpcSummary[]
  presentedNpc: NpcSummary | null
  selectedMapSceneNpcIds: string[]
  onToggleSceneNpc: (npcId: string, enabled: boolean) => void
  onPresentNpc: (npcId: string) => void
  onClearPresentedNpc: () => void
}) {
  const partyControlsAvailable = partyPlacementControlsAvailable(partyPlacementSources)
  const toggleHidden = () => {
    void applyFogPreset(fullyHidden ? 'unhide-all' : 'hide-all')
  }

  const [tokenNameDrafts, setTokenNameDrafts] = useState<Record<string, string>>({})
  const [tokensCollapsed, setTokensCollapsed] = useState(false)
  const [partyPlacementCollapsed, setPartyPlacementCollapsed] = useState(true)
  const [nonPartyPlacementCollapsed, setNonPartyPlacementCollapsed] = useState(true)
  const [collapsedTokenGroupKeys, setCollapsedTokenGroupKeys] = useState<string[]>([])
  const [collapsedSubgroupKeys, setCollapsedSubgroupKeys] = useState<string[]>([])
  const [makeGroupModalOpen, setMakeGroupModalOpen] = useState(false)
  const [makeGroupNameDraft, setMakeGroupNameDraft] = useState('')
  const [disbandCandidate, setDisbandCandidate] = useState<{ name: string; tokenIds: string[] } | null>(null)
  const [sceneNpcPickerId, setSceneNpcPickerId] = useState('')
  const [sceneNpcModalId, setSceneNpcModalId] = useState('')
  const [presentedNpcGmNotesState, setPresentedNpcGmNotesState] = useState({ npcId: '', gmNotes: '' })
  const [monsterPlacementCounts, setMonsterPlacementCounts] = useState<Record<string, number>>({})
  const [nonPartySourceKey, setNonPartySourceKey] = useState('')
  const [nonPartySearch, setNonPartySearch] = useState('')
  const [genericTokenName, setGenericTokenName] = useState('Token')
  const [lastTokenListSelectionId, setLastTokenListSelectionId] = useState('')
  const genericCreatorKey = 'generic:create'
  const availableSceneNpcs = useMemo(
    () => mapNpcs.filter((npc) => !selectedMapSceneNpcIds.includes(npc.id)),
    [mapNpcs, selectedMapSceneNpcIds],
  )
  const allNpcTags = useMemo(
    () => Array.from(new Set(mapNpcs.flatMap((npc) => npc.tags))).sort((a, b) => a.localeCompare(b)),
    [mapNpcs],
  )
  const effectiveSceneNpcPickerId = availableSceneNpcs.some((npc) => npc.id === sceneNpcPickerId)
    ? sceneNpcPickerId
    : availableSceneNpcs[0]?.id ?? ''
  const presentedNpcGmNotes = presentedNpcGmNotesState.npcId === presentedNpc?.id
    ? presentedNpcGmNotesState.gmNotes
    : ''

  const selectedTokenIdSet = useMemo(() => new Set(selectedTokenIds), [selectedTokenIds])
  const nonPartySources = useMemo(
    () => [
      ...monsterPlacementSources,
      ...npcPlacementSources,
      ...genericPlacementSources,
    ],
    [genericPlacementSources, monsterPlacementSources, npcPlacementSources],
  )
  const [previousNonPartySources, setPreviousNonPartySources] = useState(nonPartySources)
  const sourceKey = useCallback((source: TokenPlacementSource) => `${source.kind}:${source.id}`, [])
  if (previousNonPartySources !== nonPartySources) {
    setPreviousNonPartySources(nonPartySources)
    setNonPartySourceKey((current) => {
      if (!current || current === genericCreatorKey) return current
      return nonPartySources.some((source) => sourceKey(source) === current) ? current : ''
    })
  }
  const selectedNonPartySource = nonPartySources.find((source) => sourceKey(source) === nonPartySourceKey) ?? null
  const normalizedNonPartySearch = nonPartySearch.trim().toLowerCase()
  const matchesNonPartySearch = (source: TokenPlacementSource) => {
    if (!normalizedNonPartySearch) return true
    const kindLabel = source.kind === 'genericToken' ? 'generic asset' : source.kind
    return `${source.name} ${kindLabel}`.toLowerCase().includes(normalizedNonPartySearch)
  }
  const visibleMonsterSources = monsterPlacementSources.filter(matchesNonPartySearch)
  const visibleNpcSources = npcPlacementSources.filter(matchesNonPartySearch)
  const visibleGenericSources = genericPlacementSources.filter(matchesNonPartySearch)
  const selectedGenericSource =
    genericPlacementSources.find((source) => source.id === selectedTokenAssetId) ?? null
  const genericCreatorSelected = nonPartySourceKey === genericCreatorKey
  const stagedGenericSource = genericCreatorSelected
    ? selectedGenericSource
      ? {
        ...selectedGenericSource,
        name: genericTokenName.trim() || selectedGenericSource.name,
        tokenIcon: {
          icon: 'custom' as const,
          color: tokenColor,
          size: tokenSize,
          customImagePath: selectedGenericSource.imagePath,
          customImageUrl: selectedGenericSource.imageUrl,
          customImageName: selectedGenericSource.name,
        },
      }
      : {
        kind: 'genericToken' as const,
        id: '',
        name: genericTokenName.trim() || 'Token',
        tokenIcon: { icon: 'pawn' as const, color: tokenColor, size: tokenSize },
      }
    : null
  const genericCreatorVisible =
    !normalizedNonPartySearch ||
    'generic asset assets token custom upload'.includes(normalizedNonPartySearch)
  const selectedNonPartyKeyVisible =
    selectedNonPartySource &&
    [...visibleMonsterSources, ...visibleNpcSources, ...visibleGenericSources].some(
      (source) => sourceKey(source) === sourceKey(selectedNonPartySource),
    )
  const currentPlacementName = placementDisplay.current?.name ?? ''
  const placementRemainingLabel = placementDisplay.active && placementDisplay.remaining > 1
    ? `${placementDisplay.remaining} left`
    : ''

  const toggleGroupSelected = (groupTokens: TokenRecord[], selected: boolean) => {
    const groupTokenIds = groupTokens.map((token) => token.id)
    const groupTokenIdSet = new Set(groupTokenIds)
    onSelectedTokenIdsChange((current) => {
      if (!selected) return current.filter((tokenId) => !groupTokenIdSet.has(tokenId))
      const next = [...current]
      groupTokenIds.forEach((tokenId) => {
        if (!next.includes(tokenId)) next.push(tokenId)
      })
      return next
    })
  }

  useEffect(() => {
    if (!presentedNpc?.id) return
    const npcId = presentedNpc.id
    const unsub = onSnapshot(campaignDocRef(db, { campaignId, groupId }, ...sceneNpcPrivateDocSegments(presentedNpc.id)), (snap) => {
      const data = snap.data() as Partial<NpcPrivateRecord> | undefined
      setPresentedNpcGmNotesState({
        npcId,
        gmNotes: toNpcGmNotes(data),
      })
    })
    return () => unsub()
  }, [campaignId, groupId, presentedNpc?.id])

  const commitTokenLabelEdit = async (token: TokenRecord, labelValue: string) => {
    const current = token.name.trim()
    const nextName = labelValue.trim()
    if (nextName !== current) {
      await onUpdateToken(token.id, { name: nextName })
    }

    setTokenNameDrafts((prev) => {
      const next = { ...prev }
      delete next[token.id]
      return next
    })
  }

  const tokenGroups = useMemo(() => {
    const groups = [
      { key: 'party', label: 'Party', tokens: tokens.filter((token) => token.party) },
      { key: 'characters', label: 'Characters', tokens: tokens.filter((token) => !token.party && !!token.characterId) },
      { key: 'monsters', label: 'Monsters', tokens: tokens.filter((token) => !token.party && !!token.monsterId) },
      { key: 'npcs', label: 'NPCs', tokens: tokens.filter((token) => !token.party && !!token.npcId) },
      {
        key: 'other',
        label: 'Other',
        tokens: tokens.filter((token) => !token.party && !token.characterId && !token.monsterId && !token.npcId),
      },
    ]

    return groups.filter((group) => group.tokens.length > 0)
  }, [tokens])
  const [previousTokenGroups, setPreviousTokenGroups] = useState(tokenGroups)
  if (previousTokenGroups !== tokenGroups) {
    setPreviousTokenGroups(tokenGroups)
    const visibleGroupKeys = new Set(tokenGroups.map((group) => group.key))
    setCollapsedTokenGroupKeys((current) => current.filter((key) => visibleGroupKeys.has(key)))
  }
  const selectedTokens = useMemo(
    () => tokens.filter((token) => selectedTokenIdSet.has(token.id)),
    [selectedTokenIdSet, tokens],
  )
  const selectedEditableTokenIds = selectedTokens.map((token) => token.id)
  const selectedTokenCount = selectedTokens.length
  const selectedBulkSizeValue = selectedTokens[0]?.size ?? TOKEN_SIZE_MIN
  const selectedBulkColorValue = selectedTokens[0]?.color ?? tokenColor
  const selectedBulkRotationValue = normalizeTokenRotation(selectedTokens[0]?.rotationDeg ?? 0)
  const selectedPartyTokens = selectedTokens.filter((token) => token.party)
  const selectedBulkViewDistanceValue = selectedPartyTokens[0]
    ? tokenViewDistanceSliderValue(selectedPartyTokens[0])
    : DEFAULT_TOKEN_VIEW_DISTANCE
  const selectedAllParty = selectedTokenCount > 0 && selectedTokens.every((token) => token.party)
  const selectedAllRevealName = selectedTokenCount > 0 && selectedTokens.every((token) => token.revealName)
  const selectedAllHidden = selectedTokenCount > 0 && selectedTokens.every((token) => token.hidden)
  const selectedAllFlipHorizontal = selectedTokenCount > 0 && selectedTokens.every((token) => token.flipHorizontal)
  const selectedAllFlipVertical = selectedTokenCount > 0 && selectedTokens.every((token) => token.flipVertical)
  // Top-level category a token falls under (mirrors the tokenGroups partition above).
  const tokenCategoryKey = (token: TokenRecord) =>
    token.party
      ? 'party'
      : token.characterId
        ? 'characters'
        : token.monsterId
          ? 'monsters'
          : token.npcId
            ? 'npcs'
            : 'other'
  // "Make group" only applies when every selected token shares one category, so the
  // new group can nest cleanly under that category's block.
  const selectedSameCategory =
    selectedTokenCount > 0 && new Set(selectedTokens.map(tokenCategoryKey)).size === 1
  const selectedCategoryLabel = selectedSameCategory
    ? tokenGroups.find((group) => group.tokens.some((token) => selectedTokenIdSet.has(token.id)))?.label ??
      'this category'
    : 'this category'
  const handleConfirmMakeGroup = () => {
    const name = makeGroupNameDraft.trim()
    if (!name || selectedTokens.length === 0) return
    void Promise.all(selectedTokens.map((token) => onUpdateToken(token.id, { group: name })))
    setMakeGroupModalOpen(false)
    setMakeGroupNameDraft('')
  }
  const handleConfirmDisbandGroup = () => {
    if (!disbandCandidate) return
    void Promise.all(disbandCandidate.tokenIds.map((tokenId) => onUpdateToken(tokenId, { group: '' })))
    setDisbandCandidate(null)
  }
  const visibleTokenListIds = useMemo(
    () => tokenGroups.flatMap((group) => group.tokens.map((token) => token.id)),
    [tokenGroups],
  )

  const toggleTokenListSelection = (tokenId: string, shiftKey: boolean) => {
    if (shiftKey && lastTokenListSelectionId) {
      const startIndex = visibleTokenListIds.indexOf(lastTokenListSelectionId)
      const endIndex = visibleTokenListIds.indexOf(tokenId)
      if (startIndex >= 0 && endIndex >= 0) {
        const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
        const rangeIds = visibleTokenListIds.slice(from, to + 1)
        onSelectedTokenIdsChange((current) => {
          const next = [...current]
          rangeIds.forEach((id) => {
            if (!next.includes(id)) next.push(id)
          })
          return next
        })
        setLastTokenListSelectionId(tokenId)
        return
      }
    }

    onSelectedTokenIdsChange((current) =>
      current.includes(tokenId)
        ? current.filter((id) => id !== tokenId)
        : [...current, tokenId],
    )
    setLastTokenListSelectionId(tokenId)
  }

  const toggleTokenGroupCollapsed = (groupKey: string) => {
    setCollapsedTokenGroupKeys((current) =>
      current.includes(groupKey)
        ? current.filter((key) => key !== groupKey)
        : [...current, groupKey],
    )
  }

  const toggleSubgroupCollapsed = (subgroupKey: string) => {
    setCollapsedSubgroupKeys((current) =>
      current.includes(subgroupKey)
        ? current.filter((key) => key !== subgroupKey)
        : [...current, subgroupKey],
    )
  }

  const renderPlacementSourceIcon = (source: TokenPlacementSource) => {
    const imageUrl = source.kind === 'genericToken'
      ? source.imageUrl
      : source.tokenIcon?.icon === 'custom'
        ? source.tokenIcon.customImageUrl ?? ''
        : ''
    const color = source.tokenIcon?.color ?? tokenColor
    return (
      <span className="token-row-icon" style={{ color }} aria-hidden>
        {imageUrl ? <img src={imageUrl} alt="" className="token-row-image" /> : <ChessPawn size={14} />}
      </span>
    )
  }

  const monsterCountFor = (monsterId: string) => monsterPlacementCounts[monsterId] ?? 1
  const setMonsterCount = (monsterId: string, count: number) => {
    const nextCount = Math.max(1, Math.min(99, Math.floor(count) || 1))
    setMonsterPlacementCounts((current) => ({ ...current, [monsterId]: nextCount }))
  }
  const handleNonPartySourceChange = (key: string) => {
    setNonPartySourceKey(key)
    if (key === genericCreatorKey) return
    const source = nonPartySources.find((entry) => sourceKey(entry) === key) ?? null
    if (source?.kind === 'genericToken') setSelectedTokenAssetId(source.id)
  }
  const clearNonPartySource = () => {
    setNonPartySourceKey('')
  }
  const requestDeleteSelectedGenericSource = () => {
    if (selectedNonPartySource?.kind !== 'genericToken') return
    onRequestDeleteTokenAsset(selectedNonPartySource.id)
  }
  const placeSelectedNonPartySource = () => {
    if (!selectedNonPartySource) return
    if (selectedNonPartySource.kind === 'monster') {
      onStartMonsterPlacement(selectedNonPartySource, monsterCountFor(selectedNonPartySource.id))
      return
    }
    onStartSinglePlacement(selectedNonPartySource)
  }

  return (
    <div className={dark ? 'map-controls-body dark' : 'map-controls-body'}>
      {showTopTools ? (
      <div className="map-tools-panel">
        <BrushSizeControl fogBrushSize={fogBrushSize} setFogBrushSize={setFogBrushSize} />
        <div className="map-tools-left">
        <span className="map-section-label">Fog</span>
        <div className="map-section-grid">
          <button
            type="button"
            className={fogTool === 'hide' ? 'map-icon-btn map-fog-hide-btn fast-tooltip fast-tooltip-left active' : 'map-icon-btn map-fog-hide-btn fast-tooltip fast-tooltip-left'}
            onClick={() => {
              setTokenSelectMode(false)
              setVisionTool(null)
              setFogTool(fogTool === 'hide' ? null : 'hide')
            }}
            aria-label="Add fog"
            data-tooltip="Add fog"
          >
            <SprayCan size={16} />
          </button>
          <button
            type="button"
            className={fogTool === 'reveal' ? 'map-icon-btn map-fog-reveal-btn fast-tooltip active' : 'map-icon-btn map-fog-reveal-btn fast-tooltip'}
            onClick={() => {
              setTokenSelectMode(false)
              setVisionTool(null)
              setFogTool(fogTool === 'reveal' ? null : 'reveal')
            }}
            aria-label="Remove fog"
            data-tooltip="Remove fog"
          >
            <Eraser size={16} />
          </button>
          <button
            type="button"
            className={fullyHidden ? 'map-icon-btn map-hide-all-btn fast-tooltip active' : 'map-icon-btn map-hide-all-btn fast-tooltip'}
            onClick={toggleHidden}
            disabled={!canApplyPreset}
            aria-label={fullyHidden ? 'Unhide all' : 'Hide all'}
            data-tooltip={fullyHidden ? 'Unhide all' : 'Hide all'}
          >
            {fullyHidden ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        </div>
        <span className="map-section-label">Vision Block</span>
        <div className="map-section-grid">
          <button
            type="button"
            className={visionTool === 'drawFull' ? 'map-icon-btn map-vision-full-btn fast-tooltip fast-tooltip-left active' : 'map-icon-btn map-vision-full-btn fast-tooltip fast-tooltip-left'}
            onClick={() => {
              setTokenSelectMode(false)
              setFogTool(null)
              setVisionTool(visionTool === 'drawFull' ? null : 'drawFull')
            }}
            aria-label="Hard vision block"
            data-tooltip="Hard block: blocks sight into painted area and beyond"
          >
            <PenTool size={16} />
          </button>
          <button
            type="button"
            className={visionTool === 'draw' ? 'map-icon-btn map-vision-draw-btn fast-tooltip active' : 'map-icon-btn map-vision-draw-btn fast-tooltip'}
            onClick={() => {
              setTokenSelectMode(false)
              setFogTool(null)
              setVisionTool(visionTool === 'draw' ? null : 'draw')
            }}
            aria-label="Soft vision block"
            data-tooltip="Soft block: reveals painted area, blocks sight beyond"
          >
            <Pencil size={16} />
          </button>
          <button
            type="button"
            className={visionTool === 'erase' ? 'map-icon-btn map-vision-erase-btn fast-tooltip active' : 'map-icon-btn map-vision-erase-btn fast-tooltip'}
            onClick={() => {
              setTokenSelectMode(false)
              setFogTool(null)
              setVisionTool(visionTool === 'erase' ? null : 'erase')
            }}
            aria-label="Erase vision blocks"
            data-tooltip="Erase vision blocks"
          >
            <X size={16} />
          </button>
        </div>
        <span className="map-section-label">Annotation</span>
        <div className="map-section-grid">
          <button
            type="button"
            className={annotationPlaceMode ? 'map-icon-btn map-annotation-place-btn fast-tooltip fast-tooltip-left active' : 'map-icon-btn map-annotation-place-btn fast-tooltip fast-tooltip-left'}
            onClick={() => {
              const next = !annotationPlaceMode
              setAnnotationPlaceMode(next)
              if (next) {
                setTokenSelectMode(false)
                setPlayerLabelPlaceMode(false)
              }
            }}
            aria-label="Toggle GM notes placement"
            data-tooltip="GM Notes Placement"
          >
            <Flag size={16} />
          </button>
          <button
            type="button"
            className={playerLabelPlaceMode ? 'map-icon-btn map-player-label-mode-btn fast-tooltip active' : 'map-icon-btn map-player-label-mode-btn fast-tooltip'}
            onClick={() => {
              const next = !playerLabelPlaceMode
              setPlayerLabelPlaceMode(next)
              if (next) {
                setTokenSelectMode(false)
                setAnnotationPlaceMode(false)
              }
            }}
            aria-label="Toggle player label placement mode"
            data-tooltip="Player label placement mode"
          >
            <Tag size={16} />
          </button>
          <button
            type="button"
            className={gmHideLabels ? 'map-icon-btn map-hide-labels-btn fast-tooltip active' : 'map-icon-btn map-hide-labels-btn fast-tooltip'}
            onClick={() => setGmHideLabels(!gmHideLabels)}
            aria-label={gmHideLabels ? 'Show labels in GM view' : 'Hide labels in GM view'}
            data-tooltip={gmHideLabels ? 'Show labels in GM view' : 'Hide labels in GM view'}
          >
            <EyeOff size={16} />
          </button>
        </div>
        <span className="map-section-label">Token</span>
        <div className="map-section-grid">
          <button
            type="button"
            className={tokenSelectMode ? 'map-icon-btn map-token-select-btn fast-tooltip fast-tooltip-left active' : 'map-icon-btn map-token-select-btn fast-tooltip fast-tooltip-left'}
            onClick={() => {
              const next = !tokenSelectMode
              setTokenSelectMode(next)
              if (next) {
                setFogTool(null)
                setVisionTool(null)
                setAnnotationPlaceMode(false)
                setPlayerLabelPlaceMode(false)
              }
            }}
            aria-label="Toggle token drag-select mode"
            data-tooltip="Token drag-select mode"
          >
            <SquareDashedMousePointer size={16} />
          </button>
          <button
            type="button"
            className={handToolActive ? 'map-icon-btn map-hand-tool-btn fast-tooltip active' : 'map-icon-btn map-hand-tool-btn fast-tooltip'}
            onClick={() => setHandToolActive(!handToolActive)}
            aria-label="Toggle hand pan tool"
            data-tooltip="Hand pan tool"
          >
            <Hand size={16} />
          </button>
        </div>
        <span className="map-section-label">Scene NPC</span>
        <div className="map-section-grid">
          <button
            type="button"
            className={npcSceneMode ? 'map-icon-btn map-scene-npc-btn fast-tooltip fast-tooltip-left active' : 'map-icon-btn map-scene-npc-btn fast-tooltip fast-tooltip-left'}
            onClick={() => setNpcSceneMode(!npcSceneMode)}
            aria-label="Toggle scene NPC panel"
            data-tooltip="Scene NPCs"
          >
            <UserRoundPen size={16} />
          </button>
        </div>
        <span className="map-section-label">Player View Preview</span>
        <div className="map-section-grid">
          <button
            type="button"
            className={playerViewPreview ? 'map-icon-btn map-streaming-btn fast-tooltip fast-tooltip-left active' : 'map-icon-btn map-streaming-btn fast-tooltip fast-tooltip-left'}
            onClick={() => setPlayerViewPreview(!playerViewPreview)}
            aria-label="Toggle player view preview"
            data-tooltip="Player view preview"
          >
            <TvMinimalPlay size={16} />
          </button>
        </div>
        </div>
        <div className="map-tools-right">
          <span className="map-section-label">Grid Controls</span>
          <div className="map-section-grid">
            <button
              type="button"
              className={
                gridAdjustMode && gridType === 'square'
                  ? 'map-icon-btn map-grid-btn fast-tooltip fast-tooltip-right active'
                  : 'map-icon-btn map-grid-btn fast-tooltip fast-tooltip-right'
              }
              onClick={() => onSetGridType('square')}
              aria-label="Square grid overlay"
              data-tooltip={gridAdjustMode && gridType === 'square' ? 'Cancel square grid' : 'Square grid'}
            >
              <Grid3X3 size={16} />
            </button>
            <button
              type="button"
              className={gridAdjustMode && gridType === 'hex-pointy'
                ? 'map-icon-btn map-hex-pointy-btn fast-tooltip fast-tooltip-right active'
                : 'map-icon-btn map-hex-pointy-btn fast-tooltip fast-tooltip-right'}
              onClick={() => onSetGridType('hex-pointy')}
              disabled={hexDetecting}
              aria-label="Hex grid pointy-top orientation"
              data-tooltip={hexDetecting ? 'Detecting hex...' : 'Hex grid: pointy-top'}
            >
              {hexDetecting ? <LoaderCircle size={16} className="map-icon-spin" /> : <Hexagon size={16} />}
            </button>
            <button
              type="button"
              className={gridAdjustMode && gridType === 'hex-flat'
                ? 'map-icon-btn map-hex-flat-btn fast-tooltip fast-tooltip-right active'
                : 'map-icon-btn map-hex-flat-btn fast-tooltip fast-tooltip-right'}
              onClick={() => onSetGridType('hex-flat')}
              disabled={hexDetecting}
              aria-label="Hex grid flat-top orientation"
              data-tooltip={hexDetecting ? 'Detecting hex...' : 'Hex grid: flat-top'}
            >
              {hexDetecting ? <LoaderCircle size={16} className="map-icon-spin" /> : <Hexagon size={16} className="map-hex-flat-icon" />}
            </button>
          </div>
          <div className="map-section-grid map-section-grid-single">
            <button
              type="button"
              className={gridVisible ? 'map-icon-btn map-grid-visibility-btn fast-tooltip fast-tooltip-right' : 'map-icon-btn map-grid-visibility-btn fast-tooltip fast-tooltip-right active'}
              onClick={onToggleGridVisible}
              aria-label="Toggle grid visibility"
              data-tooltip={gridVisible ? 'Hide grid' : 'Show grid'}
            >
              <EyeOff size={16} />
            </button>
          </div>
          <span className="map-section-label">Measurement</span>
          <div className="map-section-grid">
            <button
              type="button"
              className={gridCalibrateMode ? 'map-icon-btn map-ruler-btn fast-tooltip fast-tooltip-right active' : 'map-icon-btn map-ruler-btn fast-tooltip fast-tooltip-right'}
              onClick={onToggleGridCalibrate}
              aria-label="Calibrate grid scale"
              data-tooltip={gridCalibrateMode ? 'Measuring' : "Calibrate 10'"}
            >
              <RulerDimensionLine size={16} />
            </button>
            <button
              type="button"
              className={gridMeasureMode ? 'map-icon-btn map-measure-btn fast-tooltip fast-tooltip-right active' : 'map-icon-btn map-measure-btn fast-tooltip fast-tooltip-right'}
              onClick={onToggleGridMeasure}
              disabled={!measurementToolEnabled}
              aria-label="Measure map distance"
              data-tooltip={!measurementToolEnabled ? 'Lay or calibrate grid first' : gridMeasureMode ? 'Clear measurement' : 'Measure distance'}
            >
              <Ruler size={16} />
            </button>
            <DistanceTrackerBadge distanceTrackerFeet={distanceTrackerFeet} distanceTrackerMode={distanceTrackerMode} distanceTrackerRoll={distanceTrackerRoll} onResetDistanceTracker={onResetDistanceTracker} />
          </div>
        </div>
      </div>
      ) : null}
      {gridAdjustMode ? (
        <div className="map-grid-adjust-panel">
          <p className="map-grid-adjust-hint">Adjusting grid: mouse wheel scales, drag pans alignment.</p>
          {hexDetectConfidence !== null ? (
            <p className="map-grid-adjust-hint">
              Hex detect confidence: {Math.round(hexDetectConfidence * 100)}%.
            </p>
          ) : null}
          <ModeConfirmAction
            saved={gridAdjustSaved}
            label="Apply grid"
            onApply={onApplyGrid}
            ariaLabel="Apply grid"
            disabled={!gridAdjustReady}
          />
        </div>
      ) : null}
      {gridCalibrateMode ? (
        <div className="map-grid-calibration-panel">
          <p className="map-grid-calibration-hint">Click two points across one square side, then drag dots to refine.</p>
          <ModeConfirmAction
            saved={gridCalibrateSaved}
            label="Apply calibration"
            onApply={onApplyGridCalibration}
            ariaLabel="Apply calibration"
            disabled={!gridCalibrateReady}
          />
        </div>
      ) : null}
      {gridMeasureMode ? (
        <div className="map-grid-calibration-panel">
          <p className="map-grid-calibration-hint">Click two points to measure, then drag dots to refine.</p>
          <p className="map-grid-measurement-readout">Distance: {measurementFeetLabel}</p>
        </div>
      ) : null}
      <section className="map-token-placement-panel" aria-label="Place tokens">
        <div className="token-cards-header">
          <h4 className="token-cards-title">Place tokens</h4>
        </div>
        {placementDisplay.active ? (
          <div className="map-placement-active-block">
            <span className="map-section-label">Placing:</span>
            <div className="map-placement-active">
              {placementDisplay.current ? renderPlacementSourceIcon(placementDisplay.current) : (
                <span className="token-row-icon" aria-hidden>
                  <ChessPawn size={14} />
                </span>
              )}
              <div className="map-placement-active-main">
                <span className="map-placement-active-name">{currentPlacementName || 'Token'}</span>
                {placementRemainingLabel ? <span className="map-placement-active-meta">{placementRemainingLabel}</span> : null}
              </div>
              <button type="button" className="monster-example-btn" onClick={onCancelPlacement}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
        <div className="map-placement-group">
          <div className="map-placement-group-header">
            <span className="map-section-label">Party</span>
            <div className="map-placement-group-actions">
              <button
                type="button"
                className="monster-example-btn"
                onClick={onStartWholePartyPlacement}
                disabled={!partyControlsAvailable}
              >
                Whole Party
              </button>
              <button
                type="button"
                className="map-icon-btn map-placement-collapse-btn fast-tooltip fast-tooltip-left"
                onClick={() => setPartyPlacementCollapsed((current) => !current)}
                aria-label={partyPlacementCollapsed ? 'Show party token sources' : 'Hide party token sources'}
                data-tooltip={partyPlacementCollapsed ? 'Show party' : 'Hide party'}
              >
                {partyPlacementCollapsed ? <Plus size={13} /> : <Minus size={13} />}
              </button>
            </div>
          </div>
          {!partyPlacementCollapsed ? (
            <div className="token-list">
              {partyPlacementSources.map((source) => (
                <div key={source.id} className="token-row map-placement-row">
                  {renderPlacementSourceIcon(source)}
                  <span className="map-placement-source-name">{source.name}</span>
                  <button type="button" className="monster-example-btn" onClick={() => onStartSinglePlacement(source)}>
                    Place
                  </button>
                </div>
              ))}
              {partyPlacementSources.length === 0 ? <p className="map-npc-scene-empty">No party characters.</p> : null}
            </div>
          ) : null}
        </div>
        <div className="map-placement-group">
          <div className="map-placement-group-header">
            <span className="map-section-label">Non-party</span>
            <button
              type="button"
              className="map-icon-btn map-placement-collapse-btn fast-tooltip fast-tooltip-left"
              onClick={() => setNonPartyPlacementCollapsed((current) => !current)}
              aria-label={nonPartyPlacementCollapsed ? 'Show non-party token sources' : 'Hide non-party token sources'}
              data-tooltip={nonPartyPlacementCollapsed ? 'Show non-party' : 'Hide non-party'}
            >
              {nonPartyPlacementCollapsed ? <Plus size={13} /> : <Minus size={13} />}
            </button>
          </div>
          {!nonPartyPlacementCollapsed ? (
            <>
              <div className="map-nonparty-picker">
                <input
                  type="search"
                  value={nonPartySearch}
                  onChange={(event) => setNonPartySearch(event.target.value)}
                  placeholder="Search monsters, NPCs, assets"
                  aria-label="Search non-party token sources"
                />
                <div className="map-nonparty-source-row">
                  <select
                    value={genericCreatorSelected ? genericCreatorKey : selectedNonPartySource ? sourceKey(selectedNonPartySource) : ''}
                    onChange={(event) => handleNonPartySourceChange(event.target.value)}
                    aria-label="Select non-party token source"
                  >
                    <option value="">Choose a source</option>
                    {selectedNonPartySource && !selectedNonPartyKeyVisible ? (
                      <option value={sourceKey(selectedNonPartySource)}>{selectedNonPartySource.name}</option>
                    ) : null}
                    {visibleMonsterSources.length > 0 ? (
                      <optgroup label="Monsters">
                        {visibleMonsterSources.map((source) => (
                          <option key={sourceKey(source)} value={sourceKey(source)}>{source.name}</option>
                        ))}
                      </optgroup>
                    ) : null}
                    {visibleNpcSources.length > 0 ? (
                      <optgroup label="NPCs">
                        {visibleNpcSources.map((source) => (
                          <option key={sourceKey(source)} value={sourceKey(source)}>{source.name}</option>
                        ))}
                      </optgroup>
                    ) : null}
                    {visibleGenericSources.length > 0 ? (
                      <optgroup label="Generic assets">
                        {genericCreatorVisible ? <option value={genericCreatorKey}>Generic asset...</option> : null}
                        {visibleGenericSources.map((source) => (
                          <option key={sourceKey(source)} value={sourceKey(source)}>{source.name}</option>
                        ))}
                      </optgroup>
                    ) : genericCreatorVisible ? (
                      <optgroup label="Generic assets">
                        <option value={genericCreatorKey}>Generic asset...</option>
                      </optgroup>
                    ) : null}
                  </select>
                  {selectedNonPartySource || genericCreatorSelected ? (
                    <button
                      type="button"
                      className="map-icon-btn map-nonparty-clear-btn fast-tooltip fast-tooltip-left"
                      onClick={clearNonPartySource}
                      aria-label="Clear non-party token source"
                      data-tooltip="Clear source"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className={genericCreatorSelected ? 'map-nonparty-upload-btn active' : 'map-nonparty-upload-btn'}
                onClick={() => handleNonPartySourceChange(genericCreatorKey)}
              >
                <Plus size={14} />
                <span>New token</span>
              </button>
              <div className="map-placement-stage">
                {selectedNonPartySource ? (
                  <div
                    className={
                      selectedNonPartySource.kind === 'monster'
                        ? 'token-row map-placement-row'
                        : selectedNonPartySource.kind === 'genericToken'
                          ? 'token-row map-placement-row map-placement-row-manage'
                          : 'token-row map-placement-row map-placement-row-simple'
                    }
                  >
                    {renderPlacementSourceIcon(selectedNonPartySource)}
                    <span className="map-placement-source-name">{selectedNonPartySource.name}</span>
                    {selectedNonPartySource.kind === 'monster' ? (
                      <div className="map-placement-stepper" aria-label={`${selectedNonPartySource.name} count`}>
                        <button
                          type="button"
                          onClick={() => setMonsterCount(selectedNonPartySource.id, monsterCountFor(selectedNonPartySource.id) - 1)}
                          aria-label="Decrease count"
                        >
                          <Minus size={12} />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={monsterCountFor(selectedNonPartySource.id)}
                          onChange={(event) => setMonsterCount(selectedNonPartySource.id, Number.parseInt(event.target.value, 10))}
                          aria-label={`${selectedNonPartySource.name} placement count`}
                        />
                        <button
                          type="button"
                          onClick={() => setMonsterCount(selectedNonPartySource.id, monsterCountFor(selectedNonPartySource.id) + 1)}
                          aria-label="Increase count"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    ) : null}
                    {selectedNonPartySource.kind === 'genericToken' ? (
                      <button
                        type="button"
                        className="map-icon-btn map-placement-delete-source-btn fast-tooltip fast-tooltip-left"
                        onClick={requestDeleteSelectedGenericSource}
                        aria-label={`Delete ${selectedNonPartySource.name}`}
                        data-tooltip="Delete generic source"
                      >
                        <Trash2 size={13} />
                      </button>
                    ) : null}
                    <button type="button" className="monster-example-btn" onClick={placeSelectedNonPartySource}>
                      Place
                    </button>
                  </div>
                ) : genericCreatorSelected ? (
                  <div className="map-generic-asset-stage">
                    <TokenIconEditor
                      className="map-token-icon-editor"
                      minSize={TOKEN_SIZE_MIN}
                      maxSize={TOKEN_SIZE_MAX}
                      value={{ icon: selectedTokenAssetId ? 'custom' : 'pawn', color: tokenColor, size: tokenSize } satisfies TokenIconConfig}
                      onChange={(next) => {
                        setTokenColor(next.color)
                        setTokenSize(next.size)
                      }}
                      tokenAssets={tokenAssets.map((asset) => ({
                        id: asset.id,
                        name: asset.name,
                        imageUrl: asset.imageUrl,
                        archived: asset.archived,
                      }))}
                      selectedTokenAssetId={selectedTokenAssetId}
                      onSelectedTokenAssetIdChange={setSelectedTokenAssetId}
                      onArchiveTokenAsset={onArchiveTokenAsset}
                      onRequestDeleteTokenAsset={onRequestDeleteTokenAsset}
                      selectedTokenImageUrl={selectedTokenImageUrl}
                      uploadingTokenImage={uploadingTokenImage}
                      uploadAssetName={genericTokenName}
                      uploadAssetNameLabel="Token name"
                      onUploadAssetNameChange={setGenericTokenName}
                      onUploadTokenImage={onUploadTokenImage}
                    />
                    {stagedGenericSource ? (
                      <div className="token-row map-placement-row map-placement-row-simple">
                        {renderPlacementSourceIcon(stagedGenericSource)}
                        <span className="map-placement-source-name">{stagedGenericSource.name}</span>
                        <button
                          type="button"
                          className="monster-example-btn"
                          onClick={() => onStartSinglePlacement(stagedGenericSource)}
                        >
                          Place
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="map-npc-scene-empty">Choose a monster, NPC, or generic asset.</p>
                )}
              </div>
            </>
          ) : null}
        </div>
      </section>
      {npcSceneMode ? (
        <section className="token-cards-panel" aria-label="Scene NPCs">
          <div className="token-cards-header">
            <h4 className="token-cards-title">Scene NPCs</h4>
            {presentedNpc ? (
            <button
              type="button"
              className="token-cards-toggle fast-tooltip"
              onClick={onClearPresentedNpc}
              aria-label="Clear presented NPC"
              data-tooltip="Clear presented NPC"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
        <div className="scene-npc-picker-row">
          <select
            value={effectiveSceneNpcPickerId}
            onChange={(event) => setSceneNpcPickerId(event.target.value)}
            disabled={availableSceneNpcs.length === 0}
            aria-label="Select NPC to preload"
          >
            {availableSceneNpcs.length === 0 ? (
              <option value="">All NPCs already preloaded</option>
            ) : null}
            {availableSceneNpcs.map((npc) => (
              <option key={npc.id} value={npc.id}>
                {npc.title ? `${npc.name} - ${npc.title}` : npc.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="monster-example-btn"
            onClick={() => {
              if (!effectiveSceneNpcPickerId) return
              onToggleSceneNpc(effectiveSceneNpcPickerId, true)
            }}
            disabled={!effectiveSceneNpcPickerId}
          >
            Preload
          </button>
        </div>
        <div className="token-list">
          {sceneNpcs.map((npc) => (
            <div
              key={npc.id}
              className={presentedNpc?.id === npc.id ? 'token-row selected scene-npc-row' : 'token-row scene-npc-row'}
              onClick={() => setSceneNpcModalId(npc.id)}
            >
              <span className="token-row-icon" aria-hidden>
                {npc.portraitUrl ? <img src={npc.portraitUrl} alt="" className="token-row-image" /> : <User size={14} />}
              </span>
              <div className="token-row-fields">
                <strong>{npc.name}</strong>
                {npc.title ? <small>{npc.title}</small> : null}
              </div>
              <div className="npc-scene-actions">
                <button
                  type="button"
                  className={presentedNpc?.id === npc.id ? 'token-row-delete scene-npc-action active' : 'token-row-delete scene-npc-action'}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (presentedNpc?.id === npc.id) {
                      onClearPresentedNpc()
                      return
                    }
                    onPresentNpc(npc.id)
                    setNpcSceneMode(false)
                  }}
                  aria-label={presentedNpc?.id === npc.id ? 'Hide presented NPC' : 'Present NPC'}
                  title={presentedNpc?.id === npc.id ? 'Hide presented NPC' : 'Present NPC'}
                >
                  <Eye size={14} />
                </button>
                <button
                  type="button"
                  className="token-row-delete scene-npc-action"
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleSceneNpc(npc.id, false)
                  }}
                  aria-label="Remove from scene NPCs"
                  title="Remove from scene NPCs"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {sceneNpcs.length === 0 ? <p className="map-npc-scene-empty">No NPCs preloaded for this map.</p> : null}
        </div>
      </section>
      ) : null}
      {presentedNpc ? (
        <section className="map-npc-presented-panel map-npc-presented-panel-gm">
          <div className="map-npc-presented-card map-npc-presented-card-gm">
            <div className="map-npc-presented-portrait map-npc-presented-portrait-gm">
              {presentedNpc.portraitUrl ? (
                <img
                  src={presentedNpc.portraitUrl}
                  alt={`${presentedNpc.name} portrait`}
                  className="map-npc-presented-image"
                  style={{ objectPosition: `${presentedNpc.portraitFocusX}% ${presentedNpc.portraitFocusY}%` }}
                />
              ) : null}
            </div>
            <div className="map-npc-presented-copy">
              <h4>{presentedNpc.name}</h4>
              {presentedNpc.title ? <p className="map-npc-presented-title">{presentedNpc.title}</p> : null}
              {presentedNpcGmNotes ? (
                <div
                  className="map-npc-presented-notes npc-richtext-preview"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(presentedNpcGmNotes) }}
                />
              ) : (
                <p className="map-npc-presented-title">No GM notes.</p>
              )}
            </div>
          </div>
        </section>
      ) : null}
      {sceneNpcModalId ? (
            <SceneNpcEditorModal
              campaignId={campaignId}
              groupId={groupId}
              npcId={sceneNpcModalId}
            allTags={allNpcTags}
            onClose={() => setSceneNpcModalId('')}
          />
      ) : null}
      <ConfirmModal
        open={disbandCandidate !== null}
        title="Disband Group?"
        message={`Ungroup the ${disbandCandidate?.tokenIds.length ?? 0} token${
          (disbandCandidate?.tokenIds.length ?? 0) === 1 ? '' : 's'
        } in "${disbandCandidate?.name ?? ''}"? The tokens stay on the map; only the group is removed.`}
        confirmLabel="Disband"
        onCancel={() => setDisbandCandidate(null)}
        onConfirm={handleConfirmDisbandGroup}
      />
      {makeGroupModalOpen ? (
        <div
          className="confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Name token group"
          onClick={() => setMakeGroupModalOpen(false)}
        >
          <div className="confirm-modal token-make-group-modal" onClick={(event) => event.stopPropagation()}>
            <h4 className="token-make-group-title">
              Group {selectedTokenCount} token{selectedTokenCount === 1 ? '' : 's'}
            </h4>
            <p className="token-make-group-subtitle">Nested under {selectedCategoryLabel}.</p>
            <input
              type="text"
              className="token-make-group-input"
              autoFocus
              value={makeGroupNameDraft}
              placeholder="Group name (e.g. Goblin Patrol)"
              onChange={(event) => setMakeGroupNameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleConfirmMakeGroup()
                if (event.key === 'Escape') setMakeGroupModalOpen(false)
              }}
            />
            <div className="token-make-group-actions">
              <button
                type="button"
                className="token-make-group-cancel"
                onClick={() => setMakeGroupModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="token-make-group-confirm"
                onClick={handleConfirmMakeGroup}
                disabled={!makeGroupNameDraft.trim()}
              >
                Create group
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {!playerViewPreview ? (
        <section className="token-cards-panel" aria-label="Token cards">
          <div className="token-cards-header">
            <h4 className="token-cards-title">Tokens</h4>
            <button
              type="button"
              className="token-cards-toggle fast-tooltip"
              onClick={() => setTokensCollapsed((current) => !current)}
              aria-label={tokensCollapsed ? 'Expand tokens' : 'Collapse tokens'}
              data-tooltip={tokensCollapsed ? 'Expand tokens' : 'Collapse tokens'}
            >
              {tokensCollapsed ? '+' : '-'}
            </button>
          </div>
          {!tokensCollapsed ? (
            <div className="token-group-list">
              <div className="token-global-controls" aria-label="Selected token controls">
                <div className="token-global-controls-header">
                  <h5 className="token-global-controls-title">Selected Tokens</h5>
                  <span className="token-global-count">{selectedTokenCount}</span>
                </div>
                <div className="token-group-bulk-actions">
                  <button
                    type="button"
                    className="token-group-delete fast-tooltip"
                    onClick={() => onRequestDeleteTokens(selectedEditableTokenIds)}
                    disabled={selectedTokenCount === 0}
                    aria-label="Delete selected tokens"
                    data-tooltip="Delete selected tokens"
                  >
                    <Trash2 size={14} />
                  </button>
                  <input
                    type="color"
                    value={selectedBulkColorValue}
                    disabled={selectedTokenCount === 0}
                    onChange={(event) => {
                      const color = event.target.value
                      void Promise.all(selectedTokens.map((token) => onUpdateToken(token.id, { color })))
                    }}
                    aria-label="Selected token color"
                  />
                  {selectedSameCategory ? (
                    <button
                      type="button"
                      className="token-group-make-group fast-tooltip"
                      onClick={() => {
                        setMakeGroupNameDraft('')
                        setMakeGroupModalOpen(true)
                      }}
                      aria-label="Group selected tokens"
                      data-tooltip="Make group"
                    >
                      <Users size={14} />
                    </button>
                  ) : null}
                </div>
                <IconValueSlider
                  className="token-row-size-row token-group-size-row"
                  icon={<ALargeSmall size={14} />}
                  tooltip="Token Size"
                  value={selectedBulkSizeValue}
                  min={TOKEN_SIZE_MIN}
                  max={TOKEN_SIZE_MAX}
                  step={1}
                  disabled={selectedTokenCount === 0}
                  ariaLabel="Selected token size"
                  onChange={(nextSize) => {
                    void Promise.all(selectedTokens.map((token) => onUpdateTokenSize(token.id, nextSize)))
                  }}
                />
                <IconValueSlider
                  className="token-row-size-row token-group-rotation-row"
                  icon={<RotateCw size={14} />}
                  tooltip="Rotation"
                  value={selectedBulkRotationValue}
                  min={0}
                  max={359}
                  step={1}
                  disabled={selectedTokenCount === 0}
                  ariaLabel="Selected token rotation"
                  onChange={(rotationDeg) => {
                    const nextRotation = normalizeTokenRotation(rotationDeg)
                    void Promise.all(selectedTokens.map((token) => onUpdateToken(token.id, { rotationDeg: nextRotation })))
                  }}
                />
                <div className="token-row-toggles token-group-bulk-toggles">
                  <button
                    type="button"
                    className={selectedAllFlipHorizontal ? 'token-toggle-btn map-icon-btn fast-tooltip active' : 'token-toggle-btn map-icon-btn fast-tooltip'}
                    onClick={() => {
                      const flipHorizontal = !selectedAllFlipHorizontal
                      void Promise.all(selectedTokens.map((token) => onUpdateToken(token.id, { flipHorizontal })))
                    }}
                    disabled={selectedTokenCount === 0}
                    aria-label="Toggle selected horizontal mirror"
                    data-tooltip="Mirror horizontal"
                  >
                    <FlipHorizontal size={14} />
                  </button>
                  <button
                    type="button"
                    className={selectedAllFlipVertical ? 'token-toggle-btn map-icon-btn fast-tooltip active' : 'token-toggle-btn map-icon-btn fast-tooltip'}
                    onClick={() => {
                      const flipVertical = !selectedAllFlipVertical
                      void Promise.all(selectedTokens.map((token) => onUpdateToken(token.id, { flipVertical })))
                    }}
                    disabled={selectedTokenCount === 0}
                    aria-label="Toggle selected vertical mirror"
                    data-tooltip="Mirror vertical"
                  >
                    <FlipVertical size={14} />
                  </button>
                  <button
                    type="button"
                    className={selectedAllParty ? 'token-toggle-btn map-icon-btn fast-tooltip active' : 'token-toggle-btn map-icon-btn fast-tooltip'}
                    onClick={() => {
                      const next = !selectedAllParty
                      void Promise.all(selectedTokens.map((token) => {
                        if (!next) return onUpdateToken(token.id, { party: false })
                        return onUpdateToken(token.id, {
                          party: true,
                          viewDistance: tokenViewDistanceSliderValue(token),
                        })
                      }))
                    }}
                    disabled={selectedTokenCount === 0}
                    aria-label="Toggle selected party tokens"
                    data-tooltip="Party token"
                  >
                    <User size={14} />
                  </button>
                  <button
                    type="button"
                    className={selectedAllRevealName ? 'token-toggle-btn map-icon-btn fast-tooltip active' : 'token-toggle-btn map-icon-btn fast-tooltip'}
                    onClick={() => {
                      const revealName = !selectedAllRevealName
                      void Promise.all(selectedTokens.map((token) => onUpdateToken(token.id, { revealName })))
                    }}
                    disabled={selectedTokenCount === 0}
                    aria-label="Toggle selected reveal names"
                    data-tooltip="Reveal name"
                  >
                    <Tag size={14} />
                  </button>
                  <button
                    type="button"
                    className={selectedAllHidden ? 'token-toggle-btn map-icon-btn fast-tooltip active' : 'token-toggle-btn map-icon-btn fast-tooltip'}
                    onClick={() => {
                      const hidden = !selectedAllHidden
                      void Promise.all(selectedTokens.map((token) => onUpdateToken(token.id, { hidden })))
                    }}
                    disabled={selectedTokenCount === 0}
                    aria-label="Toggle selected hidden tokens"
                    data-tooltip="Hide token"
                  >
                    <EyeOff size={14} />
                  </button>
                </div>
                {selectedPartyTokens.length > 0 ? (
                  <div className="token-view-distance token-group-view-distance" aria-label="Selected token view distance">
                    <span className="token-view-distance-icon fast-tooltip" data-tooltip="View Distance" aria-hidden>
                      <Binoculars size={14} />
                    </span>
                    <input
                      className="token-view-distance-slider"
                      type="range"
                      min={8}
                      max={600}
                      step={2}
                      value={selectedBulkViewDistanceValue}
                      onChange={(event) => {
                        const viewDistance = Number(event.target.value)
                        void Promise.all(selectedPartyTokens.map((token) => onUpdateTokenViewDistance(token.id, viewDistance)))
                      }}
                    />
                    <span className="token-view-distance-value">{selectedBulkViewDistanceValue}</span>
                  </div>
                ) : null}
              </div>
              {tokenGroups.map((group) => {
                const groupCollapsed = collapsedTokenGroupKeys.includes(group.key)
                const groupSelectedTokens = group.tokens.filter((token) => selectedTokenIdSet.has(token.id))
                const groupSelectedTokenIds = groupSelectedTokens.map((token) => token.id)
                const groupHasSelectedTokens = groupSelectedTokenIds.length > 0
                const groupAllSelected = groupHasSelectedTokens && groupSelectedTokenIds.length === group.tokens.length
                return (
                  <section key={group.key} className="token-group-block" aria-label={group.label}>
                    <div className="token-group-header">
                      <h5 className="token-group-title">{group.label}</h5>
                      <div className="token-group-actions">
                        <span className="token-group-count">{group.tokens.length}</span>
                        <button
                          type="button"
                          className="token-group-collapse-btn fast-tooltip"
                          onClick={() => toggleTokenGroupCollapsed(group.key)}
                          aria-label={groupCollapsed ? `Expand ${group.label} tokens` : `Minimize ${group.label} tokens`}
                          data-tooltip={groupCollapsed ? 'Expand category' : 'Minimize category'}
                        >
                          {groupCollapsed ? <Plus size={13} /> : <Minus size={13} />}
                        </button>
                        <label className="token-group-check-label">
                          <input
                            type="checkbox"
                            checked={groupAllSelected}
                            onChange={() => toggleGroupSelected(group.tokens, !groupAllSelected)}
                            aria-label={groupAllSelected ? `Deselect all ${group.label} tokens` : `Select all ${group.label} tokens`}
                          />
                        </label>
                      </div>
                    </div>
                    {!groupCollapsed ? (
                    <div className="token-list">
                      {(() => {
                        const renderRow = (token: TokenRecord, index: number) => (
                          <div
                            key={token.id}
                            className={selectedTokenIdSet.has(token.id) ? 'token-row selected' : 'token-row'}
                            onClick={(event) => {
                              const target = event.target as HTMLElement | null
                              if (target?.closest('button,input,select,textarea,a,label')) return
                              toggleTokenListSelection(token.id, event.shiftKey)
                            }}
                          >
                            <div className="token-row-summary">
                              <span className="token-row-icon" style={{ color: token.color }} aria-hidden>
                                {token.tokenImageUrl ? (
                                  <img src={token.tokenImageUrl} alt="" className="token-row-image" />
                                ) : (
                                  <ChessPawn size={14} />
                                )}
                              </span>
                              <input
                                type="text"
                                className="token-row-label-input"
                                value={tokenNameDrafts[token.id] ?? token.name}
                                onFocus={() => {
                                  onSelectedTokenIdsChange((current) => (current.includes(token.id) ? current : [...current, token.id]))
                                  setTokenNameDrafts((prev) => ({
                                    ...prev,
                                    [token.id]: token.name,
                                  }))
                                }}
                                onChange={(event) =>
                                  setTokenNameDrafts((prev) => ({
                                    ...prev,
                                    [token.id]: event.target.value,
                                  }))
                                }
                                onBlur={(event) => void commitTokenLabelEdit(token, event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.currentTarget.blur()
                                  }
                                }}
                                aria-label={`${group.label} token ${index + 1} name`}
                                placeholder={`${group.label} ${index + 1}`}
                              />
                            </div>
                          </div>
                        )

                        // Note: `Map` is shadowed by the lucide-react Map icon import,
                        // so partition into an ordered list of [name, tokens] entries.
                        const namedGroups: Array<[string, TokenRecord[]]> = []
                        const loose: TokenRecord[] = []
                        group.tokens.forEach((token) => {
                          const name = (token.group ?? '').trim()
                          if (!name) {
                            loose.push(token)
                            return
                          }
                          const existing = namedGroups.find(([key]) => key === name)
                          if (existing) {
                            existing[1].push(token)
                          } else {
                            namedGroups.push([name, [token]])
                          }
                        })

                        return (
                          <>
                            {namedGroups.map(([name, groupedTokens]) => {
                              const subgroupKey = `${group.key}:${name}`
                              const subgroupCollapsed = collapsedSubgroupKeys.includes(subgroupKey)
                              const subgroupAllSelected = groupedTokens.every((token) => selectedTokenIdSet.has(token.id))
                              return (
                              <div key={`group-${name}`} className="token-subgroup">
                                <div className="token-subgroup-header">
                                  <span className="token-subgroup-title">{name}</span>
                                  <span className="token-subgroup-count">{groupedTokens.length}</span>
                                  <button
                                    type="button"
                                    className="token-subgroup-collapse fast-tooltip"
                                    onClick={() => toggleSubgroupCollapsed(subgroupKey)}
                                    aria-label={subgroupCollapsed ? `Expand ${name} group` : `Minimize ${name} group`}
                                    data-tooltip={subgroupCollapsed ? 'Expand group' : 'Minimize group'}
                                  >
                                    {subgroupCollapsed ? <Plus size={12} /> : <Minus size={12} />}
                                  </button>
                                  <button
                                    type="button"
                                    className="token-subgroup-ungroup fast-tooltip"
                                    onClick={() =>
                                      setDisbandCandidate({ name, tokenIds: groupedTokens.map((token) => token.id) })
                                    }
                                    aria-label={`Disband ${name} group`}
                                    data-tooltip="Disband group"
                                  >
                                    <X size={12} />
                                  </button>
                                  <label className="token-subgroup-check-label">
                                    <input
                                      type="checkbox"
                                      checked={subgroupAllSelected}
                                      onChange={() => toggleGroupSelected(groupedTokens, !subgroupAllSelected)}
                                      aria-label={subgroupAllSelected ? `Deselect all ${name} tokens` : `Select all ${name} tokens`}
                                    />
                                  </label>
                                </div>
                                {subgroupCollapsed
                                  ? null
                                  : groupedTokens.map((token) => renderRow(token, group.tokens.indexOf(token)))}
                              </div>
                              )
                            })}
                            {loose.map((token) => renderRow(token, group.tokens.indexOf(token)))}
                          </>
                        )
                      })()}
                    </div>
                    ) : null}
                  </section>
                )
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
