import { ChessPawn, Upload } from 'lucide-react'

export type TokenIconConfig = {
  icon: 'pawn' | 'custom'
  color: string
  size: number
  customImageUrl?: string
  customImageName?: string
}

export type TokenAssetOption = {
  id: string
  name: string
  imageUrl: string
}

type TokenIconEditorProps = {
  value: TokenIconConfig
  onChange: (next: TokenIconConfig) => void
  disabled?: boolean
  className?: string
  minSize?: number
  maxSize?: number
  tokenAssets?: TokenAssetOption[]
  selectedTokenAssetId?: string
  onSelectedTokenAssetIdChange?: (id: string) => void
  selectedTokenImageUrl?: string
  uploadingTokenImage?: boolean
  uploadLabel?: string
  onUploadTokenImage?: (file: File, assetName?: string) => Promise<void> | void
}

export function TokenPawnPreview({
  color,
  size,
  imageUrl,
}: {
  color: string
  size: number
  imageUrl?: string
}) {
  if (imageUrl) {
    return <img src={imageUrl} alt="" className="token-icon-preview-image" style={{ width: size, height: size }} />
  }

  return (
    <span className="token-pawn-preview" style={{ color }} aria-hidden>
      <ChessPawn size={size} />
    </span>
  )
}

export function TokenIconEditor({
  value,
  onChange,
  disabled = false,
  className = '',
  minSize = 18,
  maxSize = 84,
  tokenAssets = [],
  selectedTokenAssetId = '',
  onSelectedTokenAssetIdChange,
  selectedTokenImageUrl = '',
  uploadingTokenImage = false,
  uploadLabel = 'Upload Token Image',
  onUploadTokenImage,
}: TokenIconEditorProps) {
  const wrapperClass = ['token-icon-editor', className].filter(Boolean).join(' ')
  const hasTokenSourceControls = Boolean(onSelectedTokenAssetIdChange || onUploadTokenImage)

  return (
    <div className={wrapperClass}>
      {hasTokenSourceControls ? (
        <label>
          Token Type
          <select
            value={selectedTokenAssetId}
            disabled={disabled}
            onChange={(event) => {
              const nextId = event.target.value
              onSelectedTokenAssetIdChange?.(nextId)
              onChange({ ...value, icon: nextId ? 'custom' : 'pawn' })
            }}
          >
            <option value="">Default Pawn</option>
            {tokenAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label>
          Token Icon
          <select
            value={value.icon}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, icon: event.target.value as 'pawn' | 'custom' })}
          >
            <option value="pawn">Default Pawn</option>
            <option value="custom" disabled>
              Custom Image (upload below)
            </option>
          </select>
        </label>
      )}

      <div className="token-icon-preview-row">
        <TokenPawnPreview
          color={value.color}
          size={Math.max(18, Math.min(36, Math.round(value.size * 0.6)))}
          imageUrl={selectedTokenImageUrl || undefined}
        />
        <span>{selectedTokenImageUrl ? 'Custom token image' : 'Default pawn token'}</span>
      </div>

      {onUploadTokenImage ? (
        <div className="token-image-upload">
          <label className="upload-trigger token-image-trigger">
            <Upload size={14} />
            {uploadingTokenImage ? 'Uploading...' : uploadLabel}
            <input
              type="file"
              accept="image/png,image/webp,image/jpeg,image/gif,image/svg+xml"
              disabled={disabled || uploadingTokenImage}
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.currentTarget.value = ''
                if (!file) return
                const entered = window.prompt('Name this token icon:', file.name.replace(/\.[^/.]+$/, ''))
                if (entered === null) return
                const name = entered.trim()
                if (!name) return
                void onUploadTokenImage(file, name)
              }}
            />
          </label>
        </div>
      ) : null}

      <label>
        Token Color
        <input
          type="color"
          disabled={disabled}
          value={value.color}
          onChange={(event) => onChange({ ...value, color: event.target.value })}
        />
      </label>

      <label>
        Token Size: {value.size}
        <input
          type="range"
          min={minSize}
          max={maxSize}
          step={1}
          disabled={disabled}
          value={value.size}
          onChange={(event) => onChange({ ...value, size: Number(event.target.value) })}
        />
      </label>
    </div>
  )
}
