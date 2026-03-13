import { useEffect, useRef, useState } from 'react'
import type { MouseEventHandler, TouchEventHandler } from 'react'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../../../firebase'
import type { Role } from '../../../types/app'
import type { MapRecord } from '../lib/types'
import { FOG_BRUSH_SIZE_MIN, TOKEN_REFERENCE_DIMENSION } from '../lib/constants'

type UseFogToolsOptions = {
  campaignId: string
  role: Role | null
  selectedMap: MapRecord | null
  setMapError: (message: string | null) => void
  usingFullScreenCanvas: boolean
  fullScreenOpen: boolean
  isMobile: boolean
  mobileGmPane: 'map' | 'controls'
  mobilePlayerPane: 'map' | 'controls' | 'character'
  inlineFogSize: { width: number; height: number }
  fullFogSize: { width: number; height: number }
  fogTool: 'reveal' | 'hide' | null
  visionTool: 'draw' | 'drawFull' | 'erase' | null
  tokenPlaceMode: boolean
  fogBrushSize: number
  activeFogDimension: number
  fogBrushStrength: number
  tokenAnimationsRef: React.MutableRefObject<Record<string, any>>
  pendingFogReloadRef: React.MutableRefObject<boolean>
}

export function useFogTools({
  campaignId,
  role,
  selectedMap,
  setMapError,
  usingFullScreenCanvas,
  fullScreenOpen,
  isMobile,
  mobileGmPane,
  mobilePlayerPane,
  inlineFogSize,
  fullFogSize,
  fogTool,
  visionTool,
  tokenPlaceMode,
  fogBrushSize,
  activeFogDimension,
  fogBrushStrength,
  tokenAnimationsRef,
  pendingFogReloadRef,
}: UseFogToolsOptions) {
  const [fogDrawing, setFogDrawing] = useState(false)
  const [fogSampleTick, setFogSampleTick] = useState(0)
  const [inlineFogReady, setInlineFogReady] = useState(false)
  const [fullFogReady, setFullFogReady] = useState(false)

  const inlineFogCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fullFogCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const inlineVisionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fullVisionCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const loadedInlineFogKeyRef = useRef('')
  const loadedInlineCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const loadedInlineVisionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const loadedFogKeyRef = useRef('')
  const loadedFogCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const loadedInlineVisionKeyRef = useRef('')
  const loadedVisionKeyRef = useRef('')
  const loadedVisionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fogLoadNonceRef = useRef(0)
  const visionLoadNonceRef = useRef(0)

  const fogLastPointRef = useRef<{ x: number; y: number } | null>(null)
  const revealMaskCanvasRef = useRef<HTMLCanvasElement | null>(null)

  const activeFogCanvasRef = usingFullScreenCanvas ? fullFogCanvasRef : inlineFogCanvasRef
  const activeVisionCanvasRef = usingFullScreenCanvas ? fullVisionCanvasRef : inlineVisionCanvasRef
  const effectiveFogBrushSize = Math.max(
    FOG_BRUSH_SIZE_MIN,
    Math.min(320, Math.round((fogBrushSize / TOKEN_REFERENCE_DIMENSION) * activeFogDimension)),
  )

  const bumpFogSampleTick = () => {
    setFogSampleTick((value) => value + 1)
  }

  const setFogReadyForCanvas = (canvas: HTMLCanvasElement, ready: boolean) => {
    if (canvas === inlineFogCanvasRef.current) setInlineFogReady(ready)
    if (canvas === fullFogCanvasRef.current) setFullFogReady(ready)
  }

  const invalidateInlineOverlayCache = () => {
    loadedInlineFogKeyRef.current = ''
    loadedInlineVisionKeyRef.current = ''
  }

  const invalidateFullFogCache = () => {
    loadedFogKeyRef.current = ''
  }

  const invalidateFullVisionCache = () => {
    loadedVisionKeyRef.current = ''
  }

  const initializeFogCanvas = (canvas: HTMLCanvasElement, map: MapRecord, width: number, height: number) => {
    if (width <= 0 || height <= 0) return

    const resized = canvas.width !== width || canvas.height !== height
    if (resized) {
      canvas.width = width
      canvas.height = height
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    setFogReadyForCanvas(canvas, false)

    const fogLoadToken = String(++fogLoadNonceRef.current)
    canvas.dataset.fogLoadToken = fogLoadToken

    // Reset immediately on map switch to prevent previous-map reveal bleed-through
    // while async fog image loading is in flight.
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = 'rgba(0, 0, 0, 1)'
    ctx.fillRect(0, 0, width, height)
    bumpFogSampleTick()

    const fogSource = map.fogDataUrl || map.fogImageUrl
    if (!fogSource) {
      setFogReadyForCanvas(canvas, true)
      return
    }

    const fogImage = new Image()
    fogImage.crossOrigin = 'anonymous'
    fogImage.onload = () => {
      if (canvas.dataset.fogLoadToken !== fogLoadToken) return
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(fogImage, 0, 0, width, height)
      bumpFogSampleTick()
      setFogReadyForCanvas(canvas, true)
    }
    fogImage.onerror = () => {
      if (canvas.dataset.fogLoadToken !== fogLoadToken) return
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = 'rgba(0, 0, 0, 1)'
      ctx.fillRect(0, 0, width, height)
      bumpFogSampleTick()
      setFogReadyForCanvas(canvas, true)
    }
    fogImage.src = fogSource
  }

  const initializeVisionCanvas = (canvas: HTMLCanvasElement, map: MapRecord, width: number, height: number) => {
    if (width <= 0 || height <= 0) return

    const resized = canvas.width !== width || canvas.height !== height
    if (resized) {
      canvas.width = width
      canvas.height = height
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const visionLoadToken = String(++visionLoadNonceRef.current)
    canvas.dataset.visionLoadToken = visionLoadToken
    ctx.clearRect(0, 0, width, height)

    const sources = [map.visionBlockDataUrl, map.visionBlockImageUrl].filter(Boolean)
    if (sources.length === 0) {
      return
    }

    const loadAt = (index: number) => {
      const source = sources[index]
      if (!source) {
        ctx.clearRect(0, 0, width, height)
        return
      }
      const blockImage = new Image()
      blockImage.crossOrigin = 'anonymous'
      blockImage.onload = () => {
        if (canvas.dataset.visionLoadToken !== visionLoadToken) return
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(blockImage, 0, 0, width, height)
      }
      blockImage.onerror = () => {
        if (canvas.dataset.visionLoadToken !== visionLoadToken) return
        loadAt(index + 1)
      }
      blockImage.src = source
    }
    loadAt(0)
  }

  const getFogCacheKey = (map: MapRecord, width: number, height: number) => `${map.id}:${map.updatedAtMs}:${width}x${height}`

  const safeCanvasToDataUrl = (canvas: HTMLCanvasElement) => {
    try {
      return canvas.toDataURL('image/png')
    } catch {
      return ''
    }
  }

  const stampVisionBlock = (
    canvas: HTMLCanvasElement,
    x: number,
    y: number,
    mode: 'draw' | 'drawFull' | 'erase',
    brushSize = effectiveFogBrushSize,
  ) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    const radius = brushSize / 2

    ctx.save()
    ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over'
    // draw      = surface blocker (reveals blocker-painted region on LOS touch)
    // drawFull  = hard blocker (never auto-reveals itself)
    ctx.fillStyle = mode === 'drawFull' ? 'rgba(42, 72, 176, 0.95)' : 'rgba(176, 44, 44, 0.95)'
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  const drawVisionStroke = (
    canvas: HTMLCanvasElement,
    from: { x: number; y: number },
    to: { x: number; y: number },
    mode: 'draw' | 'drawFull' | 'erase',
    brushSize = effectiveFogBrushSize,
  ) => {
    const deltaX = to.x - from.x
    const deltaY = to.y - from.y
    const distance = Math.hypot(deltaX, deltaY)
    const step = Math.max(3, brushSize * 0.22)
    const steps = Math.max(1, Math.ceil(distance / step))

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps
      stampVisionBlock(canvas, from.x + deltaX * t, from.y + deltaY * t, mode, brushSize)
    }
  }

  const stampFog = (
    canvas: HTMLCanvasElement,
    x: number,
    y: number,
    mode: 'reveal' | 'hide',
    brushSize = effectiveFogBrushSize,
    visionCanvas?: HTMLCanvasElement | null,
  ) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const radius = brushSize / 2
    const buildStampMask = (targetCtx: CanvasRenderingContext2D) => {
      const gradient = targetCtx.createRadialGradient(x, y, 0, x, y, radius)
      gradient.addColorStop(0, `rgba(0,0,0,${Math.min(1, fogBrushStrength * 0.65)})`)
      gradient.addColorStop(0.65, `rgba(0,0,0,${Math.min(1, fogBrushStrength * 0.25)})`)
      gradient.addColorStop(1, 'rgba(0,0,0,0)')
      targetCtx.fillStyle = gradient
      targetCtx.beginPath()
      targetCtx.arc(x, y, radius, 0, Math.PI * 2)
      targetCtx.fill()

      const sprayCount = Math.max(18, Math.round((radius * radius) / 90))
      for (let i = 0; i < sprayCount; i += 1) {
        const angle = Math.random() * Math.PI * 2
        const dist = Math.sqrt(Math.random()) * radius
        const px = x + Math.cos(angle) * dist
        const py = y + Math.sin(angle) * dist
        const distanceRatio = 1 - dist / radius
        const alpha = Math.min(1, fogBrushStrength * distanceRatio * 0.38)
        const dotRadius = Math.max(1, radius * 0.035 * (0.6 + Math.random() * 0.8))
        targetCtx.fillStyle = `rgba(0,0,0,${alpha})`
        targetCtx.beginPath()
        targetCtx.arc(px, py, dotRadius, 0, Math.PI * 2)
        targetCtx.fill()
      }
    }

    if (mode === 'reveal' && visionCanvas) {
      let maskCanvas = revealMaskCanvasRef.current
      if (!maskCanvas) {
        maskCanvas = document.createElement('canvas')
        revealMaskCanvasRef.current = maskCanvas
      }
      if (maskCanvas.width !== canvas.width || maskCanvas.height !== canvas.height) {
        maskCanvas.width = canvas.width
        maskCanvas.height = canvas.height
      }
      const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })
      if (!maskCtx) return
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
      buildStampMask(maskCtx)
      maskCtx.globalCompositeOperation = 'destination-out'
      maskCtx.drawImage(visionCanvas, 0, 0, maskCanvas.width, maskCanvas.height)
      maskCtx.globalCompositeOperation = 'source-over'

      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height)
      ctx.restore()
      return
    }

    ctx.save()
    ctx.globalCompositeOperation = mode === 'reveal' ? 'destination-out' : 'source-over'
    buildStampMask(ctx)

    ctx.restore()
  }

  const canvasPointFromMouse = (
    canvas: HTMLCanvasElement,
    event: Parameters<MouseEventHandler<HTMLCanvasElement>>[0],
  ) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / Math.max(1, rect.width)
    const scaleY = canvas.height / Math.max(1, rect.height)
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    }
  }

  const drawFogStroke = (
    canvas: HTMLCanvasElement,
    from: { x: number; y: number },
    to: { x: number; y: number },
    mode: 'reveal' | 'hide',
    brushSize = effectiveFogBrushSize,
    visionCanvas?: HTMLCanvasElement | null,
  ) => {
    const deltaX = to.x - from.x
    const deltaY = to.y - from.y
    const distance = Math.hypot(deltaX, deltaY)
    const step = Math.max(3, brushSize * 0.16)
    const steps = Math.max(1, Math.ceil(distance / step))

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps
      stampFog(canvas, from.x + deltaX * t, from.y + deltaY * t, mode, brushSize, visionCanvas)
    }
  }

  const canvasPointFromTouch = (canvas: HTMLCanvasElement, touch: React.Touch) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / Math.max(1, rect.width)
    const scaleY = canvas.height / Math.max(1, rect.height)
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY,
    }
  }

  const canvasToPngBlob = (canvas: HTMLCanvasElement) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Unable to encode canvas PNG.'))
          return
        }
        resolve(blob)
      }, 'image/png')
    })

  const uploadMapOverlayImage = async (
    mapId: string,
    canvas: HTMLCanvasElement,
    overlay: 'fog' | 'vision',
  ) => {
    const blob = await canvasToPngBlob(canvas)
    const path = `campaigns/${campaignId}/maps/${mapId}/${overlay}/${Date.now()}.png`
    const overlayRef = ref(storage, path)
    await uploadBytes(overlayRef, blob, {
      contentType: 'image/png',
      cacheControl: 'no-store',
    })
    const url = await getDownloadURL(overlayRef)
    return { path, url }
  }

  const persistFog = async () => {
    if (!selectedMap || !activeFogCanvasRef.current || role !== 'gm') return
    try {
      const fogDataUrl = safeCanvasToDataUrl(activeFogCanvasRef.current)
      if (!fogDataUrl) {
        setMapError('Fog update blocked by browser canvas security policy. Reload the map and try again.')
        return
      }
      const { path, url } = await uploadMapOverlayImage(selectedMap.id, activeFogCanvasRef.current, 'fog')
      await updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id), {
        fogImagePath: path,
        fogImageUrl: url,
        fogDataUrl,
        fullyHidden: false,
        updatedAt: serverTimestamp(),
      })
      bumpFogSampleTick()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to persist fog'
      setMapError(message)
    }
  }

  const persistVisionBlocks = async (sourceCanvas?: HTMLCanvasElement | null) => {
    const canvas = sourceCanvas ?? activeVisionCanvasRef.current
    if (!selectedMap || !canvas || role !== 'gm') return
    try {
      const visionBlockDataUrl = safeCanvasToDataUrl(canvas)
      const { path, url } = await uploadMapOverlayImage(selectedMap.id, canvas, 'vision')
      await updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id), {
        visionBlockImagePath: path,
        visionBlockImageUrl: url,
        visionBlockDataUrl,
        updatedAt: serverTimestamp(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to persist vision blocks'
      setMapError(message)
    }
  }

  const handleFogPointerDown: MouseEventHandler<HTMLCanvasElement> = (event) => {
    if (event.button !== 0) return
    if (event.shiftKey) return
    if (tokenPlaceMode) return
    if (!fogTool && !visionTool) return
    if (role !== 'gm' || !activeFogCanvasRef.current) return
    event.preventDefault()
    setFogDrawing(true)
    const point = canvasPointFromMouse(activeFogCanvasRef.current, event)
    fogLastPointRef.current = point
    if (visionTool && activeVisionCanvasRef.current) {
      stampVisionBlock(activeVisionCanvasRef.current, point.x, point.y, visionTool)
      return
    }
    if (!fogTool) return
    stampFog(activeFogCanvasRef.current, point.x, point.y, fogTool)
  }

  const handleFogPointerMove: MouseEventHandler<HTMLCanvasElement> = (event) => {
    if (tokenPlaceMode) return
    if (!fogTool && !visionTool) return
    if (!fogDrawing || role !== 'gm' || !activeFogCanvasRef.current) return
    event.preventDefault()
    const point = canvasPointFromMouse(activeFogCanvasRef.current, event)
    const previousPoint = fogLastPointRef.current
    if (visionTool && activeVisionCanvasRef.current) {
      if (previousPoint) {
        drawVisionStroke(activeVisionCanvasRef.current, previousPoint, point, visionTool)
      } else {
        stampVisionBlock(activeVisionCanvasRef.current, point.x, point.y, visionTool)
      }
      fogLastPointRef.current = point
      return
    }
    if (!fogTool) return
    if (previousPoint) {
      drawFogStroke(activeFogCanvasRef.current, previousPoint, point, fogTool)
    } else {
      stampFog(activeFogCanvasRef.current, point.x, point.y, fogTool)
    }
    fogLastPointRef.current = point
  }

  const handleFogPointerUp = () => {
    if (tokenPlaceMode) return
    if (!fogDrawing) return
    const visionCanvas = activeVisionCanvasRef.current
    setFogDrawing(false)
    fogLastPointRef.current = null
    if (visionTool) {
      void persistVisionBlocks(visionCanvas)
      return
    }
    void persistFog()
  }

  const handleFogTouchStart: TouchEventHandler<HTMLCanvasElement> = (event) => {
    if (tokenPlaceMode) return
    if ((!fogTool && !visionTool) || role !== 'gm' || !activeFogCanvasRef.current) return
    if (event.touches.length !== 1) return
    event.preventDefault()
    event.stopPropagation()
    setFogDrawing(true)
    const point = canvasPointFromTouch(activeFogCanvasRef.current, event.touches[0])
    fogLastPointRef.current = point
    if (visionTool && activeVisionCanvasRef.current) {
      stampVisionBlock(activeVisionCanvasRef.current, point.x, point.y, visionTool)
      return
    }
    if (!fogTool) return
    stampFog(activeFogCanvasRef.current, point.x, point.y, fogTool)
  }

  const handleFogTouchMove: TouchEventHandler<HTMLCanvasElement> = (event) => {
    if (tokenPlaceMode) return
    if (!fogTool && !visionTool) return
    if (!fogDrawing || role !== 'gm' || !activeFogCanvasRef.current) return
    if (event.touches.length !== 1) return
    event.preventDefault()
    event.stopPropagation()
    const point = canvasPointFromTouch(activeFogCanvasRef.current, event.touches[0])
    const previousPoint = fogLastPointRef.current
    if (visionTool && activeVisionCanvasRef.current) {
      if (previousPoint) {
        drawVisionStroke(activeVisionCanvasRef.current, previousPoint, point, visionTool)
      } else {
        stampVisionBlock(activeVisionCanvasRef.current, point.x, point.y, visionTool)
      }
      fogLastPointRef.current = point
      return
    }
    if (!fogTool) return
    if (previousPoint) {
      drawFogStroke(activeFogCanvasRef.current, previousPoint, point, fogTool)
    } else {
      stampFog(activeFogCanvasRef.current, point.x, point.y, fogTool)
    }
    fogLastPointRef.current = point
  }

  const handleFogTouchEnd: TouchEventHandler<HTMLCanvasElement> = () => {
    handleFogPointerUp()
  }

  const getImageNaturalSize = async (imageUrl: string) => {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Failed to load map image dimensions.'))
      image.src = imageUrl
    })

    return {
      width: Math.max(1, image.naturalWidth || 1),
      height: Math.max(1, image.naturalHeight || 1),
    }
  }

  const applyFogPreset = async (preset: 'hide-all' | 'unhide-all') => {
    if (role !== 'gm' || !selectedMap) return

    setMapError(null)

    try {
      const activeSize = usingFullScreenCanvas ? fullFogSize : inlineFogSize
      if (activeFogCanvasRef.current && activeSize.width > 0 && activeSize.height > 0) {
        const canvas = activeFogCanvasRef.current
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (preset === 'hide-all') {
          ctx.fillStyle = 'rgba(0, 0, 0, 1)'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }

        const { path, url } = await uploadMapOverlayImage(selectedMap.id, canvas, 'fog')
        const fogDataUrl = safeCanvasToDataUrl(canvas)
        await updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id), {
          fogImagePath: path,
          fogImageUrl: url,
          fogDataUrl,
          fullyHidden: preset === 'hide-all',
          updatedAt: serverTimestamp(),
        })
        bumpFogSampleTick()
        return
      }

      const { width, height } = await getImageNaturalSize(selectedMap.imageUrl)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return

      ctx.clearRect(0, 0, width, height)
      if (preset === 'hide-all') {
        ctx.fillStyle = 'rgba(0, 0, 0, 1)'
        ctx.fillRect(0, 0, width, height)
      }

      const { path, url } = await uploadMapOverlayImage(selectedMap.id, canvas, 'fog')
      const fogDataUrl = safeCanvasToDataUrl(canvas)
      await updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id), {
        fogImagePath: path,
        fogImageUrl: url,
        fogDataUrl,
        fullyHidden: preset === 'hide-all',
        updatedAt: serverTimestamp(),
      })
      bumpFogSampleTick()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply fog preset'
      setMapError(message)
    }
  }

  useEffect(() => {
    setInlineFogReady(false)
    setFullFogReady(false)
  }, [selectedMap?.id])

  useEffect(() => {
    if (!fullScreenOpen || !selectedMap || !fullFogCanvasRef.current) return
    if (fullFogSize.width <= 0 || fullFogSize.height <= 0) return

    if (loadedFogCanvasRef.current !== fullFogCanvasRef.current) {
      loadedFogCanvasRef.current = fullFogCanvasRef.current
      loadedFogKeyRef.current = ''
    }

    const key = getFogCacheKey(selectedMap, fullFogSize.width, fullFogSize.height)
    if (loadedFogKeyRef.current === key) return

    if (Object.keys(tokenAnimationsRef.current).length > 0) {
      pendingFogReloadRef.current = true
      return
    }

    loadedFogKeyRef.current = key
    initializeFogCanvas(fullFogCanvasRef.current, selectedMap, fullFogSize.width, fullFogSize.height)
  }, [fogSampleTick, fullFogSize.height, fullFogSize.width, fullScreenOpen, selectedMap, tokenAnimationsRef, pendingFogReloadRef])

  useEffect(() => {
    if (!fullScreenOpen || !selectedMap || !fullVisionCanvasRef.current) return
    if (fullFogSize.width <= 0 || fullFogSize.height <= 0) return

    if (loadedVisionCanvasRef.current !== fullVisionCanvasRef.current) {
      loadedVisionCanvasRef.current = fullVisionCanvasRef.current
      loadedVisionKeyRef.current = ''
    }

    const key = `${selectedMap.id}:${selectedMap.visionBlockImagePath || selectedMap.visionBlockImageUrl || selectedMap.visionBlockDataUrl}:${fullFogSize.width}x${fullFogSize.height}`
    if (loadedVisionKeyRef.current === key) return

    loadedVisionKeyRef.current = key
    initializeVisionCanvas(fullVisionCanvasRef.current, selectedMap, fullFogSize.width, fullFogSize.height)
  }, [fullFogSize.height, fullFogSize.width, fullScreenOpen, selectedMap])

  useEffect(() => {
    if (fullScreenOpen || !selectedMap || !inlineFogCanvasRef.current) return
    if (isMobile && (role === 'gm' ? mobileGmPane !== 'map' : mobilePlayerPane !== 'map')) return
    if (inlineFogSize.width <= 0 || inlineFogSize.height <= 0) return

    if (loadedInlineCanvasRef.current !== inlineFogCanvasRef.current) {
      loadedInlineCanvasRef.current = inlineFogCanvasRef.current
      loadedInlineFogKeyRef.current = ''
    }

    const key = getFogCacheKey(selectedMap, inlineFogSize.width, inlineFogSize.height)
    if (loadedInlineFogKeyRef.current === key) return

    if (Object.keys(tokenAnimationsRef.current).length > 0) {
      pendingFogReloadRef.current = true
      return
    }

    loadedInlineFogKeyRef.current = key
    initializeFogCanvas(inlineFogCanvasRef.current, selectedMap, inlineFogSize.width, inlineFogSize.height)
  }, [
    fogSampleTick,
    fullScreenOpen,
    inlineFogSize.height,
    inlineFogSize.width,
    isMobile,
    mobileGmPane,
    mobilePlayerPane,
    role,
    selectedMap,
    tokenAnimationsRef,
    pendingFogReloadRef,
  ])

  useEffect(() => {
    if (fullScreenOpen || !selectedMap || !inlineVisionCanvasRef.current) return
    if (isMobile && (role === 'gm' ? mobileGmPane !== 'map' : mobilePlayerPane !== 'map')) return
    if (inlineFogSize.width <= 0 || inlineFogSize.height <= 0) return

    if (loadedInlineVisionCanvasRef.current !== inlineVisionCanvasRef.current) {
      loadedInlineVisionCanvasRef.current = inlineVisionCanvasRef.current
      loadedInlineVisionKeyRef.current = ''
    }

    const key = `${selectedMap.id}:${selectedMap.visionBlockImagePath || selectedMap.visionBlockImageUrl || selectedMap.visionBlockDataUrl}:${inlineFogSize.width}x${inlineFogSize.height}`
    if (loadedInlineVisionKeyRef.current === key) return

    loadedInlineVisionKeyRef.current = key
    initializeVisionCanvas(inlineVisionCanvasRef.current, selectedMap, inlineFogSize.width, inlineFogSize.height)
  }, [
    fullScreenOpen,
    inlineFogSize.height,
    inlineFogSize.width,
    isMobile,
    mobileGmPane,
    mobilePlayerPane,
    role,
    selectedMap,
  ])

  return {
    fogDrawing,
    setFogDrawing,
    inlineFogReady,
    fullFogReady,
    inlineFogCanvasRef,
    fullFogCanvasRef,
    inlineVisionCanvasRef,
    fullVisionCanvasRef,
    activeFogCanvasRef,
    activeVisionCanvasRef,
    persistFog,
    persistVisionBlocks,
    applyFogPreset,
    bumpFogSampleTick,
    stampFog,
    handleFogPointerDown,
    handleFogPointerMove,
    handleFogPointerUp,
    handleFogTouchStart,
    handleFogTouchMove,
    handleFogTouchEnd,
    invalidateInlineOverlayCache,
    invalidateFullFogCache,
    invalidateFullVisionCache,
  }
}
