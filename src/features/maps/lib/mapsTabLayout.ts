import type { CSSProperties } from 'react'
import type { Role } from '../../../types/app'
import type { FogTool, VisionTool } from './gmToolToggles'
import { isBlankMap } from './inlineMapSizing'
import type { MapRecord } from './types'

// Which of the Maps tab's panes and layers show, and how they are styled, for the
// viewer's role, the screen size and the GM's workspace phase.

export type MapsPanes = {
  isMobile: boolean
  mobileMapView: 'list' | 'detail'
  mobileGmPane: 'map' | 'tokens' | 'characters'
  mobilePlayerPane: 'map' | 'controls' | 'character'
  desktopGmPane: 'map' | 'character'
  desktopGmRun: boolean
  showEmbeddedMap: boolean
}

function classNames(...names: Array<string | false>) {
  return names.filter(Boolean).join(' ')
}

// The GM stage renders the player-facing map state in Map Preview, which is always
// player-facing (read-only), and in Map Run while the Player View Preview is on.
export function viewModes(role: Role | null, playerViewPreview: boolean, previewMode: boolean) {
  const viewAsPlayer = playerViewPreview || previewMode
  return { viewAsPlayer, gmView: role === 'gm' && !viewAsPlayer }
}

export function isMobileZoomMapView(isMobile: boolean, role: Role | null, mobileGmPane: MapsPanes['mobileGmPane']) {
  return isMobile && (role !== 'gm' || mobileGmPane === 'map')
}

export function showsGmTopTools(panes: MapsPanes, isGm: boolean) {
  return panes.desktopGmRun || (panes.isMobile && isGm && panes.mobileMapView === 'detail' && panes.mobileGmPane === 'map')
}

function mobileMainClassName(isMobile: boolean, isGm: boolean) {
  if (!isMobile) return false
  return isGm ? 'mobile-gm' : 'mobile-player'
}

function isMainHidden(panes: MapsPanes) {
  return !panes.showEmbeddedMap || (panes.desktopGmRun && panes.desktopGmPane !== 'map')
}

export function mapsMainClassName(panes: MapsPanes, isGm: boolean) {
  return classNames(
    isGm ? 'maps-main gm' : 'maps-main player',
    mobileMainClassName(panes.isMobile, isGm),
    panes.desktopGmRun && 'run',
    isMainHidden(panes) && 'maps-main-hidden',
  )
}

function isGmMapPaneOpen(panes: MapsPanes) {
  return !panes.isMobile || panes.mobileGmPane === 'map'
}

export function showsDrawingToolbar(panes: MapsPanes, isGm: boolean, map: MapRecord | null): map is MapRecord {
  return isGm && isBlankMap(map) && !panes.desktopGmRun && isGmMapPaneOpen(panes)
}

export function showsMapStage(panes: MapsPanes, isGm: boolean) {
  return !panes.isMobile || (isGm ? panes.mobileGmPane === 'map' : panes.mobilePlayerPane === 'map')
}

export function showsGmControlsPane(panes: MapsPanes, isGm: boolean, phase: 'preview' | 'run') {
  return isGm && (panes.isMobile ? panes.mobileGmPane === 'tokens' : phase === 'run' && !panes.desktopGmRun)
}

export function showsPlayerControls(panes: MapsPanes, isGm: boolean) {
  return !isGm && (!panes.isMobile || panes.mobilePlayerPane === 'controls')
}

export function showsGmEmbeddedCharacter(panes: MapsPanes) {
  return panes.desktopGmRun && panes.desktopGmPane === 'character'
}

export function showsMobileGmCharacters(panes: MapsPanes, isGm: boolean) {
  return panes.isMobile && isGm && panes.mobileGmPane === 'characters'
}

export function mapLayerStyle(pan: { x: number; y: number }, zoom: number, dragging: boolean): CSSProperties {
  return {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    cursor: dragging ? 'grabbing' : zoom > 1 ? 'grab' : undefined,
  }
}

// The GM sees fog half-transparent, painted vision blocks while painting them, and
// the area tokens have seen; the GM viewing as a player sees what players see.
export function mapLayerOpacities(gmView: boolean, visionTool: VisionTool | null) {
  return {
    fog: gmView ? 0.45 : 1,
    vision: gmView && visionTool ? 0.38 : 0,
    losSeen: gmView ? 0.75 : 0,
  }
}

export function fogCanvasClassName(placing: boolean, fogTool: FogTool | null, visionTool: VisionTool | null) {
  return placing || (!fogTool && !visionTool) ? 'map-fog-canvas read-only' : 'map-fog-canvas brush'
}

export function placingClassName(base: string, placing: boolean) {
  return placing ? `${base} placing` : base
}

export function showsLoadingMask(map: MapRecord | null, imageReady: boolean, fogReady: boolean) {
  return map?.kind !== 'blank' && (!imageReady || !fogReady)
}
