import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import { Stage, Layer, Rect, Ellipse, Line, Transformer } from 'react-konva'
import {
  Circle as CircleIcon,
  Eraser,
  Loader2,
  Minus,
  MousePointer2,
  PaintBucket,
  Pencil,
  Slash,
  Square as SquareIcon,
  X,
} from 'lucide-react'
import { BLANK_MAP_HEIGHT, BLANK_MAP_WIDTH } from '../lib/constants'

export type BlankMapSceneResult = {
  sceneJson: string
  blob: Blob
  width: number
  height: number
}

type MapDrawingEditorProps = {
  mapName: string
  // Serialized Konva scene from a previous edit, or '' for a fresh canvas.
  initialSceneJson: string
  backgroundColor: string
  onCancel: () => void
  onSave: (result: BlankMapSceneResult) => Promise<void>
}

type DrawingTool = 'select' | 'pen' | 'line' | 'rect' | 'ellipse' | 'fill' | 'erase'

type BaseShape = { id: string; stroke: string; strokeWidth: number }
type PenShape = BaseShape & { type: 'pen'; points: number[] }
type LineShape = BaseShape & { type: 'line'; points: number[] }
type RectShape = BaseShape & { type: 'rect'; x: number; y: number; width: number; height: number; fill: string }
type EllipseShape = BaseShape & { type: 'ellipse'; x: number; y: number; radiusX: number; radiusY: number; fill: string }
type Shape = PenShape | LineShape | RectShape | EllipseShape

const STROKE_SWATCHES = ['#2c2c2c', '#b42318', '#2e77b5', '#2f7d32', '#d9b96e', '#ffffff']
const FILL_SWATCHES = ['#a5d8ff', '#ffc9c9', '#b2f2bb', '#ffec99', '#d9b96e', '#2c2c2c']
const LINE_WEIGHT_MIN = 1
const LINE_WEIGHT_MAX = 40
const MIN_SHAPE_SIZE = 4

let shapeCounter = 0
const nextId = () => {
  shapeCounter += 1
  return globalThis.crypto?.randomUUID?.() ?? `shape-${Date.now()}-${shapeCounter}`
}

function parseShapes(sceneJson: string): Shape[] {
  if (!sceneJson) return []
  try {
    const parsed = JSON.parse(sceneJson) as { shapes?: unknown }
    if (!Array.isArray(parsed.shapes)) return []
    return parsed.shapes.filter((shape): shape is Shape => {
      if (!shape || typeof shape !== 'object') return false
      const type = (shape as { type?: unknown }).type
      return type === 'pen' || type === 'line' || type === 'rect' || type === 'ellipse'
    })
  } catch {
    return []
  }
}

