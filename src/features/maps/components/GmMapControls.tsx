import { useState, type Dispatch, type SetStateAction } from 'react'
import { usePresentedNpcGmNotes } from '../hooks/usePresentedNpcGmNotes'
import { useAllNpcTags, useSceneNpcPicker } from '../hooks/useSceneNpcPicker'
import { useTokenCards } from '../hooks/useTokenCards'
import type { NpcSummary, TokenAssetRecord, TokenRecord } from '../lib/types'
import type { getTokenPlacementDisplay, MonsterTokenPlacementSource, TokenPlacementSource } from '../lib/tokenPlacementQueue'
import type {
  buildWholePartyTokenPlacementSources,
  toGenericTokenPlacementSource,
  toNpcTokenPlacementSource,
} from '../lib/tokenPlacementSources'
import { GmGridModePanels } from './GmGridModePanels'
import { GmMapToolsPanel } from './GmMapToolsPanel'
import { PresentedNpcCard } from './PresentedNpcCard'
import { SceneNpcEditorModal } from './SceneNpcEditorModal'
import { SceneNpcPanel } from './SceneNpcPanel'
import type { TokenFieldUpdates } from './SelectedTokenControls'
import { TokenCardsPanel } from './TokenCardsPanel'
import { DisbandTokenGroupModal, MakeTokenGroupModal } from './TokenGroupModals'
import { TokenPlacementPanel } from './TokenPlacementPanel'

export type GmMapControlsProps = {
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
  onUpdateToken: (tokenId: string, updates: TokenFieldUpdates) => Promise<void>
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
}

type SceneNpcEditorProps = { campaignId: string; groupId: string; npcId: string; allTags: string[]; onClose: () => void }

function SceneNpcEditor({ npcId, ...props }: SceneNpcEditorProps) {
  if (!npcId) return null
  return <SceneNpcEditorModal npcId={npcId} {...props} />
}

// The GM's map controls: tools, grid panels, token placement, scene NPCs, the
// presented NPC and the token list. The state of each section lives here, so a
// section that is hidden and shown again comes back as it was.
export function GmMapControls(props: GmMapControlsProps) {
  const { campaignId, groupId, dark = false, showTopTools = true } = props
  const sceneNpcPicker = useSceneNpcPicker(props.mapNpcs, props.selectedMapSceneNpcIds)
  const allNpcTags = useAllNpcTags(props.mapNpcs)
  const [sceneNpcModalId, setSceneNpcModalId] = useState('')
  const presentedNpcGmNotes = usePresentedNpcGmNotes(campaignId, groupId, props.presentedNpc)
  const cards = useTokenCards(props.tokens, props.selectedTokenIds, props.onSelectedTokenIdsChange, props.onUpdateToken)

  return (
    <div className={dark ? 'map-controls-body dark' : 'map-controls-body'}>
      {showTopTools ? <GmMapToolsPanel {...props} /> : null}
      <GmGridModePanels {...props} />
      <TokenPlacementPanel {...props} />
      {props.npcSceneMode ? <SceneNpcPanel {...props} picker={sceneNpcPicker} onOpenNpc={setSceneNpcModalId} /> : null}
      <PresentedNpcCard npc={props.presentedNpc} gmNotes={presentedNpcGmNotes} />
      <SceneNpcEditor campaignId={campaignId} groupId={groupId} npcId={sceneNpcModalId} allTags={allNpcTags} onClose={() => setSceneNpcModalId('')} />
      <DisbandTokenGroupModal grouping={cards.grouping} />
      <MakeTokenGroupModal grouping={cards.grouping} count={cards.selectedTokens.length} categoryLabel={cards.categoryLabel} />
      {!props.playerViewPreview ? <TokenCardsPanel {...props} cards={cards} /> : null}
    </div>
  )
}
