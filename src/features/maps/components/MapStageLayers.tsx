import type { MouseEvent, TouchEvent } from 'react'
import {
  isTokenPartlyShownOnFog,
  isTokenShownOnFog,
  tokenLivePosition,
  type FogVisibility,
  type TokenLayerKind,
} from '../lib/mapTokenDisplay'
import { fogCanvasClassName, mapLayerOpacities, placingClassName, showsLoadingMask } from '../lib/mapsTabLayout'
import { selectionRectStyle } from '../lib/tokenBoxSelection'
import type { TokenRecord } from '../lib/types'
import { GridOverlay } from './GridOverlay'
import { CalibrationOverlay, MeasurementOverlay } from './GridLineOverlays'
import { MapAnnotations } from './MapAnnotations'
import { GmTokenItem, PlayerTokenItem, type PlayerTokenInteractions } from './MapTokenItems'
import type { MapsTabModel } from './mapsTabModel'
import { TokenLayer } from './TokenLayer'

type ModelProps = { model: MapsTabModel }

function fogVisibility(model: MapsTabModel): FogVisibility {
  return {
    role: model.role,
    playerViewPreview: model.view.playerViewPreview,
    fullyHidden: model.mapData.selectedMap?.fullyHidden ?? true,
    fogCanvasRef: model.fog.activeFogCanvasRef,
  }
}

function livePosition(model: MapsTabModel, token: TokenRecord) {
  return tokenLivePosition(token, model.tokenDrag.dragTokenPositions?.[token.id], model.animation.animatedTokenPositions[token.id])
}

function GridAdjustShade({ grid }: { grid: MapsTabModel['grid'] }) {
  if (!grid.gridAdjustMode || !grid.effectiveGridEnabled || !grid.effectiveGridVisible) return null
  return <div className="map-grid-adjust-overlay" />
}

function FogCanvases({ model }: ModelProps) {
  const { fog, view, size, brush } = model
  const { inlineFogCanvasRef, inlineVisionCanvasRef } = fog
  const { inlineLosSeenCanvasRef } = size
  const opacities = mapLayerOpacities(view.gmView, view.visionTool)
  const width = Math.max(1, size.inlineFogSize.width)
  const height = Math.max(1, size.inlineFogSize.height)
  return (
    <>
      <canvas
        ref={inlineFogCanvasRef}
        className={fogCanvasClassName(view.placing, view.fogTool, view.visionTool)}
        width={width}
        height={height}
        style={{ opacity: opacities.fog }}
        onMouseDown={brush.handlers.onMouseDown}
        onMouseEnter={brush.handlers.onMouseEnter}
        onMouseMove={brush.handlers.onMouseMove}
        onMouseUp={brush.handlers.onMouseUp}
        onMouseLeave={brush.handlers.onMouseLeave}
        onTouchStart={brush.handlers.onTouchStart}
        onTouchMove={brush.handlers.onTouchMove}
        onTouchEnd={brush.handlers.onTouchEnd}
        onTouchCancel={brush.handlers.onTouchEnd}
      />
      <canvas
        ref={inlineVisionCanvasRef}
        className="map-vision-canvas"
        width={width}
        height={height}
        style={{ opacity: opacities.vision }}
      />
      <canvas
        ref={inlineLosSeenCanvasRef}
        className="map-los-seen-canvas"
        width={width}
        height={height}
        style={{ opacity: opacities.losSeen }}
      />
    </>
  )
}

type TokenDragControls = Pick<MapsTabModel['tokenDrag'], 'startTokenDrag' | 'handleTokenTouchStart'>

function pressGmToken(model: MapsTabModel, drag: TokenDragControls, tokenId: string, event: MouseEvent<HTMLButtonElement>) {
  if (model.view.placing) return
  model.toolActions.clearAnnotationPlacementTool()
  drag.startTokenDrag(tokenId, event)
}

function touchGmToken(model: MapsTabModel, drag: TokenDragControls, tokenId: string, event: TouchEvent<HTMLButtonElement>) {
  if (model.view.placing) return
  model.toolActions.clearAnnotationPlacementTool()
  drag.handleTokenTouchStart(tokenId, event)
}

// The tokens on the GM's view of the map.
function GmTokenLayer({ model }: ModelProps) {
  const { tokenDrag, selection, mapData } = model
  const visibility = fogVisibility(model)
  return (
    <TokenLayer
      className={placingClassName('map-token-layer gm', model.view.placing)}
      tokens={mapData.tokens}
      renderToken={(token, index) => (
        <GmTokenItem
          key={token.id}
          token={token}
          index={index}
          visible={isTokenShownOnFog(token, visibility)}
          position={livePosition(model, token)}
          selected={selection.selectedTokenIds.includes(token.id)}
          dimensions={model.geometry.renderTokenDimensions(token)}
          playerViewPreview={model.view.playerViewPreview}
          onPress={(tokenId, event) => pressGmToken(model, tokenDrag, tokenId, event)}
          onTouchStart={(tokenId, event) => touchGmToken(model, tokenDrag, tokenId, event)}
          onTouchEnd={tokenDrag.handleTokenTouchEnd}
          onToggleHidden={(tokenId) => void mapData.toggleTokenHidden(tokenId)}
        />
      )}
    />
  )
}

