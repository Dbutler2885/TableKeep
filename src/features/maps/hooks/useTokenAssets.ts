import { useRef, useState } from 'react'
import type { MutableRefObject, PointerEvent } from 'react'
import { auth } from '../../../firebase'
import type { Role } from '../../../types/app'
import { normalizeImageForDataUrl, normalizeImageForUpload } from '../../common/imageNormalization'
import type { TokenImageDraft } from '../lib/types'

type UseTokenAssetsParams = {
  role: Role | null
  setMapError: (error: string | null) => void
  saveTokenAssetFile: (file: File, width: number, height: number, assetName?: string) => Promise<void>
  inlineStageRef: MutableRefObject<HTMLDivElement | null>
}

export function useTokenAssets({ role, setMapError, saveTokenAssetFile, inlineStageRef }: UseTokenAssetsParams) {
  const [uploadingTokenImage, setUploadingTokenImage] = useState(false)
  const [tokenImageDraft, setTokenImageDraft] = useState<TokenImageDraft | null>(null)
  const tokenImageDragOriginRef = useRef<{ x: number; y: number; focusX: number; focusY: number } | null>(null)

  // Crops and squares an image from a draft (focusX/Y + zoom), returns a File.
  const buildSquareTokenImageFile = async (draft: TokenImageDraft) => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('Unable to decode token image'))
      nextImage.src = draft.imageUrl
    })
    const sourceWidth = Math.max(1, image.naturalWidth || 1)
    const sourceHeight = Math.max(1, image.naturalHeight || 1)
    const maxSide = Math.max(sourceWidth, sourceHeight)
    const targetSize = Math.min(1024, Math.max(1, Math.round(maxSide)))
    const canvas = document.createElement('canvas')
    canvas.width = targetSize
    canvas.height = targetSize
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Unable to create image canvas')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const baseScale = targetSize / maxSide
    const scale = baseScale * Math.max(0.2, draft.zoom)
    const drawWidth = sourceWidth * scale
    const drawHeight = sourceHeight * scale
    const focusX = (draft.focusX / 100) * drawWidth
    const focusY = (draft.focusY / 100) * drawHeight
    const drawX = targetSize / 2 - focusX
    const drawY = targetSize / 2 - focusY

    ctx.clearRect(0, 0, targetSize, targetSize)
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (!nextBlob) {
          reject(new Error('Unable to encode token image'))
          return
        }
        resolve(nextBlob)
      }, 'image/webp', 0.9)
    })
    const file = new File([blob], `${draft.fileBaseName}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    })
    return { file, width: targetSize, height: targetSize }
  }

  // Apply the current crop draft: square the image and save it as an asset.
  const applyTokenImageDraft = async () => {
    if (!tokenImageDraft) return
    if (role !== 'gm') return
    setUploadingTokenImage(true)
    setMapError(null)
    try {
      await auth.currentUser?.getIdToken(true)
      const squared = await buildSquareTokenImageFile(tokenImageDraft)
      await saveTokenAssetFile(squared.file, squared.width, squared.height, tokenImageDraft.assetName)
      setTokenImageDraft(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process token image'
      setMapError(`Token upload failed: ${message}`)
    } finally {
      setUploadingTokenImage(false)
    }
  }

  // Upload a new token image file. If non-square, opens the crop draft UI;
  // otherwise squares and saves immediately.
  const uploadTokenImage = async (file: File, assetName?: string) => {
    if (role !== 'gm') return
    if (!file.type.startsWith('image/')) return
    setUploadingTokenImage(true)
    setMapError(null)
    try {
      await auth.currentUser?.getIdToken(true)
      const normalizedPreview = await normalizeImageForDataUrl(file, {
        maxWidth: 1024,
        maxHeight: 1024,
        preferType: 'image/webp',
        quality: 0.9,
      })
      if (normalizedPreview.width !== normalizedPreview.height) {
        setTokenImageDraft({
          imageUrl: normalizedPreview.dataUrl,
          focusX: 50,
          focusY: 50,
          zoom: 1,
          assetName,
          fileBaseName: file.name.replace(/\.[^/.]+$/, ''),
        })
        return
      }

      const normalized = await normalizeImageForUpload(file, {
        maxWidth: 1024,
        maxHeight: 1024,
        preferType: 'image/webp',
        quality: 0.9,
      })
      await saveTokenAssetFile(normalized.file, normalized.width, normalized.height, assetName)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload token image'
      setMapError(`Token upload failed: ${message}`)
    } finally {
      setUploadingTokenImage(false)
    }
  }

  const handleTokenImageDraftDragStart = (event: PointerEvent<HTMLDivElement>) => {
    if (!tokenImageDraft) return
    event.currentTarget.setPointerCapture(event.pointerId)
    tokenImageDragOriginRef.current = {
      x: event.clientX,
      y: event.clientY,
      focusX: tokenImageDraft.focusX,
      focusY: tokenImageDraft.focusY,
    }
  }

  const handleTokenImageDraftDragMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!tokenImageDraft || !tokenImageDragOriginRef.current) return
    const rect = inlineStageRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect()
    const dx = event.clientX - tokenImageDragOriginRef.current.x
    const dy = event.clientY - tokenImageDragOriginRef.current.y
    const nextFocusX = Math.max(0, Math.min(100, tokenImageDragOriginRef.current.focusX - (dx / rect.width) * 100))
    const nextFocusY = Math.max(0, Math.min(100, tokenImageDragOriginRef.current.focusY - (dy / rect.height) * 100))
    setTokenImageDraft((current) => (current ? { ...current, focusX: nextFocusX, focusY: nextFocusY } : current))
  }

  const clearTokenImageDraftDrag = () => {
    tokenImageDragOriginRef.current = null
  }

  const adjustTokenImageDraftZoom = (delta: number) => {
    setTokenImageDraft((current) => {
      if (!current) return current
      const nextZoom = Math.max(0.2, Math.min(6, Number((current.zoom + delta).toFixed(2))))
      return { ...current, zoom: nextZoom }
    })
  }

  return {
    uploadingTokenImage,
    tokenImageDraft,
    setTokenImageDraft,
    uploadTokenImage,
    applyTokenImageDraft,
    adjustTokenImageDraftZoom,
    handleTokenImageDraftDragStart,
    handleTokenImageDraftDragMove,
    clearTokenImageDraftDrag,
  }
}
