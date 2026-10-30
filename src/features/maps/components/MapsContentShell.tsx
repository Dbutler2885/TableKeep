import { ChevronLeft, Pencil, TvMinimalPlay } from 'lucide-react'
import { clickBareMap, pressBareMap } from '../lib/bareMapInteractions'
import {
  mapLayerStyle,
  mapsMainClassName,
  showsDrawingToolbar,
  showsGmControlsPane,
  showsGmEmbeddedCharacter,
  showsGmTopTools,
  showsMapStage,
  showsMobileGmCharacters,
  showsPlayerControls,
} from '../lib/mapsTabLayout'
import { InlineMapStage } from './InlineMapStage'
import { MapStageLayers } from './MapStageLayers'
import {
  GmCharacterTabs,
  GmEmbeddedCharacter,
  MapsMobileNav,
  MobileGmCharacterPane,
  PlayerEmbeddedCharacter,
  PlayerTopNav,
} from './MapsCharacterPanes'
import { MapsGmControls, MapsTopToolPanel } from './MapsGmControls'
import type { MapsTabModel } from './mapsTabModel'
import { PlayerMapControls } from './PlayerMapControls'

type PaneProps = { model: MapsTabModel; isGm: boolean }

function MapStageButtons({ model, isGm }: PaneProps) {
  const { panes, workspace } = model
  const map = model.mapData.selectedMap
  return (
    <>
      {panes.previewMode && map ? (
        <button
          type="button"
          className="map-run-btn"
          onClick={workspace.enterMapRun}
          aria-label="Run this map"
        >
          <TvMinimalPlay size={15} />
          Run
        </button>
      ) : null}
      {panes.desktopGmRun ? (
        <button
          type="button"
          className="map-preview-back-btn"
          onClick={workspace.backToPreview}
          aria-label="Back to map preview"
        >
          <ChevronLeft size={16} />
          Back
        </button>
      ) : null}
      {showsDrawingToolbar(panes, isGm, map) ? (
        <div className="map-preview-drawing-toolbar">
          <button
            type="button"
            className="map-edit-drawing-btn"
            onClick={() => void model.drawing.openDrawingEditor(map.id)}
          >
            <Pencil size={15} />
            Edit drawing
          </button>
        </div>
      ) : null}
    </>
  )
}

// The map itself, zoomed and panned, with every layer drawn over it.
function MapStage({ model }: { model: MapsTabModel }) {
  const { size, viewport, grid, inlineReady } = model
  const zoomView = model.view.isMobileZoomMapView
  return (
    <InlineMapStage
      stageRef={size.inlineStageRef}
      mapLayerRef={size.inlineMapLayerRef}
      stageClassName={zoomView ? 'map-stage mobile-player-stage' : 'map-stage'}
      selectedMap={model.mapData.selectedMap}
      mapLayerClassName={zoomView ? 'map-zoom-layer mobile-player-zoom' : 'map-zoom-layer'}
      mapLayerStyle={mapLayerStyle(viewport.playerPan, viewport.playerZoom, viewport.playerDragging)}
      onImageReady={inlineReady.handleInlineImageReady}
      onBlankReady={inlineReady.handleInlineBlankReady}
      onStageWheel={viewport.handlePlayerWheel}
      onStageMouseDown={viewport.handlePlayerMouseDown}
      onStageMouseMove={viewport.handlePlayerMouseMove}
      onStageMouseUp={viewport.endPlayerDrag}
      onStageMouseLeave={viewport.endPlayerDrag}
      onMapLayerContextMenu={(event) => event.preventDefault()}
      onMapLayerWheel={(event) => grid.handleGridLayerWheel(event)}
      onMapLayerMouseDown={(event) => {
        if (grid.handleGridLayerMouseDown(event)) return
        pressBareMap(model.bareMap, event)
      }}
      onMapLayerMouseMove={(event) => {
        grid.handleGridCalibrateMouseMove(event.clientX, event.clientY)
        grid.handleGridMeasureMouseMove(event.clientX, event.clientY)
      }}
      onMapLayerClick={(event) => clickBareMap(model.bareMap, event)}
      onMapLayerTouchStart={viewport.handleMobilePlayerTouchStart}
      onMapLayerTouchMove={viewport.handleMobilePlayerTouchMove}
      onMapLayerTouchEnd={viewport.handleMobilePlayerTouchEnd}
      onMapLayerTouchCancel={viewport.handleMobilePlayerTouchEnd}
    >
      <MapStageLayers model={model} />
    </InlineMapStage>
  )
}

function MapsMainPane({ model, isGm }: PaneProps) {
  const { panes } = model
  return (
    <div className={mapsMainClassName(panes, isGm)}>
      <MapStageButtons model={model} isGm={isGm} />
      {showsMapStage(panes, isGm) ? <MapStage model={model} /> : null}

      {showsGmControlsPane(panes, isGm, model.workspace.phase) ? (
        <aside className="map-controls">
          <MapsGmControls model={model} showTopTools={!panes.isMobile} />
        </aside>
      ) : null}

      {showsPlayerControls(panes, isGm) ? (
        <aside className="map-controls">
          <PlayerMapControls
            cameraLock={model.viewport.cameraLock}
            onToggleCameraLock={model.viewport.toggleCameraLock}
            presentedNpc={model.scene.presentedNpc}
            selectedTokens={model.mapData.tokens.filter((token) => model.selection.playerSelectedTokenIds.includes(token.id))}
          />
        </aside>
      ) : null}
    </div>
  )
}

function MapsContentHeader({ model, isGm }: PaneProps) {
  const { panes } = model
  return (
    <>
      <PlayerTopNav model={model} isGm={isGm} />

      {panes.desktopGmRun ? <GmCharacterTabs model={model} /> : null}

      {showsGmTopTools(panes, isGm) ? <MapsTopToolPanel model={model} /> : null}

      {panes.desktopGmRun ? (
        <aside className="map-controls map-run-token-controls">
          <MapsGmControls model={model} showTopTools={false} />
        </aside>
      ) : null}
    </>
  )
}

function MapsContentFooter({ model, isGm }: PaneProps) {
  const { panes } = model
  return (
    <>
      <PlayerEmbeddedCharacter model={model} isGm={isGm} />

      {showsGmEmbeddedCharacter(panes) ? <GmEmbeddedCharacter tabProps={model.characters.selectedGmCharacterTabProps} /> : null}

      {showsMobileGmCharacters(panes, isGm) ? <MobileGmCharacterPane model={model} /> : null}

      {panes.isMobile ? <MapsMobileNav model={model} isGm={isGm} /> : null}
    </>
  )
}

// Everything right of the map list: navigation, the GM's tools, the map, and the
// character sheets.
export function MapsContentShell({ model, isGm }: PaneProps) {
  return (
    <div className={model.panes.desktopGmRun ? 'maps-content-shell map-run-shell' : 'maps-content-shell'}>
      <MapsContentHeader model={model} isGm={isGm} />
      <MapsMainPane model={model} isGm={isGm} />
      <MapsContentFooter model={model} isGm={isGm} />
    </div>
  )
}