const PLAYER_LAYERS: Record<TokenLayerKind, { className: string; label: string }> = {
  'under-fog': { className: 'map-token-layer under-fog', label: 'Map tokens under fog' },
  'over-fog': { className: 'map-token-layer player-over-fog', label: 'Map party tokens' },
}

function playerTokenInteractions(model: MapsTabModel): PlayerTokenInteractions {
  const gmStreaming = model.role === 'gm' && model.view.playerViewPreview
  return {
    gmStreaming,
    placing: model.view.placing,
    clearAnnotationPlacementTool: model.toolActions.clearAnnotationPlacementTool,
    startTokenDrag: model.tokenDrag.startTokenDrag,
    handleTokenTouchStart: model.tokenDrag.handleTokenTouchStart,
    touchEnd: gmStreaming ? model.tokenDrag.handleTokenTouchEnd : undefined,
    togglePlayerTokenSelection: model.selection.togglePlayerTokenSelection,
  }
}

// The tokens players see in one layer: party tokens over the fog, the rest under it.
function PlayerTokenLayer({ model, layer }: ModelProps & { layer: TokenLayerKind }) {
  const visibility = fogVisibility(model)
  const interactions = playerTokenInteractions(model)
  const isPartlyShown = (token: TokenRecord, position: { x: number; y: number }) => (
    isTokenPartlyShownOnFog(token, { x: position.x, y: position.y }, model.geometry.renderTokenDimensions(token), visibility, model.dimensions.activeMapDimension)
  )
  return (
    <TokenLayer
      className={placingClassName(PLAYER_LAYERS[layer].className, model.view.placing)}
      ariaLabel={PLAYER_LAYERS[layer].label}
      tokens={model.mapData.tokens}
      renderToken={(token, index) => (
        <PlayerTokenItem
          key={`${layer}-${token.id}`}
          token={token}
          index={index}
          layer={layer}
          gmEditing={model.view.gmView}
          position={livePosition(model, token)}
          selected={model.selection.playerSelectedTokenIds.includes(token.id)}
          dimensions={model.geometry.renderTokenDimensions(token)}
          isPartlyShown={isPartlyShown}
          interactions={interactions}
        />
      )}
    />
  )
}

function MapSelectionBox({ model }: ModelProps) {
  const style = selectionRectStyle(model.selection.tokenSelectionBox)
  if (model.role !== 'gm' || !style) return null
  return <div className="map-token-selection-box" style={style} />
}

type BrushCursorElementProps = { active: boolean; mode: string; cursorRef: MapsTabModel['brush']['cursor']['brushCursorRef'] }

function BrushCursorElement({ active, mode, cursorRef }: BrushCursorElementProps) {
  if (!active) return null
  return (
    <div
      ref={cursorRef}
      className={['map-brush-cursor', mode].filter(Boolean).join(' ')}
      aria-hidden
    />
  )
}

function MapLoadingMask({ model }: ModelProps) {
  if (!showsLoadingMask(model.mapData.selectedMap, model.size.inlineImageReady, model.fog.inlineFogReady)) return null
  return <div className={model.view.gmView ? 'map-fog-loading-mask gm' : 'map-fog-loading-mask'} aria-hidden />
}

// Everything drawn over the map image, bottom to top: the grid and its tools,
// tokens under the fog, the fog and vision canvases, the GM's tokens or the
// party's, the selection box, the annotations, the brush and the loading mask.
export function MapStageLayers({ model }: ModelProps) {
  const { grid, gridView, size } = model
  const playerFacing = !model.view.gmView
  return (
    <>
      <GridOverlay
        enabled={grid.effectiveGridEnabled}
        visible={grid.effectiveGridVisible}
        type={grid.effectiveGridType}
        pending={grid.gridAdjustMode}
        cellScale={grid.effectiveGridCellScale}
        offsetX={grid.effectiveGridOffsetX}
        offsetY={grid.effectiveGridOffsetY}
        mapWidth={Math.max(1, size.inlineBaseSize.width)}
        mapHeight={Math.max(1, size.inlineBaseSize.height)}
      />
      <GridAdjustShade grid={grid} />
      <CalibrationOverlay line={gridView.gridCalibrationLine} pulse={grid.gridCalibratePulse} onHandleMouseDown={grid.handleGridCalibrateHandleMouseDown} />
      <MeasurementOverlay line={gridView.gridMeasurementLine} label={gridView.measurementFeetLabel} onHandleMouseDown={grid.handleGridMeasureHandleMouseDown} />
      {playerFacing ? <PlayerTokenLayer model={model} layer="under-fog" /> : null}
      <FogCanvases model={model} />
      {!playerFacing ? <GmTokenLayer model={model} /> : null}
      {playerFacing ? <PlayerTokenLayer model={model} layer="over-fog" /> : null}
      <MapSelectionBox model={model} />
      <MapAnnotations model={model} />
      <BrushCursorElement active={model.brush.active} mode={model.brush.mode} cursorRef={model.brush.cursor.brushCursorRef} />
      <MapLoadingMask model={model} />
    </>
  )
}