export function MapDrawingEditor({
  mapName,
  initialSceneJson,
  backgroundColor,
  onCancel,
  onSave,
}: MapDrawingEditorProps) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const isDrawingRef = useRef(false)

  const [shapes, setShapes] = useState<Shape[]>(() => parseShapes(initialSceneJson))
  const [tool, setTool] = useState<DrawingTool>('pen')
  const [strokeColor, setStrokeColor] = useState('#2c2c2c')
  const [fillColor, setFillColor] = useState('#a5d8ff')
  const [lineWeight, setLineWeight] = useState(4)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState({ scale: 1, width: BLANK_MAP_WIDTH, height: BLANK_MAP_HEIGHT })

  // Fit the fixed 1600x1000 logical canvas into the available container.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const fit = () => {
      const rect = container.getBoundingClientRect()
      const pad = 24
      const availW = Math.max(1, rect.width - pad * 2)
      const availH = Math.max(1, rect.height - pad * 2)
      const scale = Math.min(availW / BLANK_MAP_WIDTH, availH / BLANK_MAP_HEIGHT)
      setView({ scale, width: BLANK_MAP_WIDTH * scale, height: BLANK_MAP_HEIGHT * scale })
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Keep the transformer attached to the current selection.
  useEffect(() => {
    const transformer = transformerRef.current
    const stage = stageRef.current
    if (!transformer || !stage) return
    if (tool !== 'select' || !selectedId) {
      transformer.nodes([])
      transformer.getLayer()?.batchDraw()
      return
    }
    const node = stage.findOne(`#${selectedId}`)
    transformer.nodes(node ? [node] : [])
    transformer.getLayer()?.batchDraw()
  }, [selectedId, tool, shapes])

  const pointerPosition = (): { x: number; y: number } | null => {
    const stage = stageRef.current
    if (!stage) return null
    const pos = stage.getRelativePointerPosition()
    return pos ? { x: pos.x, y: pos.y } : null
  }

  const updateShape = useCallback((id: string, patch: Partial<Shape>) => {
    setShapes((prev) => prev.map((shape) => (shape.id === id ? ({ ...shape, ...patch } as Shape) : shape)))
  }, [])

  const applyFill = useCallback((id: string) => {
    setShapes((prev) => prev.map((shape) => {
      if (shape.id !== id) return shape
      if (shape.type !== 'rect' && shape.type !== 'ellipse') return shape
      const cleared = shape.fill === fillColor
      return { ...shape, fill: cleared ? 'transparent' : fillColor }
    }))
  }, [fillColor])

  const handleShapeInteract = useCallback((id: string, shapeType: Shape['type']) => {
    if (tool === 'erase') {
      setShapes((prev) => prev.filter((shape) => shape.id !== id))
      setSelectedId((current) => (current === id ? null : current))
      return
    }
    if (tool === 'fill') {
      if (shapeType === 'rect' || shapeType === 'ellipse') applyFill(id)
      return
    }
    if (tool === 'select') setSelectedId(id)
  }, [applyFill, tool])

  const handleStageMouseDown = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const pos = pointerPosition()
    if (!pos) return
    const clickedEmpty = event.target === event.target.getStage() || event.target.name() === 'background'

    if (tool === 'select') {
      if (clickedEmpty) setSelectedId(null)
      return
    }
    if (tool === 'fill' || tool === 'erase') return

    isDrawingRef.current = true
    setSelectedId(null)
    const id = nextId()
    if (tool === 'pen') {
      setShapes((prev) => [...prev, { id, type: 'pen', points: [pos.x, pos.y], stroke: strokeColor, strokeWidth: lineWeight }])
    } else if (tool === 'line') {
      setShapes((prev) => [...prev, { id, type: 'line', points: [pos.x, pos.y, pos.x, pos.y], stroke: strokeColor, strokeWidth: lineWeight }])
    } else if (tool === 'rect') {
      setShapes((prev) => [...prev, { id, type: 'rect', x: pos.x, y: pos.y, width: 0, height: 0, stroke: strokeColor, strokeWidth: lineWeight, fill: 'transparent' }])
    } else if (tool === 'ellipse') {
      setShapes((prev) => [...prev, { id, type: 'ellipse', x: pos.x, y: pos.y, radiusX: 0, radiusY: 0, stroke: strokeColor, strokeWidth: lineWeight, fill: 'transparent' }])
    }
  }

  const handleStageMouseMove = () => {
    if (!isDrawingRef.current) return
    const pos = pointerPosition()
    if (!pos) return
    setShapes((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      let updated: Shape = last
      if (last.type === 'pen') {
        updated = { ...last, points: [...last.points, pos.x, pos.y] }
      } else if (last.type === 'line') {
        updated = { ...last, points: [last.points[0], last.points[1], pos.x, pos.y] }
      } else if (last.type === 'rect') {
        updated = { ...last, width: pos.x - last.x, height: pos.y - last.y }
      } else if (last.type === 'ellipse') {
        updated = { ...last, radiusX: Math.abs(pos.x - last.x), radiusY: Math.abs(pos.y - last.y) }
      }
      return [...prev.slice(0, -1), updated]
    })
  }

  const handleStageMouseUp = () => {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    // Normalize rect (negative size from dragging up/left) and drop tiny shapes.
    setShapes((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      if (last.type === 'rect') {
        const x = last.width < 0 ? last.x + last.width : last.x
        const y = last.height < 0 ? last.y + last.height : last.y
        const width = Math.abs(last.width)
        const height = Math.abs(last.height)
        if (width < MIN_SHAPE_SIZE && height < MIN_SHAPE_SIZE) return prev.slice(0, -1)
        return [...prev.slice(0, -1), { ...last, x, y, width, height }]
      }
      if (last.type === 'ellipse') {
        if (last.radiusX < MIN_SHAPE_SIZE / 2 && last.radiusY < MIN_SHAPE_SIZE / 2) return prev.slice(0, -1)
      }
      if (last.type === 'line') {
        const [x1, y1, x2, y2] = last.points
        if (Math.hypot(x2 - x1, y2 - y1) < MIN_SHAPE_SIZE) return prev.slice(0, -1)
      }
      if (last.type === 'pen' && last.points.length < 4) return prev.slice(0, -1)
      return prev
    })
  }

  const handleSave = useCallback(async () => {
    const stage = stageRef.current
    if (!stage || saving) return
    setSaving(true)
    setError(null)
    setSelectedId(null)
    try {
      transformerRef.current?.nodes([])
      // Render at the full logical resolution regardless of on-screen fit scale.
      const blob = await stage.toBlob({ pixelRatio: 1 / view.scale, mimeType: 'image/png' }) as Blob
      const sceneJson = JSON.stringify({ shapes, background: backgroundColor })
      await onSave({ sceneJson, blob, width: BLANK_MAP_WIDTH, height: BLANK_MAP_HEIGHT })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the drawing')
      setSaving(false)
    }
  }, [backgroundColor, onSave, saving, shapes, view.scale])

  const initialShapes = useMemo(() => shapes, [shapes])

  const toolButton = (value: DrawingTool, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      className={tool === value ? 'map-konva-tool active' : 'map-konva-tool'}
      onClick={() => { setTool(value); if (value !== 'select') setSelectedId(null) }}
      aria-label={label}
      aria-pressed={tool === value}
      title={label}
    >
      {icon}
    </button>
  )

  return (
    <div className="map-drawing-editor" role="dialog" aria-modal aria-label={`Edit drawing: ${mapName}`}>
      <div className="map-drawing-editor-bar">
        <span className="map-drawing-editor-title">Drawing: {mapName}</span>
        <div className="map-konva-toolbar">
          {toolButton('select', 'Select / move', <MousePointer2 size={16} />)}
          {toolButton('pen', 'Freehand pen', <Pencil size={16} />)}
          {toolButton('line', 'Straight line', <Slash size={16} />)}
          {toolButton('rect', 'Rectangle', <SquareIcon size={16} />)}
          {toolButton('ellipse', 'Ellipse', <CircleIcon size={16} />)}
          {toolButton('fill', 'Fill shape', <PaintBucket size={16} />)}
          {toolButton('erase', 'Delete shape', <Eraser size={16} />)}
        </div>
        <div className="map-konva-colors" aria-label="Stroke color">
          <Pencil size={13} aria-hidden />
          {STROKE_SWATCHES.map((color) => (
            <button
              key={`stroke-${color}`}
              type="button"
              className={strokeColor === color ? 'map-konva-swatch active' : 'map-konva-swatch'}
              style={{ backgroundColor: color }}
              onClick={() => setStrokeColor(color)}
              aria-label={`Stroke ${color}`}
            />
          ))}
          <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} aria-label="Custom stroke color" />
        </div>
        <div className="map-konva-colors" aria-label="Fill color">
          <PaintBucket size={13} aria-hidden />
          {FILL_SWATCHES.map((color) => (
            <button
              key={`fill-${color}`}
              type="button"
              className={fillColor === color ? 'map-konva-swatch active' : 'map-konva-swatch'}
              style={{ backgroundColor: color }}
              onClick={() => setFillColor(color)}
              aria-label={`Fill ${color}`}
            />
          ))}
          <input type="color" value={fillColor} onChange={(e) => setFillColor(e.target.value)} aria-label="Custom fill color" />
        </div>
        <label className="map-konva-weight" title="Line weight">
          <Minus size={14} aria-hidden />
          <input
            type="range"
            min={LINE_WEIGHT_MIN}
            max={LINE_WEIGHT_MAX}
            step={1}
            value={lineWeight}
            onChange={(e) => setLineWeight(Number(e.target.value))}
            aria-label="Line weight"
          />
          <span>{lineWeight}</span>
        </label>
        {error ? <span className="map-drawing-editor-error">{error}</span> : null}
        <div className="map-drawing-editor-actions">
          <button type="button" className="map-drawing-editor-cancel" onClick={onCancel} disabled={saving}>
            <X size={15} />
            Cancel
          </button>
          <button type="button" className="map-drawing-editor-save" onClick={() => void handleSave()} disabled={saving}>
            {saving ? <Loader2 size={15} className="map-icon-spin" /> : null}
            {saving ? 'Saving...' : 'Save & share'}
          </button>
        </div>
      </div>
      <div ref={containerRef} className="map-drawing-editor-canvas map-konva-canvas">
        <Stage
          ref={stageRef}
          width={view.width}
          height={view.height}
          scaleX={view.scale}
          scaleY={view.scale}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
          onTouchStart={handleStageMouseDown}
          onTouchMove={handleStageMouseMove}
          onTouchEnd={handleStageMouseUp}
          style={{ cursor: tool === 'select' ? 'default' : 'crosshair', background: '#ffffff' }}
        >
          <Layer>
            <Rect name="background" x={0} y={0} width={BLANK_MAP_WIDTH} height={BLANK_MAP_HEIGHT} fill={backgroundColor} />
            {initialShapes.map((shape) => {
              const draggable = tool === 'select'
              const common = {
                id: shape.id,
                draggable,
                onMouseDown: () => handleShapeInteract(shape.id, shape.type),
                onTap: () => handleShapeInteract(shape.id, shape.type),
                onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
                  const node = e.target
                  if (shape.type === 'pen' || shape.type === 'line') {
                    const dx = node.x()
                    const dy = node.y()
                    node.position({ x: 0, y: 0 })
                    updateShape(shape.id, { points: shape.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) } as Partial<Shape>)
                  } else {
                    updateShape(shape.id, { x: node.x(), y: node.y() } as Partial<Shape>)
                  }
                },
              }
              if (shape.type === 'pen') {
                return <Line key={shape.id} {...common} points={shape.points} stroke={shape.stroke} strokeWidth={shape.strokeWidth} lineCap="round" lineJoin="round" tension={0.4} hitStrokeWidth={Math.max(12, shape.strokeWidth)} />
              }
              if (shape.type === 'line') {
                return <Line key={shape.id} {...common} points={shape.points} stroke={shape.stroke} strokeWidth={shape.strokeWidth} lineCap="round" hitStrokeWidth={Math.max(12, shape.strokeWidth)} />
              }
              if (shape.type === 'rect') {
                return (
                  <Rect
                    key={shape.id}
                    {...common}
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    stroke={shape.stroke}
                    strokeWidth={shape.strokeWidth}
                    fill={shape.fill === 'transparent' ? undefined : shape.fill}
                    onTransformEnd={(e) => {
                      const node = e.target
                      const sx = node.scaleX()
                      const sy = node.scaleY()
                      node.scaleX(1)
                      node.scaleY(1)
                      updateShape(shape.id, { x: node.x(), y: node.y(), width: Math.max(MIN_SHAPE_SIZE, node.width() * sx), height: Math.max(MIN_SHAPE_SIZE, node.height() * sy) } as Partial<Shape>)
                    }}
                  />
                )
              }
              return (
                <Ellipse
                  key={shape.id}
                  {...common}
                  x={shape.x}
                  y={shape.y}
                  radiusX={shape.radiusX}
                  radiusY={shape.radiusY}
                  stroke={shape.stroke}
                  strokeWidth={shape.strokeWidth}
                  fill={shape.fill === 'transparent' ? undefined : shape.fill}
                  onTransformEnd={(e) => {
                    const node = e.target
                    const sx = node.scaleX()
                    const sy = node.scaleY()
                    node.scaleX(1)
                    node.scaleY(1)
                    updateShape(shape.id, { x: node.x(), y: node.y(), radiusX: Math.max(MIN_SHAPE_SIZE / 2, shape.radiusX * sx), radiusY: Math.max(MIN_SHAPE_SIZE / 2, shape.radiusY * sy) } as Partial<Shape>)
                  }}
                />
              )
            })}
            <Transformer ref={transformerRef} rotateEnabled ignoreStroke keepRatio={false} />
          </Layer>
        </Stage>
      </div>
    </div>
  )
}
