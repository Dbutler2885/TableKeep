import { nextSceneNpcIds, scaledTokenUpdate, withTokenUpdate } from '../lib/gmMapUpdates'
import { tokenViewDistanceSliderValue } from '../lib/tokenRenderGeometry'
import { GmMapControls } from './GmMapControls'
import { GmMapTopToolPanel } from './GmMapTopToolPanel'
import type { MapsTabModel } from './mapsTabModel'

type ModelProps = { model: MapsTabModel }

// The props the GM tool panel above the map and the GM controls beside it share.
function sharedToolProps(model: MapsTabModel) {
  const { view, toolActions, settings, grid, gridView, encounter } = model
  const selectedMap = model.mapData.selectedMap
  return {
    fogTool: view.fogTool,
    setFogTool: toolActions.setFogTool,
    visionTool: view.visionTool,
    setVisionTool: toolActions.setVisionTool,
    fogBrushSize: settings.fogBrushSize,
    setFogBrushSize: settings.setFogBrushSize,
    tokenSelectMode: view.tokenSelectMode,
    setTokenSelectMode: toolActions.setTokenSelectMode,
    annotationPlaceMode: view.annotationPlaceMode,
    setAnnotationPlaceMode: toolActions.setAnnotationPlaceMode,
    playerLabelPlaceMode: view.playerLabelPlaceMode,
    setPlayerLabelPlaceMode: toolActions.setPlayerLabelPlaceMode,
    gmHideLabels: view.gmHideLabels,
    setGmHideLabels: toolActions.setGmHideLabels,
    handToolActive: view.handToolActive,
    setHandToolActive: toolActions.setHandToolActive,
    npcSceneMode: settings.npcSceneMode,
    setNpcSceneMode: settings.setNpcSceneMode,
    playerViewPreview: view.playerViewPreview,
    setPlayerViewPreview: toolActions.setPlayerViewPreview,
    gridVisible: grid.effectiveGridVisible,
    gridType: grid.effectiveGridType,
    gridAdjustMode: grid.gridAdjustMode,
    onToggleGridVisible: () => void grid.toggleGridVisibility(),
    onSetGridType: toolActions.setGridTypeTool,
    hexDetecting: grid.hexDetecting,
    gridCalibrateMode: grid.gridCalibrateMode,
    onToggleGridCalibrate: toolActions.toggleGridCalibrateTool,
    gridCalibrateReady: Boolean(grid.gridCalibrateStart && grid.gridCalibrateEnd),
    gridCalibrateSaved: Boolean(grid.gridCalibrateSavedAt),
    onApplyGridCalibration: gridView.handleApplyGridCalibration,
    measurementToolEnabled: gridView.measurementToolEnabled,
    gridMeasureMode: grid.gridMeasureMode,
    onToggleGridMeasure: toolActions.toggleGridMeasureTool,
    distanceTrackerFeet: encounter.distanceTrackerFeet,
    distanceTrackerMode: encounter.distanceTrackerMode,
    distanceTrackerRoll: encounter.distanceTrackerRoll,
    onResetDistanceTracker: encounter.resetDistanceTracker,
    applyFogPreset: model.fog.applyFogPreset,
    canApplyPreset: Boolean(selectedMap),
    fullyHidden: selectedMap?.fullyHidden === true,
  }
}

// The GM's tool panel above the map.
export function MapsTopToolPanel({ model }: ModelProps) {
  return (
    <GmMapTopToolPanel
      {...sharedToolProps(model)}
      guidance={model.gridView.toolGuidance}
      onOpenHelp={() => model.help.setOpen(true)}
    />
  )
}

// A token size or view distance is shown at once and then saved with its scale.
function saveScaledField(mapData: MapsTabModel['mapData'], field: 'size' | 'viewDistance') {
  return async (tokenId: string, value: number) => {
    const update = scaledTokenUpdate(field, value)
    mapData.setTokens((prev) => withTokenUpdate(prev, tokenId, update))
    await mapData.updateToken(tokenId, update)
  }
}

// The GM's token, placement and scene NPC controls beside the map.
export function MapsGmControls({ model, showTopTools }: ModelProps & { showTopTools: boolean }) {
  const { mapData, sources, placement, grid, gridView, scene, settings } = model
  const sceneNpcIds = mapData.selectedMap?.sceneNpcIds ?? []
  return (
    <GmMapControls
      {...sharedToolProps(model)}
      campaignId={model.campaignId}
      groupId={model.groupId}
      showTopTools={showTopTools}
      tokenColor={settings.tokenColor}
      setTokenColor={settings.setTokenColor}
      tokenSize={settings.tokenSize}
      setTokenSize={settings.setTokenSize}
      tokenAssets={mapData.tokenAssets}
      selectedTokenAssetId={mapData.selectedTokenAssetId}
      setSelectedTokenAssetId={mapData.setSelectedTokenAssetId}
      selectedTokenImageUrl={mapData.selectedTokenAsset?.imageUrl ?? ''}
      uploadingTokenImage={model.tokenAssets.uploadingTokenImage}
      onUploadTokenImage={model.tokenAssets.uploadTokenImage}
      onArchiveTokenAsset={mapData.archiveTokenAsset}
      onRequestDeleteTokenAsset={mapData.requestDeleteTokenAsset}
      placementDisplay={placement.placementDisplay}
      partyPlacementSources={sources.partyPlacementSources}
      monsterPlacementSources={sources.monsterPlacementSources}
      npcPlacementSources={sources.npcPlacementSources}
      genericPlacementSources={sources.genericPlacementSources}
      onStartSinglePlacement={placement.startSinglePlacement}
      onStartWholePartyPlacement={placement.startWholePartyPlacement}
      onStartMonsterPlacement={placement.startMonsterPlacement}
      onCancelPlacement={placement.cancelPlacement}
      onApplyGrid={grid.applyGridAdjust}
      hexDetectConfidence={grid.hexDetectConfidence}
      gridAdjustReady={gridView.gridAdjustReady}
      gridAdjustSaved={Boolean(grid.gridAdjustSavedAt)}
      measurementFeetLabel={gridView.measurementFeetLabel}
      tokens={mapData.tokens}
      selectedTokenIds={model.selection.selectedTokenIds}
      onSelectedTokenIdsChange={model.selection.setSelectedTokenIds}
      onUpdateToken={mapData.updateToken}
      onUpdateTokenSize={saveScaledField(mapData, 'size')}
      onUpdateTokenViewDistance={saveScaledField(mapData, 'viewDistance')}
      tokenViewDistanceSliderValue={tokenViewDistanceSliderValue}
      onRequestDeleteTokens={mapData.requestDeleteTokens}
      mapNpcs={mapData.mapNpcs}
      sceneNpcs={scene.sceneNpcs}
      presentedNpc={scene.presentedNpc}
      selectedMapSceneNpcIds={sceneNpcIds}
      onToggleSceneNpc={(npcId, enabled) => void mapData.updateSceneNpcIds(nextSceneNpcIds(sceneNpcIds, npcId, enabled))}
      onPresentNpc={(npcId) => void mapData.setPresentedNpcId(npcId)}
      onClearPresentedNpc={() => void mapData.setPresentedNpcId('')}
    />
  )
}
