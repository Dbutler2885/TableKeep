import { useCallback, useEffect, useRef, type MouseEvent, type MouseEventHandler, type TouchEvent, type TouchEventHandler } from 'react'
import { brushCursorGeometry, hideBrushCursorElement, placeBrushCursor } from '../lib/brushCursor'

type BrushCursorOptions = {
  active: boolean
  mode: string
  fogCanvasRef: { current: HTMLCanvasElement | null }
  brushSize: number
  mapId: string | undefined
}

// The outline that shows the fog or vision brush under the pointer. It is placed
// by writing to the element directly, so following the pointer never re-renders.
export function useBrushCursor({ active, mode, fogCanvasRef, brushSize, mapId }: BrushCursorOptions) {
  const brushCursorRef = useRef<HTMLDivElement | null>(null)
  const brushCursorClientRef = useRef<{ x: number; y: number } | null>(null)

  const hideBrushCursor = useCallback(() => {
    brushCursorClientRef.current = null
    hideBrushCursorElement(brushCursorRef.current)
  }, [])

  const updateBrushCursorFromClient = useCallback((clientX: number, clientY: number) => {
    if (!active) {
      hideBrushCursor()
      return
    }
    const canvas = fogCanvasRef.current
    const cursor = brushCursorRef.current
    if (!canvas || !cursor) return
    const geometry = brushCursorGeometry(clientX, clientY, canvas, brushSize)
    if (!geometry) {
      hideBrushCursor()
      return
    }
    placeBrushCursor(cursor, geometry)
    brushCursorClientRef.current = { x: clientX, y: clientY }
    cursor.dataset.visible = 'true'
  }, [active, fogCanvasRef, brushSize, hideBrushCursor])

  useEffect(() => {
    hideBrushCursor()
  }, [mode, hideBrushCursor, mapId])

  useEffect(() => {
    const point = brushCursorClientRef.current
    if (point) updateBrushCursorFromClient(point.x, point.y)
  }, [brushSize, updateBrushCursorFromClient])

  return { brushCursorRef, hideBrushCursor, updateBrushCursorFromClient }
}

export type BrushCursor = ReturnType<typeof useBrushCursor>

type FogBrush = {
  fogDrawing: boolean
  pauseFogStroke: () => void
  handleFogPointerDown: MouseEventHandler<HTMLCanvasElement>
  handleFogPointerMove: MouseEventHandler<HTMLCanvasElement>
  handleFogPointerUp: () => void
  handleFogTouchStart: TouchEventHandler<HTMLCanvasElement>
  handleFogTouchMove: TouchEventHandler<HTMLCanvasElement>
  handleFogTouchEnd: TouchEventHandler<HTMLCanvasElement>
}

type CanvasMouseEvent = MouseEvent<HTMLCanvasElement>

function primaryButtonReleased(event: CanvasMouseEvent) {
  return (event.buttons & 1) !== 1
}

// A stroke in progress ends if its button was released off the canvas, and goes on otherwise.
function continueStroke(fog: FogBrush, event: CanvasMouseEvent) {
  if (primaryButtonReleased(event)) {
    fog.handleFogPointerUp()
    return
  }
  fog.handleFogPointerMove(event)
}

function followFirstTouch(event: TouchEvent<HTMLCanvasElement>, cursor: BrushCursor) {
  const touch = event.touches[0]
  if (touch) cursor.updateBrushCursorFromClient(touch.clientX, touch.clientY)
}

// The fog canvas's pointer handlers: each moves the brush cursor and hands the
// event to the fog brush.
export function brushCanvasHandlers(fog: FogBrush, cursor: BrushCursor) {
  const follow = (event: CanvasMouseEvent) => cursor.updateBrushCursorFromClient(event.clientX, event.clientY)
  return {
    onMouseDown: (event: CanvasMouseEvent) => {
      follow(event)
      fog.handleFogPointerDown(event)
    },
    onMouseMove: (event: CanvasMouseEvent) => {
      follow(event)
      if (fog.fogDrawing) continueStroke(fog, event)
      else fog.handleFogPointerMove(event)
    },
    onMouseEnter: (event: CanvasMouseEvent) => {
      follow(event)
      if (fog.fogDrawing) continueStroke(fog, event)
    },
    onMouseUp: (event: CanvasMouseEvent) => {
      follow(event)
      fog.handleFogPointerUp()
    },
    onMouseLeave: (event: CanvasMouseEvent) => {
      cursor.hideBrushCursor()
      fog.pauseFogStroke()
      if (fog.fogDrawing && primaryButtonReleased(event)) fog.handleFogPointerUp()
    },
    onTouchStart: (event: TouchEvent<HTMLCanvasElement>) => {
      followFirstTouch(event, cursor)
      fog.handleFogTouchStart(event)
    },
    onTouchMove: (event: TouchEvent<HTMLCanvasElement>) => {
      followFirstTouch(event, cursor)
      fog.handleFogTouchMove(event)
    },
    onTouchEnd: (event: TouchEvent<HTMLCanvasElement>) => {
      cursor.hideBrushCursor()
      fog.handleFogTouchEnd(event)
    },
  }
}

export type BrushCanvasHandlers = ReturnType<typeof brushCanvasHandlers>
