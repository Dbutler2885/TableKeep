const RESIZABLE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

type NormalizeImageOptions = {
  maxWidth: number
  maxHeight: number
  preferType?: 'image/webp' | 'image/jpeg' | 'image/png'
  quality?: number
}

type NormalizedUploadImage = {
  file: File
  width: number
  height: number
}

type NormalizedDataUrlImage = {
  dataUrl: string
  width: number
  height: number
}

const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('Failed to read image data'))
    }
    reader.onerror = () => reject(new Error('Failed to read image data'))
    reader.readAsDataURL(blob)
  })

const loadImageFromBlob = (blob: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Unable to decode image'))
    }
    image.src = objectUrl
  })

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Unable to encode image'))
          return
        }
        resolve(blob)
      },
      type,
      quality,
    )
  })

const extensionForMimeType = (mimeType: string) => {
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/png') return 'png'
  return 'jpg'
}

const normalizeImageBlob = async (
  blob: Blob,
  { maxWidth, maxHeight, preferType = 'image/webp', quality = 0.9 }: NormalizeImageOptions,
) => {
  const image = await loadImageFromBlob(blob)
  const sourceWidth = Math.max(1, image.naturalWidth || 1)
  const sourceHeight = Math.max(1, image.naturalHeight || 1)
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight)
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale))
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale))

  if (targetWidth === sourceWidth && targetHeight === sourceHeight) {
    return {
      blob,
      width: sourceWidth,
      height: sourceHeight,
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Unable to create image canvas')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight)

  const outputBlob = await canvasToBlob(canvas, preferType, quality)
  return {
    blob: outputBlob,
    width: targetWidth,
    height: targetHeight,
  }
}

export const normalizeImageForUpload = async (
  file: File,
  options: NormalizeImageOptions,
): Promise<NormalizedUploadImage> => {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  if (!RESIZABLE_MIME_TYPES.has(file.type)) {
    const image = await loadImageFromBlob(file)
    return {
      file,
      width: Math.max(1, image.naturalWidth || 1),
      height: Math.max(1, image.naturalHeight || 1),
    }
  }

  const normalized = await normalizeImageBlob(file, options)
  const outputType = normalized.blob.type || file.type || 'image/webp'
  const outputName = `${file.name.replace(/\.[^/.]+$/, '')}.${extensionForMimeType(outputType)}`
  return {
    file: new File([normalized.blob], outputName, {
      type: outputType,
      lastModified: Date.now(),
    }),
    width: normalized.width,
    height: normalized.height,
  }
}

export const normalizeImageForDataUrl = async (
  file: File,
  options: NormalizeImageOptions,
): Promise<NormalizedDataUrlImage> => {
  const normalized = await normalizeImageForUpload(file, options)
  return {
    dataUrl: await readBlobAsDataUrl(normalized.file),
    width: normalized.width,
    height: normalized.height,
  }
}
