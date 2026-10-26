import type { Role } from '../../../types/app'
import type { FogTool, VisionTool } from './gmToolToggles'

// The cursor's modifier class for the brush in use, which sets its colour.
export function brushCursorMode(fogTool: FogTool | null, visionTool: VisionTool | null) {
  if (fogTool) return `fog-${fogTool}`
  if (visionTool === 'drawFull') return 'vision-draw-full'
  return visionTool ? `vision-${visionTool}` : ''
}

export function isBrushActive(role: Role | null, placing: boolean, fogTool: FogTool | null, visionTool: VisionTool | null) {
  return role === 'gm' && !placing && Boolean(fogTool || visionTool)
}

type CanvasLayout = Pick<HTMLCanvasElement, 'getBoundingClientRect' | 'offsetWidth' | 'offsetHeight' | 'width' | 'height'>

function lacksLayout(rect: DOMRect, layoutWidth: number, layoutHeight: number) {
  return rect.width <= 0 || rect.height <= 0 || layoutWidth <= 0 || layoutHeight <= 0
}

// canvas.width/height of 1 is the un-sized placeholder (Math.max(1, inlineFogSize.*))
// before fog dimensions are measured. Dividing the brush size by it inflates the
// cursor to ~full-map size (the stray giant oval), so treat it as not-ready.
function isPlaceholderCanvas(canvas: CanvasLayout) {
  return canvas.width <= 1 || canvas.height <= 1
}

export type BrushCursorGeometry = { x: number; y: number; width: number; height: number }

// Where the brush cursor sits over the fog canvas, in the canvas's layout pixels,
// and how big the brush is there; null while the canvas is not laid out.
export function brushCursorGeometry(clientX: number, clientY: number, canvas: CanvasLayout, brushSize: number): BrushCursorGeometry | null {
  const rect = canvas.getBoundingClientRect()
  const layoutWidth = canvas.offsetWidth
  const layoutHeight = canvas.offsetHeight
  if (lacksLayout(rect, layoutWidth, layoutHeight) || isPlaceholderCanvas(canvas)) return null
  return {
    x: Math.max(0, Math.min(layoutWidth, ((clientX - rect.left) / rect.width) * layoutWidth)),
    y: Math.max(0, Math.min(layoutHeight, ((clientY - rect.top) / rect.height) * layoutHeight)),
    width: Math.max(1, (brushSize / canvas.width) * layoutWidth),
    height: Math.max(1, (brushSize / canvas.height) * layoutHeight),
  }
}

export function placeBrushCursor(cursor: HTMLElement, geometry: BrushCursorGeometry) {
  cursor.style.setProperty('--brush-cursor-x', `${geometry.x}px`)
  cursor.style.setProperty('--brush-cursor-y', `${geometry.y}px`)
  cursor.style.width = `${geometry.width}px`
  cursor.style.height = `${geometry.height}px`
}

export function hideBrushCursorElement(cursor: HTMLElement | null) {
  if (cursor) cursor.dataset.visible = 'false'
}
