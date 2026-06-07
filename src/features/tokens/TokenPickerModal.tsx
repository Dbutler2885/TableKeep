import { useEffect, useState } from 'react'
import { Check, Upload, X } from 'lucide-react'
import { TokenPawnPreview, type TokenIconConfig } from './TokenIconEditor'
import { normalizeImageForDataUrl } from '../common/imageNormalization'

type TokenPickerModalProps = {
  open: boolean
  value: TokenIconConfig
  onConfirm: (value: TokenIconConfig) => void
  onCancel: () => void
  onUploadImage?: (file: File) => Promise<Pick<TokenIconConfig, 'customImagePath' | 'customImageUrl' | 'customImageName'>>
}

export function TokenPickerModal({ open, value, onConfirm, onCancel, onUploadImage }: TokenPickerModalProps) {
  const [draft, setDraft] = useState<TokenIconConfig>(value)

  useEffect(() => {
    if (open) setDraft(value)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const handleImageUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const persistUpload = onUploadImage
      ? onUploadImage(file)
      : normalizeImageForDataUrl(file, {
        maxWidth: 1024,
        maxHeight: 1024,
        preferType: 'image/webp',
        quality: 0.9,
      }).then(({ dataUrl }) => ({
        customImagePath: undefined,
        customImageUrl: dataUrl,
        customImageName: file.name.replace(/\.[^/.]+$/, ''),
      }))

    void persistUpload
      .then(({ customImagePath, customImageUrl, customImageName }) => {
        setDraft((current) => ({
          ...current,
          icon: 'custom',
          customImagePath,
          customImageUrl,
          customImageName,
        }))
      })
      .catch(() => {
        // Keep current draft if uploaded image cannot be processed.
      })
  }

  const previewImageUrl = draft.icon === 'custom' ? draft.customImageUrl : undefined

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-modal token-picker-modal">
        <div className="token-picker-preview">
          <TokenPawnPreview color={draft.color} size={52} imageUrl={previewImageUrl} />
        </div>

        <div className="token-picker-row">
          <input
            type="color"
            className="token-picker-color-swatch"
            value={draft.color}
            title="Color"
            aria-label="Token color"
            onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}
          />

          <label className="icon-btn" title="Upload image" aria-label="Upload image">
            <Upload size={14} />
            <input
              type="file"
              accept="image/png,image/webp,image/jpeg,image/gif,image/svg+xml"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) handleImageUpload(file)
                event.currentTarget.value = ''
              }}
            />
          </label>

          {draft.customImageUrl ? (
            <button
              type="button"
              className="icon-btn remove-btn"
              title="Remove image"
              aria-label="Remove image"
              onClick={() => setDraft((current) => ({
                ...current,
                icon: 'pawn',
                customImagePath: undefined,
                customImageUrl: undefined,
                customImageName: undefined,
              }))}
            >
              <X size={13} />
            </button>
          ) : null}

          <div className="token-picker-spacer" />

          <button type="button" className="icon-btn" onClick={onCancel} title="Cancel" aria-label="Cancel">
            <X size={14} />
          </button>
          <button type="button" className="icon-btn" onClick={() => onConfirm(draft)} title="Confirm" aria-label="Confirm">
            <Check size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
