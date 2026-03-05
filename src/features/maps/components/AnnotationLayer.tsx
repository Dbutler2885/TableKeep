import { Flag, Trash2 } from 'lucide-react'
import type { AnnotationRecord } from '../lib/types'

type AnnotationLayerProps = {
  annotations: AnnotationRecord[]
  activeAnnotationId: string
  activeAnnotationDraft: string
  setActiveAnnotationId: (id: string) => void
  setActiveAnnotationDraft: (value: string) => void
  onCommitActiveAnnotation: () => Promise<void>
  onDeleteAnnotation: (annotationId: string) => Promise<void>
  autosizeAnnotationTextarea: (textarea: HTMLTextAreaElement | null) => void
}

export function AnnotationLayer({
  annotations,
  activeAnnotationId,
  activeAnnotationDraft,
  setActiveAnnotationId,
  setActiveAnnotationDraft,
  onCommitActiveAnnotation,
  onDeleteAnnotation,
  autosizeAnnotationTextarea,
}: AnnotationLayerProps) {
  return (
    <div className="map-annotation-layer" aria-label="Map annotations">
      {annotations.map((annotation) => (
        <div
          key={annotation.id}
          className={activeAnnotationId === annotation.id ? 'map-annotation active' : 'map-annotation'}
          style={{ left: `${annotation.x * 100}%`, top: `${annotation.y * 100}%` }}
        >
          <button
            type="button"
            className={activeAnnotationId === annotation.id ? 'map-annotation-btn active' : 'map-annotation-btn'}
            onClick={(event) => {
              event.stopPropagation()
              if (activeAnnotationId === annotation.id) {
                void onCommitActiveAnnotation()
                setActiveAnnotationId('')
                return
              }
              setActiveAnnotationId(annotation.id)
              setActiveAnnotationDraft(annotation.text)
            }}
            aria-label="Map annotation"
          >
            <Flag size={14} />
          </button>
          {activeAnnotationId === annotation.id ? (
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
                placeholder="GM note"
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
