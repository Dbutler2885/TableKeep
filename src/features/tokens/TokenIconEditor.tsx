import { useEffect, useRef, useState } from 'react'
import { ALargeSmall, Archive, Check, ChessPawn, ChevronDown, Upload, X } from 'lucide-react'
import { IconValueSlider } from '../common/IconValueSlider'

export type TokenIconConfig = {
  icon: 'pawn' | 'custom'
  color: string
  size: number
  customImagePath?: string
  customImageUrl?: string
  customImageName?: string
}

export type TokenAssetOption = {
  id: string
  name: string
  imageUrl: string
  archived?: boolean
  /** Present when this option represents a monster rather than a standalone asset.
   *  Extraction point: to split monsters into a separate picker, move all monsterId
   *  options out of the tokenAssets list and handle them in a dedicated UI. */
  monsterId?: string
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
  onArchiveTokenAsset?: (id: string, archived: boolean) => Promise<void> | void
  onRequestDeleteTokenAsset?: (id: string) => void
  selectedTokenImageUrl?: string
  uploadingTokenImage?: boolean
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
  onArchiveTokenAsset,
  onRequestDeleteTokenAsset,
  selectedTokenImageUrl = '',
  uploadingTokenImage = false,
  onUploadTokenImage,
}: TokenIconEditorProps) {
  const wrapperClass = ['token-icon-editor', className].filter(Boolean).join(' ')
  const hasTokenSourceControls = Boolean(onSelectedTokenAssetIdChange || onUploadTokenImage)
  const [assetMenuOpen, setAssetMenuOpen] = useState(false)
  const [showArchivedAssets, setShowArchivedAssets] = useState(false)
  const assetMenuRef = useRef<HTMLDivElement | null>(null)
  const isSvgTokenImage =
    selectedTokenImageUrl.toLowerCase().includes('.svg') || selectedTokenImageUrl.startsWith('data:image/svg+xml')
  const showColorPicker = !selectedTokenImageUrl || isSvgTokenImage
  const selectedAsset = tokenAssets.find((asset) => asset.id === selectedTokenAssetId) ?? null
  const regularAssets = tokenAssets.filter((a) => !a.monsterId)
  const monsterAssets = tokenAssets.filter((a) => !!a.monsterId)
  const visibleRegularAssets = regularAssets.filter((a) => (showArchivedAssets ? a.archived === true : a.archived !== true))
  // Monster options are never archived — always visible regardless of the archive toggle.

  useEffect(() => {
    if (!assetMenuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) return
      if (assetMenuRef.current?.contains(target)) return
      setAssetMenuOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [assetMenuOpen])

  return (
    <div className={wrapperClass}>
      {hasTokenSourceControls ? (
        <label>
          Token Type
          <div className="token-asset-picker-row" ref={assetMenuRef}>
            <div className={assetMenuOpen ? 'token-asset-picker-shell open' : 'token-asset-picker-shell'}>
              <button
                type="button"
                className="token-asset-picker-trigger"
                disabled={disabled}
                onClick={() => setAssetMenuOpen((current) => !current)}
                aria-haspopup="listbox"
                aria-expanded={assetMenuOpen}
              >
                <span className="token-asset-picker-label">
                  {selectedAsset ? selectedAsset.name : 'Default Pawn'}
                </span>
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                className={showArchivedAssets ? 'token-asset-picker-archive fast-tooltip active' : 'token-asset-picker-archive fast-tooltip'}
                onClick={() => setShowArchivedAssets((current) => !current)}
                aria-label={showArchivedAssets ? 'Show active token icons' : 'Show archived token icons'}
                data-tooltip={showArchivedAssets ? 'Show active icons' : 'Show archived icons'}
              >
                <Archive size={14} />
              </button>
            </div>
            {assetMenuOpen ? (
              <div className="token-asset-picker-menu" role="listbox" aria-label="Token icon options">
                <div className={selectedTokenAssetId ? 'token-asset-option' : 'token-asset-option selected'}>
                  <button
                    type="button"
                    className="token-asset-option-main"
                    onClick={() => {
                      onSelectedTokenAssetIdChange?.('')
                      onChange({ ...value, icon: 'pawn' })
                      setAssetMenuOpen(false)
                    }}
                  >
                    <span className="token-asset-option-name">Default Pawn</span>
                    {!selectedTokenAssetId ? <Check size={13} /> : null}
                  </button>
                  <div className="token-asset-option-actions" aria-hidden />
                </div>
                {visibleRegularAssets.map((asset) => {
                  const isSelected = selectedTokenAssetId === asset.id
                  const archived = asset.archived === true
                  return (
                    <div key={asset.id} className={isSelected ? 'token-asset-option selected' : 'token-asset-option'}>
                      <button
                        type="button"
                        className="token-asset-option-main"
                        onClick={() => {
                          onSelectedTokenAssetIdChange?.(asset.id)
                          onChange({ ...value, icon: 'custom' })
                          setAssetMenuOpen(false)
                        }}
                      >
                        <span className="token-asset-option-name">{asset.name}</span>
                        {isSelected ? <Check size={13} /> : null}
                      </button>
                      <div className="token-asset-option-actions">
                        <button
                          type="button"
                          className="map-icon-btn fast-tooltip"
                          data-tooltip={archived ? 'Unarchive icon' : 'Archive icon'}
                          aria-label={archived ? `Unarchive ${asset.name}` : `Archive ${asset.name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            void onArchiveTokenAsset?.(asset.id, !archived)
                          }}
                        >
                          <Archive size={12} />
                        </button>
                        <button
                          type="button"
                          className="map-icon-btn fast-tooltip"
                          data-tooltip="Delete icon"
                          aria-label={`Delete ${asset.name}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            onRequestDeleteTokenAsset?.(asset.id)
                            setAssetMenuOpen(false)
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
                {monsterAssets.length > 0 ? (
                  <div className="token-asset-section-divider" role="separator" aria-label="Monsters" />
                ) : null}
                {monsterAssets.map((asset) => {
                  const isSelected = selectedTokenAssetId === asset.id
                  return (
                    <div key={asset.id} className={isSelected ? 'token-asset-option selected' : 'token-asset-option'}>
                      <button
                        type="button"
                        className="token-asset-option-main"
                        onClick={() => {
                          onSelectedTokenAssetIdChange?.(asset.id)
                          setAssetMenuOpen(false)
                        }}
                      >
                        <span className="token-asset-option-name">{asset.name}</span>
                        {isSelected ? <Check size={13} /> : null}
                      </button>
                      <div className="token-asset-option-actions" aria-hidden />
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
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

      {onUploadTokenImage ? (
        <div className="token-image-upload">
          <label
            className="map-icon-btn token-image-trigger fast-tooltip fast-tooltip-left"
            data-tooltip={uploadingTokenImage ? 'Uploading...' : 'Upload token image'}
            aria-label={uploadingTokenImage ? 'Uploading token image' : 'Upload token image'}
          >
            <Upload size={14} />
            <input
              className="sr-only"
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

      <IconValueSlider
        icon={<ALargeSmall size={14} />}
        tooltip="Token Size"
        value={value.size}
        min={minSize}
        max={maxSize}
        step={1}
        disabled={disabled}
        ariaLabel="Token size"
        onChange={(nextSize) => onChange({ ...value, size: nextSize })}
      />

      <div className="token-icon-preview-row">
        {showColorPicker ? (
          <input
            type="color"
            className="token-icon-preview-color"
            disabled={disabled}
            value={value.color}
            aria-label="Token color"
            onChange={(event) => onChange({ ...value, color: event.target.value })}
          />
        ) : null}
        <TokenPawnPreview
          color={value.color}
          size={Math.max(minSize, Math.min(maxSize, value.size))}
          imageUrl={selectedTokenImageUrl || undefined}
        />
      </div>
      <span className="token-icon-preview-label">{selectedTokenImageUrl ? 'Custom token image' : 'Default pawn token'}</span>
    </div>
  )
}
