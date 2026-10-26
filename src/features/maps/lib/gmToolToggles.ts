// What each GM tool button does to the other tools when it is pressed. Turning a
// brush or placement tool on drops the tools it cannot share the map with;
// turning it off touches nothing else.

export type FogTool = 'reveal' | 'hide'
export type VisionTool = 'draw' | 'drawFull' | 'erase'

export type GmToolControls = {
  fogTool: FogTool | null
  setFogTool: (tool: FogTool | null) => void
  visionTool: VisionTool | null
  setVisionTool: (tool: VisionTool | null) => void
  tokenSelectMode: boolean
  setTokenSelectMode: (value: boolean) => void
  annotationPlaceMode: boolean
  setAnnotationPlaceMode: (value: boolean) => void
  playerLabelPlaceMode: boolean
  setPlayerLabelPlaceMode: (value: boolean) => void
}

export function toggleFogTool(controls: GmToolControls, tool: FogTool) {
  controls.setTokenSelectMode(false)
  controls.setVisionTool(null)
  controls.setFogTool(controls.fogTool === tool ? null : tool)
}

export function toggleVisionTool(controls: GmToolControls, tool: VisionTool) {
  controls.setTokenSelectMode(false)
  controls.setFogTool(null)
  controls.setVisionTool(controls.visionTool === tool ? null : tool)
}

export function toggleAnnotationPlacement(controls: GmToolControls) {
  const next = !controls.annotationPlaceMode
  controls.setAnnotationPlaceMode(next)
  if (!next) return
  controls.setTokenSelectMode(false)
  controls.setPlayerLabelPlaceMode(false)
}

export function togglePlayerLabelPlacement(controls: GmToolControls) {
  const next = !controls.playerLabelPlaceMode
  controls.setPlayerLabelPlaceMode(next)
  if (!next) return
  controls.setTokenSelectMode(false)
  controls.setAnnotationPlaceMode(false)
}

export function toggleTokenSelect(controls: GmToolControls) {
  const next = !controls.tokenSelectMode
  controls.setTokenSelectMode(next)
  if (!next) return
  controls.setFogTool(null)
  controls.setVisionTool(null)
  controls.setAnnotationPlaceMode(false)
  controls.setPlayerLabelPlaceMode(false)
}
