import { Check, ImagePlus, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { normalizeImageForDataUrl } from './imageNormalization'
import { TokenPawnPreview, type TokenIconConfig } from '../tokens/TokenIconEditor'
import { TokenPickerModal } from '../tokens/TokenPickerModal'
import { ConfirmModal } from './ConfirmModal'

type EntityMediaEditorProps = {
  entityName: string
  portraitUrl: string | null
  portraitFocusX: number
  portraitFocusY: number
  tokenIcon: TokenIconConfig
  onChange: (updates: Partial<{
    portraitUrl: string | null
    portraitFocusX: number
    portraitFocusY: number
    tokenIcon: TokenIconConfig
  }>) => void
  portraitAltLabel: string
  tokenButtonAriaLabel?: string
  removePortraitMessage?: string
}

export function EntityMediaEditor({
  entityName,
  portraitUrl,
  portraitFocusX,
  portraitFocusY,
  tokenIcon,
  onChange,
  portraitAltLabel,
  tokenButtonAriaLabel = 'Edit token icon',
  removePortraitMessage = 'Remove portrait image?',
}: EntityMediaEditorProps) {
  const [portraitError, setPortraitError] = useState<string | null>(null)
  const [portraitDraft, setPortraitDraft] = useState<{
    imageUrl: string
    focusX: number
    focusY: number
  } | null>(null)
  const [deletePortraitOpen, setDeletePortraitOpen] = useState(false)
  const [tokenPickerOpen, setTokenPickerOpen] = useState(false)
  const portraitDragOrigin = useRef<{ x: number; y: number; focusX: number; focusY: number } | null>(null)

  const portraitObjectPosition = `${portraitFocusX ?? 50}% ${portraitFocusY ?? 50}%`

  const handlePortraitFile = (file: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setPortraitError('Please choose an image file.')
      return
    }
    void normalizeImageForDataUrl(file, {
      maxWidth: 600,
      maxHeight: 800,
      preferType: 'image/webp',
      quality: 0.9,
    })
      .then(({ dataUrl }) => {
        setPortraitDraft({ imageUrl: dataUrl, focusX: portraitFocusX, focusY: portraitFocusY })
        setPortraitError(null)
      })
      .catch(() => {
        setPortraitError('Unable to process that image. Please choose another file.')
      })
  }

  const applyPortraitDraft = () => {
    if (!portraitDraft) return
    onChange({
      portraitUrl: portraitDraft.imageUrl,
      portraitFocusX: portraitDraft.focusX,
      portraitFocusY: portraitDraft.focusY,
    })
    setPortraitDraft(null)
  }

  const handlePortraitDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!portraitDraft) return
    e.currentTarget.setPointerCapture(e.pointerId)
    portraitDragOrigin.current = { x: e.clientX, y: e.clientY, focusX: portraitDraft.focusX, focusY: portraitDraft.focusY }
  }

  const handlePortraitDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!portraitDragOrigin.current || !portraitDraft) return
    const rect = e.currentTarget.getBoundingClientRect()
    const dx = e.clientX - portraitDragOrigin.current.x
    const dy = e.clientY - portraitDragOrigin.current.y
    const newFocusX = Math.max(0, Math.min(100, portraitDragOrigin.current.focusX - (dx / rect.width) * 100))
    const newFocusY = Math.max(0, Math.min(100, portraitDragOrigin.current.focusY - (dy / rect.height) * 100))
    setPortraitDraft((current) => (current ? { ...current, focusX: newFocusX, focusY: newFocusY } : current))
  }

  const handlePortraitDragEnd = () => {
    portraitDragOrigin.current = null
  }

  return (
    <>
      <div className="monster-media-column">
        <button
          type="button"
          className="monster-token-thumb-frame monster-token-thumb-btn"
          onClick={() => setTokenPickerOpen(true)}
          aria-label={tokenButtonAriaLabel}
        >
          <TokenPawnPreview
            color={tokenIcon.color}
            size={40}
            imageUrl={tokenIcon.icon === 'custom' ? tokenIcon.customImageUrl : undefined}
          />
        </button>
        {portraitUrl ? (
          <div className="monster-portrait-frame monster-portrait-frame-filled">
            <img
              src={portraitUrl}
              alt={portraitAltLabel}
              className="monster-portrait"
              style={{ objectPosition: portraitObjectPosition }}
            />
            <button
              type="button"
              className="portrait-delete-btn"
              onClick={() => setDeletePortraitOpen(true)}
              aria-label="Remove portrait"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ) : (
          <label className="monster-portrait-frame monster-portrait-frame-empty">
            <div className="monster-portrait-empty">
              <ImagePlus size={18} />
              <span>Portrait</span>
            </div>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => handlePortraitFile(event.target.files?.[0] ?? null)}
            />
          </label>
        )}
      </div>

      {portraitError ? <p className="error">{portraitError}</p> : null}

      <TokenPickerModal
        open={tokenPickerOpen}
        value={tokenIcon}
        onConfirm={(nextTokenIcon) => {
          onChange({ tokenIcon: nextTokenIcon })
          setTokenPickerOpen(false)
        }}
        onCancel={() => setTokenPickerOpen(false)}
      />
      <ConfirmModal
        open={deletePortraitOpen}
        title="Remove portrait?"
        message={removePortraitMessage}
        confirmLabel="Remove"
        onConfirm={() => {
          onChange({ portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50 })
          setDeletePortraitOpen(false)
        }}
        onCancel={() => setDeletePortraitOpen(false)}
      />
      {portraitDraft ? (
        <div className="monster-portrait-modal-overlay" role="dialog" aria-modal="true" aria-label={`Adjust ${entityName} portrait`}>
          <div className="monster-portrait-modal">
            <div className="monster-portrait-modal-header">
              <span className="monster-portrait-modal-hint">Drag to reposition</span>
              <div className="monster-portrait-modal-actions">
                <button type="button" className="modal-icon-btn" onClick={() => setPortraitDraft(null)} aria-label="Cancel">
                  <X size={16} />
                </button>
                <button type="button" className="modal-icon-btn confirm" onClick={applyPortraitDraft} aria-label="Save portrait">
                  <Check size={16} />
                </button>
              </div>
            </div>
            <div
              className="monster-portrait-modal-preview monster-portrait-drag-zone"
              onPointerDown={handlePortraitDragStart}
              onPointerMove={handlePortraitDragMove}
              onPointerUp={handlePortraitDragEnd}
              onPointerCancel={handlePortraitDragEnd}
            >
              <img
                src={portraitDraft.imageUrl}
                alt=""
                className="monster-portrait"
                style={{ objectPosition: `${portraitDraft.focusX}% ${portraitDraft.focusY}%` }}
                draggable={false}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
