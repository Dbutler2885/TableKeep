import { useEffect, useRef, useState } from 'react'
import { Flag, Trash2, X } from 'lucide-react'
import type { AnnotationRecord } from '../lib/types'

type AnnotationLayerProps = {
  annotations: AnnotationRecord[]
  activeAnnotationId: string
  activeAnnotationDraft: string
  setActiveAnnotationId: (id: string) => void
  setActiveAnnotationDraft: (value: string) => void
  onCommitActiveAnnotation: () => Promise<void>
  onDeleteAnnotation: (annotationId: string) => Promise<void>
  onToggleAnnotationHidden: (annotationId: string) => Promise<void>
  onToggleAnnotationPointerDirection: (annotationId: string) => Promise<void>
  onMoveAnnotation: (annotationId: string, x: number, y: number) => void
  onPersistAnnotationPosition: (annotationId: string, x: number, y: number) => Promise<void>
  autosizeAnnotationTextarea: (textarea: HTMLTextAreaElement | null) => void
  editable?: boolean
}

export function AnnotationLayer({
  annotations,
  activeAnnotationId,
  activeAnnotationDraft,
  setActiveAnnotationId,
  setActiveAnnotationDraft,
  onCommitActiveAnnotation,
  onDeleteAnnotation,
  onToggleAnnotationHidden,
  onToggleAnnotationPointerDirection,
  onMoveAnnotation,
  onPersistAnnotationPosition,
  autosizeAnnotationTextarea,
  editable = true,
}: AnnotationLayerProps) {
  const layerRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: string; moved: boolean; x: number; y: number } | null>(null)
  const [draggingId, setDraggingId] = useState('')

  useEffect(() => {
    if (!editable || !draggingId) return
    const handleMove = (event: PointerEvent) => {
      const layer = layerRef.current
      const currentDrag = dragRef.current
      if (!layer || !currentDrag) return
      const rect = layer.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      currentDrag.moved = true
      const x = (event.clientX - rect.left) / rect.width
      const y = (event.clientY - rect.top) / rect.height
      currentDrag.x = x
      currentDrag.y = y
      onMoveAnnotation(draggingId, x, y)
    }

    const handleUp = () => {
      const currentDrag = dragRef.current
      if (currentDrag?.moved) {
        void onPersistAnnotationPosition(currentDrag.id, currentDrag.x, currentDrag.y)
      }
      setDraggingId('')
      dragRef.current = null
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [draggingId, editable, onMoveAnnotation, onPersistAnnotationPosition])

  const startDrag = (event: React.PointerEvent, annotation: AnnotationRecord) => {
    if (!editable) return
    event.stopPropagation()
    dragRef.current = { id: annotation.id, moved: false, x: annotation.x, y: annotation.y }
    setDraggingId(annotation.id)
  }

  return (
    <div ref={layerRef} className="map-annotation-layer" aria-label="Map annotations">
      {annotations.map((annotation) => (
        <div
          key={annotation.id}
          className={
            activeAnnotationId === annotation.id
              ? `map-annotation ${annotation.kind === 'player' ? 'player-label' : 'gm-annotation'} pointer-${annotation.pointerDirection} active`
              : `map-annotation ${annotation.kind === 'player' ? 'player-label' : 'gm-annotation'} pointer-${annotation.pointerDirection}`
          }
          style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}
        >
          {annotation.kind === 'player' ? (
            editable ? (
              <button
                type="button"
                className={activeAnnotationId === annotation.id ? 'map-player-label-btn active' : 'map-player-label-btn'}
                onClick={(event) => {
                  event.stopPropagation()
                  if (dragRef.current?.id === annotation.id && dragRef.current.moved) return
                  if (activeAnnotationId === annotation.id) {
                    void onCommitActiveAnnotation()
                    setActiveAnnotationId('')
                    return
                  }
                  setActiveAnnotationId(annotation.id)
                  setActiveAnnotationDraft(annotation.text)
                }}
                onPointerDown={(event) => startDrag(event, annotation)}
                aria-label="Player-facing label"
              >
                <span
                  role="button"
                  tabIndex={0}
                  className={`map-label-pointer-btn ${annotation.pointerDirection === 'down' ? 'down' : 'up'}`}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void onToggleAnnotationPointerDirection(annotation.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    event.stopPropagation()
                    void onToggleAnnotationPointerDirection(annotation.id)
                  }}
                  aria-label={annotation.pointerDirection === 'down' ? 'Flip label pointer up' : 'Flip label pointer down'}
                  title={annotation.pointerDirection === 'down' ? 'Flip label pointer up' : 'Flip label pointer down'}
                />
                <span
                  role="button"
                  tabIndex={0}
                  className="map-label-hide-btn"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                  }}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void onToggleAnnotationHidden(annotation.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    event.stopPropagation()
                    void onToggleAnnotationHidden(annotation.id)
                  }}
                  aria-label={annotation.hidden ? 'Show label to players' : 'Hide label from players'}
                  title={annotation.hidden ? 'Show label to players' : 'Hide label from players'}
                >
                  <X size={10} />
                </span>
                <span>{annotation.text.trim() || 'Label'}</span>
                {annotation.hidden ? <span className="map-label-hidden-badge" aria-hidden="true">H</span> : null}
              </button>
            ) : (
              <div className="map-player-label-static">
                <span className={`map-label-pointer-static ${annotation.pointerDirection === 'down' ? 'down' : 'up'}`} aria-hidden="true" />
                <span>{annotation.text.trim() || 'Label'}</span>
              </div>
            )
          ) : (
            editable ? (
              <button
                type="button"
                className={activeAnnotationId === annotation.id ? 'map-annotation-btn active' : 'map-annotation-btn'}
                onClick={(event) => {
                  event.stopPropagation()
                  if (dragRef.current?.id === annotation.id && dragRef.current.moved) return
                  if (activeAnnotationId === annotation.id) {
                    void onCommitActiveAnnotation()
                    setActiveAnnotationId('')
                    return
                  }
                  setActiveAnnotationId(annotation.id)
                  setActiveAnnotationDraft(annotation.text)
                }}
                onPointerDown={(event) => startDrag(event, annotation)}
                aria-label="Map annotation"
              >
                <Flag size={14} />
              </button>
            ) : null
          )}
          {editable && activeAnnotationId === annotation.id ? (
            <div className="map-annotation-popover" onClick={(event) => event.stopPropagation()}>
              <textarea
                value={activeAnnotationDraft}
                onChange={(event) => {
                  setActiveAnnotationDraft(event.target.value)
                  autosizeAnnotationTextarea(event.currentTarget)
                }}
                onBlur={() => {
                  void onCommitActiveAnnotation()
                }}
                ref={autosizeAnnotationTextarea}
                placeholder={annotation.kind === 'player' ? 'Player label' : 'GM note'}
                rows={4}
              />
              <button
                type="button"
                className="map-annotation-delete"
                onClick={() => void onDeleteAnnotation(annotation.id)}
                aria-label="Delete annotation"
                title="Delete annotation"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
