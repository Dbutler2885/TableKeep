import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type Konva from 'konva'
import { Stage, Layer, Rect, Ellipse, Line, Transformer } from 'react-konva'
import {
  Circle as CircleIcon,
  Copy,
  ClipboardPaste,
  Eraser,
  Lasso,
  Loader2,
  Minus,
  MousePointer2,
  PaintBucket,
  Pencil,
  Redo2,
  Slash,
  Square as SquareIcon,
  Stamp as StampIcon,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { BLANK_MAP_HEIGHT, BLANK_MAP_WIDTH } from '../lib/constants'
import { MAP_TEXTURES, isMapTextureId, loadTextureImages, type MapTextureId } from '../lib/mapTextures'

export type BlankMapSceneResult = {
  sceneJson: string
  blob: Blob
  width: number
  height: number
}

type MapDrawingEditorProps = {
  mapName: string
  initialSceneJson: string
  backgroundColor: string
  // Scopes the saved-stamp collection (stored in localStorage) to a campaign.
  stampScopeKey: string
  onCancel: () => void
  onSave: (result: BlankMapSceneResult) => Promise<void>
}

type DrawingTool = 'select' | 'pen' | 'line' | 'rect' | 'ellipse' | 'region' | 'fill' | 'erase'
type FillStyle = { color: string; textureId: MapTextureId | null }

// Every shape carries an (x, y) origin; geometry (points / size / radii) is
// stored relative to it. That makes move, group-move, copy/paste, and stamp
// placement uniform - they only ever translate the origin.
type Base = { id: string; stroke: string; strokeWidth: number; x: number; y: number }
type PenShape = Base & { type: 'pen'; points: number[] }
type LineShape = Base & { type: 'line'; points: number[] }
type RegionShape = Base & { type: 'region'; points: number[]; fill: string; textureId: MapTextureId | null }
type RectShape = Base & { type: 'rect'; width: number; height: number; fill: string; textureId: MapTextureId | null }
type EllipseShape = Base & { type: 'ellipse'; radiusX: number; radiusY: number; fill: string; textureId: MapTextureId | null }
type Shape = PenShape | LineShape | RegionShape | RectShape | EllipseShape

type Stamp = { id: string; name: string; thumb: string; width: number; height: number; shapes: Shape[] }
type HistorySnapshot = { shapes: Shape[]; selectedIds: string[] }

const STROKE_SWATCHES = ['#2c2c2c', '#b42318', '#2e77b5', '#2f7d32', '#d9b96e', '#ffffff']
const FILL_SWATCHES = ['#a5d8ff', '#ffc9c9', '#b2f2bb', '#ffec99', '#d9b96e', '#2c2c2c']
const LINE_WEIGHT_MIN = 1
const LINE_WEIGHT_MAX = 40
const MIN_SHAPE_SIZE = 4
const FILLABLE = new Set<Shape['type']>(['rect', 'ellipse', 'region'])
const PASTE_OFFSET = 28

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

let counter = 0
const nextId = () => {
  counter += 1
  return globalThis.crypto?.randomUUID?.() ?? `shape-${Date.now()}-${counter}`
}

function parseShapes(value: unknown): Shape[] {
  if (!Array.isArray(value)) return []
  return value.filter((shape): shape is Shape => {
    if (!shape || typeof shape !== 'object') return false
    const t = (shape as { type?: unknown }).type
    return t === 'pen' || t === 'line' || t === 'rect' || t === 'ellipse' || t === 'region'
  })
}

function shapeBBox(shape: Shape): { x: number; y: number; width: number; height: number } {
  if (shape.type === 'rect') {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height }
  }
  if (shape.type === 'ellipse') {
    return { x: shape.x - shape.radiusX, y: shape.y - shape.radiusY, width: shape.radiusX * 2, height: shape.radiusY * 2 }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < shape.points.length; i += 2) {
    minX = Math.min(minX, shape.points[i])
    maxX = Math.max(maxX, shape.points[i])
    minY = Math.min(minY, shape.points[i + 1])
    maxY = Math.max(maxY, shape.points[i + 1])
  }
  return { x: shape.x + minX, y: shape.y + minY, width: maxX - minX, height: maxY - minY }
}

