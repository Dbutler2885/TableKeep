import { Paintbrush } from 'lucide-react'
import { useState, type ChangeEventHandler, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import {
  BRUSH_PREVIEW_BOX_SIZE,
  BRUSH_PREVIEW_DOT_MAX,
  BRUSH_PREVIEW_DOT_MIN,
  BRUSH_SIZE_MAX,
  BRUSH_SIZE_MIN,
} from '../lib/constants'

export function BrushSizeControl({ fogBrushSize, setFogBrushSize }: {
  fogBrushSize: number
  setFogBrushSize: (size: number) => void
}) {
  const [brushSizeDraft, setBrushSizeDraft] = useState(String(fogBrushSize))
  const [brushSizeEditing, setBrushSizeEditing] = useState(false)
  const brushSizeInputValue = brushSizeEditing ? brushSizeDraft : String(fogBrushSize)
  const brushPct = (fogBrushSize - BRUSH_SIZE_MIN) / (BRUSH_SIZE_MAX - BRUSH_SIZE_MIN)
  const brushPreviewDotDiameter = Math.round(BRUSH_PREVIEW_DOT_MIN + brushPct * (BRUSH_PREVIEW_DOT_MAX - BRUSH_PREVIEW_DOT_MIN))
  const setBrushFromPointer = (rail: DOMRect, clientY: number) => {
    const pct = Math.max(0, Math.min(1, (rail.bottom - clientY) / rail.height))
    setFogBrushSize(Math.round(BRUSH_SIZE_MIN + pct * (BRUSH_SIZE_MAX - BRUSH_SIZE_MIN)))
  }
  const handleBrushSliderPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const target = event.currentTarget
    const rail = target.getBoundingClientRect()
    target.setPointerCapture(event.pointerId)
    setBrushFromPointer(rail, event.clientY)
    const move = (nextEvent: PointerEvent) => setBrushFromPointer(rail, nextEvent.clientY)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const handleBrushSliderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 1
    if (event.key === 'ArrowUp' || event.key === 'ArrowRight') {
      event.preventDefault()
      setFogBrushSize(Math.min(BRUSH_SIZE_MAX, fogBrushSize + step))
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') {
      event.preventDefault()
      setFogBrushSize(Math.max(BRUSH_SIZE_MIN, fogBrushSize - step))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setFogBrushSize(BRUSH_SIZE_MIN)
    } else if (event.key === 'End') {
      event.preventDefault()
      setFogBrushSize(BRUSH_SIZE_MAX)
    }
  }
  const commitBrushSizeDraft = () => {
    setBrushSizeEditing(false)
    const parsed = Number.parseInt(brushSizeDraft, 10)
    if (!Number.isFinite(parsed)) {
      setBrushSizeDraft(String(fogBrushSize))
      return
    }
    const next = Math.max(BRUSH_SIZE_MIN, Math.min(BRUSH_SIZE_MAX, parsed))
    setFogBrushSize(next)
    setBrushSizeDraft(String(next))
  }
  const handleBrushSizeInputChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const nextValue = event.target.value
    if (/^\d*$/.test(nextValue)) setBrushSizeDraft(nextValue)
  }

  return <div className="map-tools-brush">
    <span className="map-section-label">Brush size</span>
    <div className="map-brush-size-control">
      <div className="map-brush-size-preview" style={{ width: `${BRUSH_PREVIEW_BOX_SIZE}px`, height: `${BRUSH_PREVIEW_BOX_SIZE}px` }} aria-hidden>
        <span className="map-brush-size-dot" style={{ width: `${brushPreviewDotDiameter}px`, height: `${brushPreviewDotDiameter}px` }} />
      </div>
      <div className="map-brush-size-slider" role="slider" tabIndex={0} aria-label="Brush size" aria-valuemin={BRUSH_SIZE_MIN} aria-valuemax={BRUSH_SIZE_MAX} aria-valuenow={fogBrushSize} onPointerDown={handleBrushSliderPointerDown} onKeyDown={handleBrushSliderKeyDown}>
        <div className="map-brush-size-rail"><div className="map-brush-size-fill" style={{ height: `${brushPct * 100}%` }} /></div>
        <div className="map-brush-size-thumb" style={{ bottom: `calc((100% - var(--thumb-size)) * ${brushPct})` }} />
      </div>
      <div className="map-brush-control-inline" aria-label="Brush size value" onPointerDownCapture={(event) => event.stopPropagation()} onMouseDownCapture={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <span className="map-brush-control-icon" aria-hidden><Paintbrush size={14} /></span>
        <input className="map-brush-control-number" type="text" inputMode="numeric" pattern="[0-9]*" value={brushSizeInputValue} onChange={handleBrushSizeInputChange} onFocus={() => { setBrushSizeDraft(String(fogBrushSize)); setBrushSizeEditing(true) }} onBlur={commitBrushSizeDraft} onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'e' || event.key === 'E' || event.key === '+' || event.key === '-' || event.key === '.') { event.preventDefault(); return }
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
        }} aria-label="Brush size number" />
      </div>
    </div>
  </div>
}
