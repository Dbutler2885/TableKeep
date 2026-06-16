import { useEffect, useState } from 'react'
import { Check, Upload, X } from 'lucide-react'
import { TokenPawnPreview, type TokenIconConfig } from './TokenIconEditor'
import { normalizeImageForDataUrl } from '../common/imageNormalization'

type TokenPickerModalProps = {
  open: boolean
  value: TokenIconConfig
  onConfirm: (value: TokenIconConfig) => void
  onCancel: () => void
  disabled?: boolean
  onUploadImage?: (file: File) => Promise<Pick<TokenIconConfig, 'customImagePath' | 'customImageUrl' | 'customImageName'>>
}

export function TokenPickerModal({ open, value, onConfirm, onCancel, disabled = false, onUploadImage }: TokenPickerModalProps) {
  const [draft, setDraft] = useState<TokenIconConfig>(value)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setDraft(value)
        setUploading(false)
        setUploadError(null)
      })
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  const handleImageUpload = (file: File) => {
    if (disabled) return
    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose an image file.')
      return
    }
    setUploading(true)
    setUploadError(null)
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
      .catch((error) => {
        console.error('Token image upload failed', error)
        setUploadError('Upload failed. Check your access and try again.')
      })
      .finally(() => {
        setUploading(false)
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
            disabled={disabled}
            onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}
          />

          <label
            className="icon-btn"
            title={disabled ? 'Token editing unavailable' : uploading ? 'Uploading…' : 'Upload image'}
            aria-label={disabled ? 'Token editing unavailable' : uploading ? 'Uploading image' : 'Upload image'}
            aria-busy={uploading}
          >
            <Upload size={14} />
            <input
              type="file"
              accept="image/png,image/webp,image/jpeg,image/gif,image/svg+xml"
              className="sr-only"
              disabled={disabled || uploading}
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
              disabled={disabled}
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
          <button type="button" className="icon-btn" onClick={() => onConfirm(draft)} title="Confirm" aria-label="Confirm" disabled={disabled || uploading}>
            <Check size={14} />
          </button>
        </div>

        {uploadError ? <p className="error token-picker-error">{uploadError}</p> : null}
      </div>
    </div>
  )
}