function unionBBox(shapes: Shape[]) {
  const boxes = shapes.map(shapeBBox)
  const x = Math.min(...boxes.map((b) => b.x))
  const y = Math.min(...boxes.map((b) => b.y))
  const right = Math.max(...boxes.map((b) => b.x + b.width))
  const bottom = Math.max(...boxes.map((b) => b.y + b.height))
  return { x, y, width: right - x, height: bottom - y }
}

function cloneShapes(shapes: Shape[], dx: number, dy: number): Shape[] {
  return shapes.map((shape) => ({ ...shape, id: nextId(), x: shape.x + dx, y: shape.y + dy }))
}

export function MapDrawingEditor({
  mapName,
  initialSceneJson,
  backgroundColor,
  stampScopeKey,
  onCancel,
  onSave,
}: MapDrawingEditorProps) {
  const stageRef = useRef<Konva.Stage | null>(null)
  const transformerRef = useRef<Konva.Transformer | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const isDrawingRef = useRef(false)
  const groupDragRef = useRef<Map<string, { x: number; y: number }> | null>(null)
  const marqueeStartRef = useRef<{ x: number; y: number; shift: boolean } | null>(null)
  const pasteCountRef = useRef(0)
  const stampsKey = `mapDrawingStamps:${stampScopeKey}`

  const [shapes, setShapesState] = useState<Shape[]>(() => {
    try {
      return parseShapes((JSON.parse(initialSceneJson || '{}') as { shapes?: unknown }).shapes)
    } catch {
      return []
    }
  })
  // shapesRef mirrors shapes synchronously so mutations can read the latest state
  // without async setState lag; past/future drive undo/redo.
  const shapesRef = useRef<Shape[]>(shapes)
  const pastRef = useRef<HistorySnapshot[]>([])
  const futureRef = useRef<HistorySnapshot[]>([])
  const drawingStartSnapshotRef = useRef<HistorySnapshot | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [tool, setTool] = useState<DrawingTool>('region')
  const [strokeColor, setStrokeColor] = useState('#2c2c2c')
  const [fill, setFill] = useState<FillStyle>({ color: '#a5d8ff', textureId: 'trees' })
  const [lineWeight, setLineWeight] = useState(4)
  const [selectedIds, setSelectedIdsState] = useState<string[]>([])
  const selectedIdsRef = useRef<string[]>(selectedIds)
  const [clipboard, setClipboard] = useState<Shape[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [textures, setTextures] = useState<Map<MapTextureId, HTMLImageElement>>(new Map())
  const [view, setView] = useState({ scale: 1, width: BLANK_MAP_WIDTH, height: BLANK_MAP_HEIGHT })
  const [stamps, setStamps] = useState<Stamp[]>(() => {
    try {
      const raw = localStorage.getItem(`mapDrawingStamps:${stampScopeKey}`)
      return raw ? (JSON.parse(raw) as Stamp[]) : []
    } catch {
      return []
    }
  })
  const [placingStamp, setPlacingStamp] = useState<Stamp | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number } | null>(null)
  const marqueeRef = useRef<typeof marquee>(null)

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const setSelectedIds = useCallback((next: string[] | ((prev: string[]) => string[])) => {
    const value = typeof next === 'function' ? next(selectedIdsRef.current) : next
    selectedIdsRef.current = value
    setSelectedIdsState(value)
  }, [])

  const updateMarquee = useCallback((next: typeof marquee) => {
    marqueeRef.current = next
    setMarquee(next)
  }, [])

  useEffect(() => {
    let active = true
    void loadTextureImages().then((images) => {
      if (!active) return
      setTextures(new Map(images))
    })
    return () => { active = false }
  }, [])

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

  // Attach the transformer to the selection. Resize/rotate handles only show for
  // box shapes; a mixed or multi selection just shows the bounding outline.
  useEffect(() => {
    const transformer = transformerRef.current
    const stage = stageRef.current
    if (!transformer || !stage) return
    const selected = shapes.filter((shape) => selectedSet.has(shape.id))
    if (tool !== 'select' || selected.length === 0) {
      transformer.nodes([])
      transformer.getLayer()?.batchDraw()
      return
    }
    const nodes = selected.map((shape) => stage.findOne(`#${shape.id}`)).filter(Boolean) as Konva.Node[]
    const allBox = selected.every((shape) => shape.type === 'rect' || shape.type === 'ellipse')
    transformer.resizeEnabled(allBox)
    transformer.rotateEnabled(allBox && selected.length === 1)
    transformer.nodes(nodes)
    transformer.getLayer()?.batchDraw()
  }, [selectedIds, selectedSet, tool, shapes])

  const pointerFromEvent = useCallback((event?: MouseEvent | TouchEvent): { x: number; y: number } | null => {
    if (!event) {
      const pos = stageRef.current?.getRelativePointerPosition()
      return pos ? { x: clamp(pos.x, 0, BLANK_MAP_WIDTH), y: clamp(pos.y, 0, BLANK_MAP_HEIGHT) } : null
    }
    const stage = stageRef.current
    if (!stage) return null
    const source = 'touches' in event ? event.touches[0] ?? event.changedTouches[0] : event
    if (!source) return null
    const rect = stage.container().getBoundingClientRect()
    return {
      x: clamp((source.clientX - rect.left) / view.scale, 0, BLANK_MAP_WIDTH),
      y: clamp((source.clientY - rect.top) / view.scale, 0, BLANK_MAP_HEIGHT),
    }
  }, [view.scale])

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0)
    setCanRedo(futureRef.current.length > 0)
  }, [])

  const applyShapes = useCallback((next: Shape[], options: { record?: boolean; previous?: Shape[]; previousSelectedIds?: string[]; nextSelectedIds?: string[] } = {}) => {
    const previous = options.previous ?? shapesRef.current
    if (options.record && next !== previous) {
      pastRef.current.push({ shapes: previous, selectedIds: options.previousSelectedIds ?? selectedIdsRef.current })
      if (pastRef.current.length > 80) pastRef.current.shift()
      futureRef.current = []
    }
    shapesRef.current = next
    setShapesState(next)
    if (options.nextSelectedIds) setSelectedIds(options.nextSelectedIds)
    syncHistoryFlags()
  }, [setSelectedIds, syncHistoryFlags])

  const mutate = useCallback((producer: (shapes: Shape[]) => Shape[], options: boolean | { record?: boolean; nextSelectedIds?: string[] } = true) => {
    const record = typeof options === 'boolean' ? options : options.record ?? true
    const previous = shapesRef.current
    applyShapes(producer(previous), {
      record,
      previous,
      nextSelectedIds: typeof options === 'boolean' ? undefined : options.nextSelectedIds,
    })
  }, [applyShapes])

  const updateShape = useCallback((id: string, patch: Partial<Shape>) => {
    mutate((prev) => prev.map((shape) => (shape.id === id ? ({ ...shape, ...patch } as Shape) : shape)))
  }, [mutate])

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return
    const prev = pastRef.current.pop() as HistorySnapshot
    futureRef.current.push({ shapes: shapesRef.current, selectedIds: selectedIdsRef.current })
    transformerRef.current?.nodes([])
    shapesRef.current = prev.shapes
    setShapesState(prev.shapes)
    setSelectedIds(prev.selectedIds)
    syncHistoryFlags()
  }, [setSelectedIds, syncHistoryFlags])

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return
    const next = futureRef.current.pop() as HistorySnapshot
    pastRef.current.push({ shapes: shapesRef.current, selectedIds: selectedIdsRef.current })
    transformerRef.current?.nodes([])
    shapesRef.current = next.shapes
    setShapesState(next.shapes)
    setSelectedIds(next.selectedIds)
    syncHistoryFlags()
  }, [setSelectedIds, syncHistoryFlags])

  const applyFill = useCallback((id: string) => {
    mutate((prev) => prev.map((shape) => {
      if (shape.id !== id || !FILLABLE.has(shape.type)) return shape
      const filled = shape as RectShape | EllipseShape | RegionShape
      const sameSolid = !fill.textureId && filled.textureId === null && filled.fill === fill.color
      if (sameSolid) return { ...filled, fill: 'transparent' } as Shape
      return { ...filled, fill: fill.color, textureId: fill.textureId } as Shape
    }))
  }, [fill, mutate])

  const deleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return
    mutate((prev) => prev.filter((shape) => !selectedSet.has(shape.id)), { nextSelectedIds: [] })
  }, [mutate, selectedIds, selectedSet])

  const copySelection = useCallback(() => {
    if (selectedIds.length === 0) return
    setClipboard(shapes.filter((shape) => selectedSet.has(shape.id)))
    pasteCountRef.current = 0
  }, [selectedIds, selectedSet, shapes])

  const pasteClipboard = useCallback(() => {
    if (clipboard.length === 0) return
    pasteCountRef.current += 1
    const offset = PASTE_OFFSET * pasteCountRef.current
    const copies = cloneShapes(clipboard, offset, offset)
    mutate((prev) => [...prev, ...copies], { nextSelectedIds: copies.map((shape) => shape.id) })
    setTool('select')
  }, [clipboard, mutate])

  const duplicateSelection = useCallback(() => {
    if (selectedIds.length === 0) return
    const copies = cloneShapes(shapes.filter((shape) => selectedSet.has(shape.id)), PASTE_OFFSET, PASTE_OFFSET)
    mutate((prev) => [...prev, ...copies], { nextSelectedIds: copies.map((shape) => shape.id) })
    setTool('select')
  }, [selectedIds, selectedSet, shapes, mutate])

  // Keyboard: copy/paste/duplicate/delete/deselect, ignoring form fields.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
      else if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redo() }
      else if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelection() }
      else if (mod && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteClipboard() }
      else if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection() }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection() }
      else if (event.key === 'Escape') { setSelectedIds([]); setPlacingStamp(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [copySelection, deleteSelection, duplicateSelection, pasteClipboard, redo, undo])

  const placeStampAt = useCallback((stamp: Stamp, cx: number, cy: number) => {
    const copies = stamp.shapes.map((shape) => ({ ...shape, id: nextId(), x: shape.x + cx - stamp.width / 2, y: shape.y + cy - stamp.height / 2 }))
    mutate((prev) => [...prev, ...copies], { nextSelectedIds: copies.map((shape) => shape.id) })
    setTool('select')
  }, [mutate])

  const handleShapeInteract = useCallback((id: string, type: Shape['type'], shiftKey: boolean) => {
    if (tool === 'erase') {
      mutate((prev) => prev.filter((shape) => shape.id !== id), { nextSelectedIds: selectedIdsRef.current.filter((sid) => sid !== id) })
      return
    }
    if (tool === 'fill') {
      if (FILLABLE.has(type)) applyFill(id)
      return
    }
    if (tool === 'select') {
      setSelectedIds((prev) => {
        if (shiftKey) return prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
        return prev.includes(id) && prev.length === 1 ? prev : [id]
      })
    }
  }, [applyFill, mutate, tool])

  const handlePointerMove = useCallback((pos: { x: number; y: number }) => {
    if (marqueeStartRef.current) {
      const start = marqueeStartRef.current
      updateMarquee({ x: Math.min(start.x, pos.x), y: Math.min(start.y, pos.y), width: Math.abs(pos.x - start.x), height: Math.abs(pos.y - start.y) })
      return
    }
    if (!isDrawingRef.current) return
    mutate((prev) => {
      if (prev.length === 0) return prev
      const last = prev[prev.length - 1]
      const rx = pos.x - last.x
      const ry = pos.y - last.y
      let updated: Shape = last
      if (last.type === 'pen' || last.type === 'region') updated = { ...last, points: [...last.points, rx, ry] }
      else if (last.type === 'line') updated = { ...last, points: [0, 0, rx, ry] }
      else if (last.type === 'rect') updated = { ...last, width: rx, height: ry }
      else if (last.type === 'ellipse') updated = { ...last, radiusX: Math.abs(rx), radiusY: Math.abs(ry) }
      return [...prev.slice(0, -1), updated]
    }, false)
  }, [mutate, updateMarquee])

  const handlePointerUp = useCallback(() => {
    if (marqueeStartRef.current) {
      const box = marqueeRef.current
      const shift = marqueeStartRef.current.shift
      marqueeStartRef.current = null
      updateMarquee(null)
      if (box && (box.width > 3 || box.height > 3)) {
        const hits = shapesRef.current.filter((shape) => {
          const b = shapeBBox(shape)
          return b.x < box.x + box.width && b.x + b.width > box.x && b.y < box.y + box.height && b.y + b.height > box.y
        }).map((shape) => shape.id)
        setSelectedIds((prev) => (shift ? Array.from(new Set([...prev, ...hits])) : hits))
      } else if (!shift) {
        setSelectedIds([])
      }
      return
    }
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    const previousSnapshot = drawingStartSnapshotRef.current
    drawingStartSnapshotRef.current = null
    const previous = previousSnapshot?.shapes
    const current = shapesRef.current
    const discardDraft = () => previous ?? current.slice(0, -1)
    let next = current
    if (current.length > 0) {
      const last = current[current.length - 1]
      if (last.type === 'rect') {
        const x = last.width < 0 ? last.x + last.width : last.x
        const y = last.height < 0 ? last.y + last.height : last.y
        const width = Math.abs(last.width)
        const height = Math.abs(last.height)
        next = width < MIN_SHAPE_SIZE && height < MIN_SHAPE_SIZE
          ? discardDraft()
          : [...current.slice(0, -1), { ...last, x, y, width, height }]
      } else if (last.type === 'ellipse' && last.radiusX < MIN_SHAPE_SIZE / 2 && last.radiusY < MIN_SHAPE_SIZE / 2) {
        next = discardDraft()
      } else if (last.type === 'line') {
        const [, , x2, y2] = last.points
        if (Math.hypot(x2, y2) < MIN_SHAPE_SIZE) next = discardDraft()
      } else if ((last.type === 'pen' || last.type === 'region') && last.points.length < 6) {
        next = discardDraft()
      }
    }
    applyShapes(next, {
      record: Boolean(previous && next !== previous),
      previous: previous ?? current,
      previousSelectedIds: previousSnapshot?.selectedIds,
    })
  }, [applyShapes, setSelectedIds, updateMarquee])

  useEffect(() => {
    const isActive = () => isDrawingRef.current || marqueeStartRef.current !== null
    const onMove = (event: MouseEvent | TouchEvent) => {
      if (!isActive()) return
      const pos = pointerFromEvent(event)
      if (!pos) return
      event.preventDefault()
      handlePointerMove(pos)
    }
    const onUp = (event: MouseEvent | TouchEvent) => {
      if (!isActive()) return
      const pos = pointerFromEvent(event)
      if (pos) handlePointerMove(pos)
      event.preventDefault()
      handlePointerUp()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    window.addEventListener('touchcancel', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
      window.removeEventListener('touchcancel', onUp)
    }
  }, [handlePointerMove, handlePointerUp, pointerFromEvent])

  const handleStageMouseDown = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const pos = pointerFromEvent(event.evt)
    if (!pos) return
    if (placingStamp) { placeStampAt(placingStamp, pos.x, pos.y); return }
    const clickedEmpty = event.target === event.target.getStage() || event.target.name() === 'background'

    if (tool === 'select') {
      if (clickedEmpty) {
        marqueeStartRef.current = { x: pos.x, y: pos.y, shift: (event.evt as MouseEvent).shiftKey === true }
        updateMarquee({ x: pos.x, y: pos.y, width: 0, height: 0 })
      }
      return
    }
    if (tool === 'fill' || tool === 'erase') return

    isDrawingRef.current = true
    drawingStartSnapshotRef.current = { shapes: shapesRef.current, selectedIds: selectedIdsRef.current }
    setSelectedIds([])
    const id = nextId()
    const base = { id, stroke: strokeColor, strokeWidth: lineWeight, x: pos.x, y: pos.y }
    if (tool === 'pen') mutate((prev) => [...prev, { ...base, type: 'pen', points: [0, 0] }], false)
    else if (tool === 'region') mutate((prev) => [...prev, { ...base, type: 'region', points: [0, 0], fill: fill.color, textureId: fill.textureId }], false)
    else if (tool === 'line') mutate((prev) => [...prev, { ...base, type: 'line', points: [0, 0, 0, 0] }], false)
    else if (tool === 'rect') mutate((prev) => [...prev, { ...base, type: 'rect', width: 0, height: 0, fill: 'transparent', textureId: null }], false)
    else if (tool === 'ellipse') mutate((prev) => [...prev, { ...base, type: 'ellipse', radiusX: 0, radiusY: 0, fill: 'transparent', textureId: null }], false)
  }

  const handleSave = useCallback(async () => {
    const stage = stageRef.current
    if (!stage || saving) return
    setSaving(true)
    setError(null)
    setSelectedIds([])
    try {
      transformerRef.current?.nodes([])
      const blob = await stage.toBlob({ pixelRatio: 1 / view.scale, mimeType: 'image/png' }) as Blob
      const sceneJson = JSON.stringify({ shapes, background: backgroundColor })
      await onSave({ sceneJson, blob, width: BLANK_MAP_WIDTH, height: BLANK_MAP_HEIGHT })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the drawing')
      setSaving(false)
    }
  }, [backgroundColor, onSave, saving, shapes, view.scale])

  const persistStamps = (next: Stamp[]) => {
    setStamps(next)
    try { localStorage.setItem(stampsKey, JSON.stringify(next)) } catch { /* storage full / disabled */ }
  }

  const saveSelectionAsStamp = () => {
    const stage = stageRef.current
    const selected = shapes.filter((shape) => selectedSet.has(shape.id))
    if (!stage || selected.length === 0) return
    const box = unionBBox(selected)
    const thumb = stage.toDataURL({
      x: box.x * view.scale,
      y: box.y * view.scale,
      width: Math.max(1, box.width * view.scale),
      height: Math.max(1, box.height * view.scale),
      pixelRatio: Math.min(2, 120 / Math.max(box.width, box.height, 1)),
    })
    const normalized = selected.map((shape) => ({ ...shape, id: nextId(), x: shape.x - box.x, y: shape.y - box.y }))
    persistStamps([
      ...stamps,
      { id: nextId(), name: `Stamp ${stamps.length + 1}`, thumb, width: box.width, height: box.height, shapes: normalized },
    ])
  }

  const fillProps = (shape: RectShape | EllipseShape | RegionShape) => {
    if (shape.textureId && isMapTextureId(shape.textureId)) {
      const image = textures.get(shape.textureId)
      if (image) return { fillPriority: 'pattern' as const, fillPatternImage: image, fillPatternRepeat: 'repeat' as const }
    }
    return { fill: shape.fill === 'transparent' ? undefined : shape.fill }
  }

  const dragHandlers = (shape: Shape) => ({
    onDragStart: () => {
      if (selectedSet.has(shape.id) && selectedIds.length > 1) {
        const origins = new Map<string, { x: number; y: number }>()
        shapes.forEach((other) => { if (selectedSet.has(other.id)) origins.set(other.id, { x: other.x, y: other.y }) })
        groupDragRef.current = origins
      } else {
        groupDragRef.current = null
        if (!selectedSet.has(shape.id)) setSelectedIds([shape.id])
      }
    },
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      const origins = groupDragRef.current
      if (!origins) return
      const stage = stageRef.current
      const self = origins.get(shape.id)
      if (!stage || !self) return
      const dx = e.target.x() - self.x
      const dy = e.target.y() - self.y
      origins.forEach((origin, id) => {
        if (id === shape.id) return
        const node = stage.findOne(`#${id}`)
        node?.position({ x: origin.x + dx, y: origin.y + dy })
      })
      stage.batchDraw()
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      const origins = groupDragRef.current
      if (origins) {
        const self = origins.get(shape.id)
        const dx = self ? e.target.x() - self.x : 0
        const dy = self ? e.target.y() - self.y : 0
        mutate((prev) => prev.map((s) => (origins.has(s.id) ? ({ ...s, x: (origins.get(s.id)?.x ?? s.x) + dx, y: (origins.get(s.id)?.y ?? s.y) + dy } as Shape) : s)))
        groupDragRef.current = null
      } else {
        updateShape(shape.id, { x: e.target.x(), y: e.target.y() } as Partial<Shape>)
      }
    },
  })

  const toolButton = (value: DrawingTool, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      className={tool === value ? 'map-konva-tool active' : 'map-konva-tool'}
      onClick={() => { setTool(value); setPlacingStamp(null); if (value !== 'select') setSelectedIds([]) }}
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
          {toolButton('select', 'Select / move', <MousePointer2 size={20} />)}
          {toolButton('region', 'Freehand area (fillable)', <Lasso size={20} />)}
          {toolButton('pen', 'Freehand pen', <Pencil size={20} />)}
          {toolButton('line', 'Straight line', <Slash size={20} />)}
          {toolButton('rect', 'Rectangle', <SquareIcon size={20} />)}
          {toolButton('ellipse', 'Ellipse', <CircleIcon size={20} />)}
          {toolButton('fill', 'Fill shape / area', <PaintBucket size={20} />)}
          {toolButton('erase', 'Delete shape', <Eraser size={20} />)}
        </div>
        <div className="map-konva-actions">
          <button type="button" className="map-konva-tool" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Cmd/Ctrl+Z)"><Undo2 size={18} /></button>
          <button type="button" className="map-konva-tool" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y)"><Redo2 size={18} /></button>
          <button type="button" className="map-konva-tool" onClick={duplicateSelection} disabled={selectedIds.length === 0} aria-label="Duplicate selection" title="Duplicate (Cmd/Ctrl+D)"><Copy size={18} /></button>
          <button type="button" className="map-konva-tool" onClick={pasteClipboard} disabled={clipboard.length === 0} aria-label="Paste" title="Paste (Cmd/Ctrl+V)"><ClipboardPaste size={18} /></button>
          <button type="button" className="map-konva-tool" onClick={saveSelectionAsStamp} disabled={selectedIds.length === 0} aria-label="Save selection as stamp" title="Save selection as stamp"><StampIcon size={18} /></button>
        </div>
        <div className="map-konva-colors" aria-label="Stroke color">
          <Pencil size={13} aria-hidden />
          {STROKE_SWATCHES.map((color) => (
            <button key={`stroke-${color}`} type="button" className={strokeColor === color ? 'map-konva-swatch active' : 'map-konva-swatch'} style={{ backgroundColor: color }} onClick={() => setStrokeColor(color)} aria-label={`Stroke ${color}`} />
          ))}
          <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} aria-label="Custom stroke color" />
        </div>
        <div className="map-konva-colors map-konva-fills" aria-label="Fill">
          <PaintBucket size={13} aria-hidden />
          {FILL_SWATCHES.map((color) => (
            <button key={`fill-${color}`} type="button" className={!fill.textureId && fill.color === color ? 'map-konva-swatch active' : 'map-konva-swatch'} style={{ backgroundColor: color }} onClick={() => setFill({ color, textureId: null })} aria-label={`Fill ${color}`} />
          ))}
          <input type="color" value={fill.color} onChange={(e) => setFill({ color: e.target.value, textureId: null })} aria-label="Custom fill color" />
          <span className="map-konva-fill-divider" aria-hidden />
          {MAP_TEXTURES.map((texture) => (
            <button key={texture.id} type="button" className={fill.textureId === texture.id ? 'map-konva-texture active' : 'map-konva-texture'} style={{ backgroundImage: `url(${textures.get(texture.id)?.src ?? ''})`, backgroundColor: texture.swatch }} onClick={() => setFill((prev) => ({ color: prev.color, textureId: texture.id }))} aria-label={`Fill texture: ${texture.label}`} title={`${texture.label} texture`} />
          ))}
        </div>
        <label className="map-konva-weight" title="Line weight">
          <Minus size={14} aria-hidden />
          <input type="range" min={LINE_WEIGHT_MIN} max={LINE_WEIGHT_MAX} step={1} value={lineWeight} onChange={(e) => setLineWeight(Number(e.target.value))} aria-label="Line weight" />
          <span>{lineWeight}</span>
        </label>
        {error ? <span className="map-drawing-editor-error">{error}</span> : null}
        <div className="map-drawing-editor-actions">
          <button type="button" className="map-drawing-editor-cancel" onClick={onCancel} disabled={saving}><X size={15} />Cancel</button>
          <button type="button" className="map-drawing-editor-save" onClick={() => void handleSave()} disabled={saving}>{saving ? <Loader2 size={15} className="map-icon-spin" /> : null}{saving ? 'Saving...' : 'Save & share'}</button>
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
          onTouchStart={handleStageMouseDown}
          style={{ cursor: placingStamp ? 'copy' : tool === 'select' ? 'default' : 'crosshair', background: '#ffffff' }}
        >
          <Layer>
            <Rect name="background" x={0} y={0} width={BLANK_MAP_WIDTH} height={BLANK_MAP_HEIGHT} fill={backgroundColor} />
            {shapes.map((shape) => {
              const draggable = tool === 'select'
              const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => handleShapeInteract(shape.id, shape.type, e.evt.shiftKey)
              const onTap = () => handleShapeInteract(shape.id, shape.type, false)
              const common = { id: shape.id, draggable, onMouseDown, onTap, ...dragHandlers(shape) }
              if (shape.type === 'pen') return <Line key={shape.id} {...common} x={shape.x} y={shape.y} points={shape.points} stroke={shape.stroke} strokeWidth={shape.strokeWidth} lineCap="round" lineJoin="round" tension={0.4} hitStrokeWidth={Math.max(12, shape.strokeWidth)} />
              if (shape.type === 'line') return <Line key={shape.id} {...common} x={shape.x} y={shape.y} points={shape.points} stroke={shape.stroke} strokeWidth={shape.strokeWidth} lineCap="round" hitStrokeWidth={Math.max(12, shape.strokeWidth)} />
              if (shape.type === 'region') return <Line key={shape.id} {...common} x={shape.x} y={shape.y} points={shape.points} closed stroke={shape.stroke} strokeWidth={shape.strokeWidth} lineCap="round" lineJoin="round" tension={0.3} {...fillProps(shape)} />
              if (shape.type === 'rect') return (
                <Rect key={shape.id} {...common} x={shape.x} y={shape.y} width={shape.width} height={shape.height} stroke={shape.stroke} strokeWidth={shape.strokeWidth} {...fillProps(shape)}
                  onTransformEnd={(e) => { const n = e.target; const sx = n.scaleX(); const sy = n.scaleY(); n.scaleX(1); n.scaleY(1); updateShape(shape.id, { x: n.x(), y: n.y(), width: Math.max(MIN_SHAPE_SIZE, n.width() * sx), height: Math.max(MIN_SHAPE_SIZE, n.height() * sy) } as Partial<Shape>) }} />
              )
              return (
                <Ellipse key={shape.id} {...common} x={shape.x} y={shape.y} radiusX={shape.radiusX} radiusY={shape.radiusY} stroke={shape.stroke} strokeWidth={shape.strokeWidth} {...fillProps(shape)}
                  onTransformEnd={(e) => { const n = e.target; const sx = n.scaleX(); const sy = n.scaleY(); n.scaleX(1); n.scaleY(1); updateShape(shape.id, { x: n.x(), y: n.y(), radiusX: Math.max(MIN_SHAPE_SIZE / 2, shape.radiusX * sx), radiusY: Math.max(MIN_SHAPE_SIZE / 2, shape.radiusY * sy) } as Partial<Shape>) }} />
              )
            })}
            {marquee ? (
              <Rect
                x={marquee.x}
                y={marquee.y}
                width={marquee.width}
                height={marquee.height}
                fill="rgba(46, 119, 181, 0.12)"
                stroke="#2e77b5"
                strokeWidth={1 / view.scale}
                dash={[6 / view.scale, 4 / view.scale]}
                listening={false}
              />
            ) : null}
            <Transformer ref={transformerRef} ignoreStroke keepRatio={false} />
          </Layer>
        </Stage>
      </div>
      <div className="map-konva-stamps">
        <span className="map-konva-stamps-label"><StampIcon size={14} /> Stamps</span>
        {stamps.length === 0 ? (
          <span className="map-konva-stamps-hint">Select shapes, then "Save selection as stamp" to build a reusable collection.</span>
        ) : null}
        {stamps.map((stamp) => (
          <div key={stamp.id} className={placingStamp?.id === stamp.id ? 'map-konva-stamp active' : 'map-konva-stamp'}>
            <button type="button" className="map-konva-stamp-place" onClick={() => setPlacingStamp((prev) => (prev?.id === stamp.id ? null : stamp))} title={`Place ${stamp.name}`}>
              <img src={stamp.thumb} alt={stamp.name} />
            </button>
            <button type="button" className="map-konva-stamp-delete" onClick={() => persistStamps(stamps.filter((s) => s.id !== stamp.id))} aria-label={`Delete ${stamp.name}`} title="Delete stamp"><Trash2 size={12} /></button>
          </div>
        ))}
        {placingStamp ? <span className="map-konva-stamps-hint">Click the map to place "{placingStamp.name}". Esc to stop.</span> : null}
      </div>
    </div>
  )
}
