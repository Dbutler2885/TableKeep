import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEventHandler,
  MouseEventHandler,
  TouchEventHandler,
  WheelEventHandler,
} from 'react'
import {
  Check,
  ChessPawn,
  ChevronLeft,
  Circle,
  Eraser,
  Eye,
  EyeOff,
  Flag,
  Map,
  Maximize2,
  Pencil,
  Square,
  SlidersHorizontal,
  SprayCan,
  Trash2,
  TvMinimalPlay,
  Upload,
  X,
} from 'lucide-react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, db, storage } from '../../firebase'
import { firebaseConfig } from '../../firebase/config'
import type { Role } from '../../types/app'
import { normalizeImageForUpload } from '../common/imageNormalization'
import { TokenIconEditor, type TokenIconConfig } from '../tokens/TokenIconEditor'
import { ConfirmModal } from '../common/ConfirmModal'

type MapRecord = {
  id: string
  name: string
  imagePath: string
  imageUrl: string
  fogDataUrl: string
  fogImagePath: string
  fogImageUrl: string
  visionBlockDataUrl: string
  visionBlockImagePath: string
  visionBlockImageUrl: string
  fullyHidden: boolean
  width: number
  height: number
  sortOrder: number
  visibleToPlayers: boolean
  updatedAtMs: number
}

type TokenRecord = {
  id: string
  x: number
  y: number
  color: string
  size: number
  sizeScale: number | null
  viewDistance: number | null
  viewDistanceScale: number | null
  party: boolean
  name: string
  revealName: boolean
  hidden: boolean
  tokenImagePath: string
  tokenImageUrl: string
  tokenImageWidth: number
  tokenImageHeight: number
}

type AnnotationRecord = {
  id: string
  x: number
  y: number
  text: string
}

type TokenAssetRecord = {
  id: string
  name: string
  imagePath: string
  imageUrl: string
  width: number
  height: number
}

type CanvasClipRect = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const TOKEN_REFERENCE_DIMENSION = 900
const DEFAULT_TOKEN_VIEW_DISTANCE = 120
const TOKEN_SIZE_MAX = 220
const TOKEN_RENDER_SIZE_MAX = 720
const BRUSH_SIZE_MIN = 8
const TOKEN_VIEW_DISTANCE_MAX = 600
const LOS_SURFACE_REVEAL_MULTIPLIER = 2.4
const LOS_BLOCKER_SAMPLE_RADIUS = 2
const STREAMING_LOCAL_REVEAL_INTERVAL_MS = 40
const STREAMING_LOCAL_REVEAL_MAX_INTERVAL_MS = 110
const FOG_COMPUTE_INTERVAL_MS = 80  // cap fog LOS recompute to ~12Hz during drag
const FOG_COMPUTE_MIN_MOVE = 4      // canvas pixels; skip recompute if token barely moved
const DRAG_PATH_SAMPLE_DISTANCE = 0.015  // normalized units between sampled waypoints
const ANIM_REVEAL_INTERVAL_MS = 66       // ~15Hz fog reveal during path animation

function interpolateAlongPath(path: { x: number; y: number }[], t: number): { x: number; y: number } {
  if (path.length === 0) return { x: 0.5, y: 0.5 }
  if (path.length === 1 || t <= 0) return path[0]
  if (t >= 1) return path[path.length - 1]
  let totalLen = 0
  const segLengths: number[] = []
  for (let i = 1; i < path.length; i++) {
    const len = Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
    segLengths.push(len)
    totalLen += len
  }
  if (totalLen === 0) return path[0]
  const target = t * totalLen
  let dist = 0
  for (let i = 0; i < segLengths.length; i++) {
    if (dist + segLengths[i] >= target) {
      const segT = segLengths[i] === 0 ? 0 : (target - dist) / segLengths[i]
      return {
        x: path[i].x + (path[i + 1].x - path[i].x) * segT,
        y: path[i].y + (path[i + 1].y - path[i].y) * segT,
      }
    }
    dist += segLengths[i]
  }
  return path[path.length - 1]
}

function pathTotalLength(path: { x: number; y: number }[]): number {
  let len = 0
  for (let i = 1; i < path.length; i++) {
    len += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y)
  }
  return len
}

type TokenPathAnimation = {
  path: { x: number; y: number }[]
  startTime: number
  duration: number
  brushSize: number
  tokenHeight: number
  party: boolean
  lastRevealTime: number
  lastRevealCanvasPos: { x: number; y: number } | null
}

export function MapsTab({ campaignId, role }: { campaignId: string; role: Role | null }) {
  const [maps, setMaps] = useState<MapRecord[]>([])
  const [selectedMapId, setSelectedMapId] = useState('')
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= 900)
  const [mobileMapView, setMobileMapView] = useState<'list' | 'detail'>('list')
  const [mobileGmPane, setMobileGmPane] = useState<'map' | 'controls'>('map')
  const [mapsLoading, setMapsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [editingMapId, setEditingMapId] = useState('')
  const [editName, setEditName] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<MapRecord | null>(null)
  const [deletingMapId, setDeletingMapId] = useState('')
  const [draggingMapId, setDraggingMapId] = useState('')
  const [dragOverMapId, setDragOverMapId] = useState('')
  const [fullScreenOpen, setFullScreenOpen] = useState(false)
  const [fullZoom, setFullZoom] = useState(1)
  const [fullPan, setFullPan] = useState({ x: 0, y: 0 })
  const [fullDragging, setFullDragging] = useState(false)
  const [fogTool, setFogTool] = useState<'reveal' | 'hide' | null>(null)
  const [visionTool, setVisionTool] = useState<'draw' | 'erase' | null>(null)
  const [fogBrushSize, setFogBrushSize] = useState(120)
  const [fogBrushStrength, setFogBrushStrength] = useState(0.7)
  const [fogDrawing, setFogDrawing] = useState(false)
  const [streamingMode, setStreamingMode] = useState(false)
  const [tokenPlaceMode, setTokenPlaceMode] = useState(false)
  const [tokenSelectMode, setTokenSelectMode] = useState(false)
  const [annotationPlaceMode, setAnnotationPlaceMode] = useState(false)
  const [tokenColor, setTokenColor] = useState('#b45309')
  const [tokenSize, setTokenSize] = useState(28)
  const [tokenAssets, setTokenAssets] = useState<TokenAssetRecord[]>([])
  const [selectedTokenAssetId, setSelectedTokenAssetId] = useState('')
  const [uploadingTokenImage, setUploadingTokenImage] = useState(false)
  const [tokens, setTokens] = useState<TokenRecord[]>([])
  const [selectedTokenIds, setSelectedTokenIds] = useState<string[]>([])
  const [tokenSelectionBox, setTokenSelectionBox] = useState<{
    start: { x: number; y: number }
    end: { x: number; y: number }
  } | null>(null)
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([])
  const [activeAnnotationId, setActiveAnnotationId] = useState('')
  const [activeAnnotationDraft, setActiveAnnotationDraft] = useState('')
  const [, setFogSampleTick] = useState(0)
  const [draggingTokenId, setDraggingTokenId] = useState('')
  const [draggingTokenIds, setDraggingTokenIds] = useState<string[]>([])
  const [, setDragTokenPosition] = useState<{ x: number; y: number } | null>(null)
  const [dragTokenPositions, setDragTokenPositions] = useState<Record<string, { x: number; y: number }> | null>(null)
  const [animatedTokenPositions, setAnimatedTokenPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [tokenDeleteCandidate, setTokenDeleteCandidate] = useState<TokenRecord | null>(null)
  const [deletingTokenId, setDeletingTokenId] = useState('')
  const [inlineBaseSize, setInlineBaseSize] = useState({ width: 0, height: 0 })
  const [fullBaseSize, setFullBaseSize] = useState({ width: 0, height: 0 })
  const [mobilePlayerZoom, setMobilePlayerZoom] = useState(1)
  const [mobilePlayerPan, setMobilePlayerPan] = useState({ x: 0, y: 0 })
  const fullDragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const fullStageRef = useRef<HTMLDivElement | null>(null)
  const inlineFogCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fullFogCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const inlineVisionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fullVisionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const inlineMapLayerRef = useRef<HTMLDivElement | null>(null)
  const fullMapLayerRef = useRef<HTMLDivElement | null>(null)
  const fogLastPointRef = useRef<{ x: number; y: number } | null>(null)
  const tokenDragOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const dragTokenPositionRef = useRef<{ x: number; y: number } | null>(null)
  const dragTokenStartPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null)
  const dragTokenPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null)
  const tokenFogTrailPointRef = useRef<{ x: number; y: number } | null>(null)
  const suppressNextMapClickRef = useRef(false)
  const tokenLongPressTimerRef = useRef<number | null>(null)
  const tokenTouchDraggingRef = useRef(false)
  const mobileTouchRef = useRef<{
    mode: 'none' | 'pan' | 'pinch'
    startZoom: number
    startDistance: number
    startPan: { x: number; y: number }
    startCenter: { x: number; y: number }
  }>({
    mode: 'none',
    startZoom: 1,
    startDistance: 0,
    startPan: { x: 0, y: 0 },
    startCenter: { x: 0, y: 0 },
  })
  const loadedInlineFogKeyRef = useRef('')
  const loadedInlineCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const loadedInlineVisionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const loadedFogKeyRef = useRef('')
  const loadedFogCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const loadedInlineVisionKeyRef = useRef('')
  const loadedVisionKeyRef = useRef('')
  const loadedVisionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const revealMaskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const tokenAnimationsRef = useRef<Record<string, TokenPathAnimation>>({})
  const animRafRef = useRef<number | null>(null)
  const animTickRef = useRef<() => void>(() => {})
  const tokensRef = useRef<TokenRecord[]>([])
  const recentlyDroppedRef = useRef(new Set<string>())
  const startTokenPathAnimationRef = useRef<(
    tokenId: string,
    fromPos: { x: number; y: number },
    path: { x: number; y: number }[],
    token: TokenRecord,
  ) => void>(() => {})

  useEffect(() => {
    const mapsQuery = query(collection(db, 'campaigns', campaignId, 'maps'))
    const unsub = onSnapshot(
      mapsQuery,
      (snap) => {
        const next = snap.docs.map((docSnap) => {
          const data = docSnap.data() as {
            name?: string
            imagePath?: string
            imageUrl?: string
            fogDataUrl?: string
            fogImagePath?: string
            fogImageUrl?: string
            visionBlockDataUrl?: string
            visionBlockImagePath?: string
            visionBlockImageUrl?: string
            fullyHidden?: boolean
            width?: number
            height?: number
            sortOrder?: number
            visibleToPlayers?: boolean
            updatedAt?: { toMillis?: () => number }
          }

          return {
            id: docSnap.id,
            name: data.name ?? `Map ${docSnap.id}`,
            imagePath: data.imagePath ?? '',
            imageUrl: data.imageUrl ?? '',
            fogDataUrl: data.fogDataUrl ?? '',
            fogImagePath: data.fogImagePath ?? '',
            fogImageUrl: data.fogImageUrl ?? '',
            visionBlockDataUrl: data.visionBlockDataUrl ?? '',
            visionBlockImagePath: data.visionBlockImagePath ?? '',
            visionBlockImageUrl: data.visionBlockImageUrl ?? '',
            fullyHidden: data.fullyHidden === true,
            width: typeof data.width === 'number' ? data.width : 0,
            height: typeof data.height === 'number' ? data.height : 0,
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : Number.MAX_SAFE_INTEGER,
            visibleToPlayers: data.visibleToPlayers === true,
            updatedAtMs: typeof data.updatedAt?.toMillis === 'function' ? data.updatedAt.toMillis() : 0,
          }
        })
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))

        setMaps(next)
        setMapsLoading(false)
      },
      (err) => {
        setMapError(err.message)
        setMapsLoading(false)
      },
    )

    return () => unsub()
  }, [campaignId])

  useEffect(() => {
    const updateMobileState = () => {
      const mobile = window.innerWidth <= 900
      setIsMobile(mobile)
      if (!mobile) {
        setMobileMapView('list')
        setMobileGmPane('map')
      }
    }

    updateMobileState()
    window.addEventListener('resize', updateMobileState)
    return () => window.removeEventListener('resize', updateMobileState)
  }, [])

  useEffect(
    () => () => {
      if (tokenLongPressTimerRef.current) {
        window.clearTimeout(tokenLongPressTimerRef.current)
        tokenLongPressTimerRef.current = null
      }
    },
    [],
  )

  useEffect(() => {
    const missingImageUrlMaps = maps.filter((map) => map.imagePath && !map.imageUrl)
    const missingFogUrlMaps = maps.filter((map) => map.fogImagePath && !map.fogImageUrl)
    const missingVisionUrlMaps = maps.filter((map) => map.visionBlockImagePath && !map.visionBlockImageUrl)
    if (missingImageUrlMaps.length === 0 && missingFogUrlMaps.length === 0 && missingVisionUrlMaps.length === 0) {
      return
    }

    void Promise.allSettled([
      ...missingImageUrlMaps.map(async (map) => {
        const url = await getDownloadURL(ref(storage, map.imagePath))
        await updateDoc(doc(db, 'campaigns', campaignId, 'maps', map.id), {
          imageUrl: url,
          updatedAt: serverTimestamp(),
        })
      }),
      ...missingFogUrlMaps.map(async (map) => {
        const url = await getDownloadURL(ref(storage, map.fogImagePath))
        await updateDoc(doc(db, 'campaigns', campaignId, 'maps', map.id), {
          fogImageUrl: url,
          updatedAt: serverTimestamp(),
        })
      }),
      ...missingVisionUrlMaps.map(async (map) => {
        const url = await getDownloadURL(ref(storage, map.visionBlockImagePath))
        await updateDoc(doc(db, 'campaigns', campaignId, 'maps', map.id), {
          visionBlockImageUrl: url,
          updatedAt: serverTimestamp(),
        })
      }),
    ])
  }, [campaignId, maps])

  useEffect(() => {
    const assetsQuery = query(collection(db, 'campaigns', campaignId, 'tokenAssets'))
    const unsub = onSnapshot(
      assetsQuery,
      (snap) => {
        const next = snap.docs
          .map((docSnap) => {
            const data = docSnap.data() as {
              name?: string
              imagePath?: string
              imageUrl?: string
              width?: number
              height?: number
            }
            return {
              id: docSnap.id,
              name: typeof data.name === 'string' ? data.name : `Asset ${docSnap.id}`,
              imagePath: typeof data.imagePath === 'string' ? data.imagePath : '',
              imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
              width: typeof data.width === 'number' ? data.width : 0,
              height: typeof data.height === 'number' ? data.height : 0,
            }
          })
          .sort((a, b) => a.name.localeCompare(b.name))
        setTokenAssets(next)
      },
      (err) => {
        setMapError(err.message)
      },
    )
    return () => unsub()
  }, [campaignId])

  useEffect(() => {
    if (!selectedMapId) {
      setTokens([])
      return
    }

    const tokensQuery = query(collection(db, 'campaigns', campaignId, 'maps', selectedMapId, 'tokens'))
    const unsub = onSnapshot(
      tokensQuery,
      (snap) => {
        const next = snap.docs.map((docSnap) => {
          const data = docSnap.data() as {
            x?: number
            y?: number
            color?: string
            size?: number
            sizeScale?: number
            viewDistance?: number
            viewDistanceScale?: number
            party?: boolean
            name?: string
            revealName?: boolean
            hidden?: boolean
            tokenImagePath?: string
            tokenImageUrl?: string
            tokenImageWidth?: number
            tokenImageHeight?: number
          }

          return {
            id: docSnap.id,
            x: typeof data.x === 'number' ? data.x : 0.5,
            y: typeof data.y === 'number' ? data.y : 0.5,
            color: typeof data.color === 'string' ? data.color : '#b45309',
            size: typeof data.size === 'number' ? data.size : 28,
            sizeScale: typeof data.sizeScale === 'number' ? data.sizeScale : null,
            viewDistance: typeof data.viewDistance === 'number' ? data.viewDistance : null,
            viewDistanceScale: typeof data.viewDistanceScale === 'number' ? data.viewDistanceScale : null,
            party: data.party === true,
            name: typeof data.name === 'string' ? data.name : '',
            revealName: data.revealName === true,
            hidden: data.hidden === true,
            tokenImagePath: typeof data.tokenImagePath === 'string' ? data.tokenImagePath : '',
            tokenImageUrl: typeof data.tokenImageUrl === 'string' ? data.tokenImageUrl : '',
            tokenImageWidth: typeof data.tokenImageWidth === 'number' ? data.tokenImageWidth : 0,
            tokenImageHeight: typeof data.tokenImageHeight === 'number' ? data.tokenImageHeight : 0,
          }
        })
        setTokens(next)

        // Trigger path animations for tokens moved by other clients.
        // tokensRef.current still holds pre-update positions here since setTokens
        // schedules a React update (doesn't flush synchronously).
        snap.docChanges().forEach((change) => {
          if (change.type !== 'modified') return
          const tokenId = change.doc.id
          // Skip tokens this client just dropped — optimistic update already placed them.
          if (recentlyDroppedRef.current.has(tokenId)) return
          const rawPath = (change.doc.data() as { path?: unknown }).path
          if (!Array.isArray(rawPath) || rawPath.length < 2) return
          const path = (rawPath as unknown[])
            .filter((p): p is { x: number; y: number } =>
              typeof p === 'object' &&
              p !== null &&
              typeof (p as Record<string, unknown>).x === 'number' &&
              typeof (p as Record<string, unknown>).y === 'number',
            )
            .map((p) => ({ x: p.x, y: p.y }))
          if (path.length < 2) return
          const fromToken = tokensRef.current.find((t) => t.id === tokenId)
          if (!fromToken) return
          const updatedToken = next.find((t) => t.id === tokenId)
          if (!updatedToken) return
          startTokenPathAnimationRef.current(tokenId, { x: fromToken.x, y: fromToken.y }, path, updatedToken)
        })
      },
      (err) => {
        setMapError(err.message)
      },
    )

    return () => unsub()
  }, [campaignId, selectedMapId])

  useEffect(() => {
    if (role !== 'gm') {
      setAnnotations([])
      return
    }

    if (!selectedMapId) {
      setAnnotations([])
      return
    }

    const annotationsQuery = query(collection(db, 'campaigns', campaignId, 'maps', selectedMapId, 'annotations'))
    const unsub = onSnapshot(
      annotationsQuery,
      (snap) => {
        const next = snap.docs.map((docSnap) => {
          const data = docSnap.data() as {
            x?: number
            y?: number
            text?: string
          }

          return {
            id: docSnap.id,
            x: typeof data.x === 'number' ? data.x : 0.5,
            y: typeof data.y === 'number' ? data.y : 0.5,
            text: typeof data.text === 'string' ? data.text : '',
          }
        })
        setAnnotations(next)
      },
      (err) => {
        setMapError(err.message)
      },
    )

    return () => unsub()
  }, [campaignId, role, selectedMapId])

  const visibleMaps = useMemo(
    () => (role === 'gm' ? maps : maps.filter((map) => map.visibleToPlayers)),
    [maps, role],
  )

  useEffect(() => {
    setSelectedMapId((current) => {
      if (visibleMaps.length === 0) return ''
      const stillExists = visibleMaps.find((map) => map.id === current)
      return stillExists ? stillExists.id : visibleMaps[0].id
    })
  }, [visibleMaps])

  const selectedMap = visibleMaps.find((map) => map.id === selectedMapId) ?? null
  const showListPane = !isMobile || mobileMapView === 'list'
  const showMapPane = !isMobile || mobileMapView === 'detail'
  const fogDisplayOpacity = role === 'gm' ? (streamingMode ? 1 : 0.45) : 1
  const visionOverlayOpacity = role === 'gm' && !streamingMode ? 0.8 : 0
  const usingFullScreenCanvas = fullScreenOpen && !isMobile
  const activeFogCanvasRef = usingFullScreenCanvas ? fullFogCanvasRef : inlineFogCanvasRef
  const activeVisionCanvasRef = usingFullScreenCanvas ? fullVisionCanvasRef : inlineVisionCanvasRef
  const activeMapLayerRef = usingFullScreenCanvas ? fullMapLayerRef : inlineMapLayerRef
  const activeMapDimension = Math.max(
    1,
    Math.min(
      usingFullScreenCanvas ? fullBaseSize.width : inlineBaseSize.width,
      usingFullScreenCanvas ? fullBaseSize.height : inlineBaseSize.height,
    ),
  )
  const activeAnnotation = annotations.find((annotation) => annotation.id === activeAnnotationId) ?? null
  const selectedTokenAsset = tokenAssets.find((asset) => asset.id === selectedTokenAssetId) ?? null
  const selectionRectStyle = useMemo<React.CSSProperties | null>(() => {
    if (!tokenSelectionBox) return null
    const minX = Math.min(tokenSelectionBox.start.x, tokenSelectionBox.end.x)
    const minY = Math.min(tokenSelectionBox.start.y, tokenSelectionBox.end.y)
    const maxX = Math.max(tokenSelectionBox.start.x, tokenSelectionBox.end.x)
    const maxY = Math.max(tokenSelectionBox.start.y, tokenSelectionBox.end.y)
    return {
      left: `${minX * 100}%`,
      top: `${minY * 100}%`,
      width: `${(maxX - minX) * 100}%`,
      height: `${(maxY - minY) * 100}%`,
    }
  }, [tokenSelectionBox])
  const bumpFogSampleTick = () => {
    setFogSampleTick((value) => value + 1)
  }

  const gmTokenNameClassName = (token: TokenRecord) => {
    if (streamingMode) {
      return token.revealName ? 'map-token-name gm-hover-only' : 'map-token-name gm-hidden'
    }
    return token.revealName ? 'map-token-name' : 'map-token-name gm-hover-only'
  }

  const isMobileZoomMapView = isMobile && (role !== 'gm' || mobileGmPane === 'map')

  const renderTokenSize = (token: TokenRecord) => {
    const scale = token.sizeScale ?? token.size / TOKEN_REFERENCE_DIMENSION
    return Math.max(10, Math.min(TOKEN_RENDER_SIZE_MAX, Math.round(scale * activeMapDimension)))
  }
  const renderTokenDimensions = (token: TokenRecord) => {
    const baseSize = renderTokenSize(token)
    const rawWidth = token.tokenImageWidth > 0 ? token.tokenImageWidth : 0
    const rawHeight = token.tokenImageHeight > 0 ? token.tokenImageHeight : 0
    if (rawWidth <= 0 || rawHeight <= 0) {
      return { width: baseSize, height: baseSize, baseSize }
    }

    const ratio = rawWidth / rawHeight
    if (ratio >= 1) {
      return {
        width: baseSize,
        height: Math.max(8, Math.round(baseSize / ratio)),
        baseSize,
      }
    }
    return {
      width: Math.max(8, Math.round(baseSize * ratio)),
      height: baseSize,
      baseSize,
    }
  }
  const renderTokenViewDistance = (token: TokenRecord) => {
    const fallbackScale = DEFAULT_TOKEN_VIEW_DISTANCE / TOKEN_REFERENCE_DIMENSION
    const scale = token.viewDistanceScale ?? fallbackScale
    return Math.max(BRUSH_SIZE_MIN, Math.min(TOKEN_VIEW_DISTANCE_MAX, Math.round(scale * activeMapDimension)))
  }
  const tokenViewDistanceSliderValue = (token: TokenRecord) => {
    if (typeof token.viewDistance === 'number') return token.viewDistance
    return DEFAULT_TOKEN_VIEW_DISTANCE
  }
  const renderTokenNameStyle = (token: TokenRecord): React.CSSProperties => {
    return {
      color: token.color,
      fontSize: '10px',
      transform: 'translate(-50%, 8px)',
    }
  }
  const effectiveFogBrushSize = Math.max(
    BRUSH_SIZE_MIN,
    Math.min(320, Math.round((fogBrushSize / TOKEN_REFERENCE_DIMENSION) * activeMapDimension)),
  )
  const autosizeAnnotationTextarea = useCallback((textarea: HTMLTextAreaElement | null) => {
    if (!textarea) return
    textarea.style.width = 'auto'
    textarea.style.height = 'auto'

    const viewportWidth = Math.max(window.innerWidth, 320)
    const viewportHeight = Math.max(window.innerHeight, 320)
    const minWidth = 168
    const maxWidth = Math.min(420, Math.floor(viewportWidth * 0.56))
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, Math.ceil(textarea.scrollWidth) + 2))
    textarea.style.width = `${nextWidth}px`

    const minHeight = 56
    const maxHeight = Math.min(280, Math.floor(viewportHeight * 0.5))
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, Math.ceil(textarea.scrollHeight) + 2))
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [])

  const isTokenVisible = (token: TokenRecord) => {
    if (token.hidden) return false
    if (role === 'gm' && !streamingMode) return true
    if (token.party) return true

    const canvas = activeFogCanvasRef.current
    if (!canvas) return selectedMap ? !selectedMap.fullyHidden : true

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return true

    const x = Math.max(0, Math.min(canvas.width - 1, Math.round(token.x * canvas.width)))
    const y = Math.max(0, Math.min(canvas.height - 1, Math.round(token.y * canvas.height)))

    try {
      const alpha = ctx.getImageData(x, y, 1, 1).data[3]
      return alpha < 16
    } catch {
      return true
    }
  }

  const handleMapUpload: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''

    setMapError(null)
    setUploading(true)

    try {
      const mapRef = doc(collection(db, 'campaigns', campaignId, 'maps'))
      const storagePath = `campaigns/${campaignId}/maps/${mapRef.id}`
      const primaryStorageRef = ref(storage, storagePath)
      let imageUrl = ''

      // Ensure auth token is fresh before Storage writes.
      await auth.currentUser?.getIdToken(true)

      await uploadBytes(primaryStorageRef, file)

      await setDoc(mapRef, {
        name: file.name.replace(/\.[^/.]+$/, ''),
        imagePath: storagePath,
        imageUrl: '',
        fogDataUrl: '',
        fogImagePath: '',
        fogImageUrl: '',
        visionBlockDataUrl: '',
        visionBlockImagePath: '',
        visionBlockImageUrl: '',
        fullyHidden: false,
        width: 0,
        height: 0,
        sortOrder: maps.length,
        visibleToPlayers: false,
        fogEnabled: true,
        fogGridSize: 128,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      try {
        imageUrl = await getDownloadURL(primaryStorageRef)
        await updateDoc(mapRef, {
          imageUrl,
          updatedAt: serverTimestamp(),
        })
      } catch {
        // URL resolution can fail transiently; a background resolver effect retries.
      }

      setSelectedMapId(mapRef.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setMapError(`Upload failed: ${message}. Bucket=${firebaseConfig.storageBucket}`)
    } finally {
      setUploading(false)
    }
  }

  const startRename = (map: MapRecord) => {
    setEditingMapId(map.id)
    setEditName(map.name)
  }

  const saveRename = async (mapId: string) => {
    const name = editName.trim()
    if (!name) return
    await updateDoc(doc(db, 'campaigns', campaignId, 'maps', mapId), {
      name,
      updatedAt: serverTimestamp(),
    })
    setEditingMapId('')
    setEditName('')
  }

  const deleteMap = async () => {
    if (!deleteCandidate) return

    setDeletingMapId(deleteCandidate.id)
    setMapError(null)

    try {
      if (deleteCandidate.imagePath) {
        await deleteObject(ref(storage, deleteCandidate.imagePath))
      }
      if (deleteCandidate.fogImagePath) {
        await deleteObject(ref(storage, deleteCandidate.fogImagePath))
      }
      if (deleteCandidate.visionBlockImagePath) {
        await deleteObject(ref(storage, deleteCandidate.visionBlockImagePath))
      }

      await deleteDoc(doc(db, 'campaigns', campaignId, 'maps', deleteCandidate.id))
      setDeleteCandidate(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed'
      setMapError(`Delete failed: ${message}`)
    } finally {
      setDeletingMapId('')
    }
  }

  const togglePlayerVisibility = async (map: MapRecord, checked: boolean) => {
    await updateDoc(doc(db, 'campaigns', campaignId, 'maps', map.id), {
      visibleToPlayers: checked,
      updatedAt: serverTimestamp(),
    })
  }

  const persistMapOrder = async (ordered: MapRecord[]) => {
    const batch = writeBatch(db)
    ordered.forEach((map, index) => {
      batch.update(doc(db, 'campaigns', campaignId, 'maps', map.id), {
        sortOrder: index,
        updatedAt: serverTimestamp(),
      })
    })
    await batch.commit()
  }

  const handleDragStart = (mapId: string) => {
    setDraggingMapId(mapId)
    setDragOverMapId('')
  }

  const selectMap = (mapId: string) => {
    setSelectedMapId(mapId)
    setMobilePlayerZoom(1)
    setMobilePlayerPan({ x: 0, y: 0 })
    mobileTouchRef.current.mode = 'none'
    if (isMobile) {
      setMobileMapView('detail')
      setMobileGmPane('map')
    }
  }

  const openFullScreen = () => {
    setFullZoom(1)
    setFullPan({ x: 0, y: 0 })
    setFullDragging(false)
    setFogDrawing(false)
    fullDragStartRef.current = null
    loadedFogKeyRef.current = ''
    setFullScreenOpen(true)
  }

  const closeFullScreen = () => {
    setFullDragging(false)
    setFogDrawing(false)
    fullDragStartRef.current = null
    setFullScreenOpen(false)
  }

  const handleFullWheel: WheelEventHandler<HTMLDivElement> = (event) => {
    const target = event.target as HTMLElement | null
    if (target?.closest('.map-annotation-popover')) {
      return
    }
    event.preventDefault()

    const factor = Math.exp(-event.deltaY * 0.0015)
    const rect = event.currentTarget.getBoundingClientRect()
    const localX = event.clientX - rect.left - rect.width / 2
    const localY = event.clientY - rect.top - rect.height / 2
    setFullZoom((currentZoom) => {
      const nextZoom = Math.min(5, Math.max(0.5, currentZoom * factor))
      const zoomRatio = nextZoom / currentZoom

      setFullPan((currentPan) => ({
        x: currentPan.x - localX * (zoomRatio - 1),
        y: currentPan.y - localY * (zoomRatio - 1),
      }))

      return nextZoom
    })
  }

  const handleFullMouseDown: MouseEventHandler<HTMLDivElement> = (event) => {
    if (event.button !== 1) return
    event.preventDefault()
    setFullDragging(true)
    fullDragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: fullPan.x,
      panY: fullPan.y,
    }
  }

  const handleFullMouseMove: MouseEventHandler<HTMLDivElement> = (event) => {
    if (!fullDragging || !fullDragStartRef.current) return

    const deltaX = event.clientX - fullDragStartRef.current.x
    const deltaY = event.clientY - fullDragStartRef.current.y
    setFullPan({
      x: fullDragStartRef.current.panX + deltaX,
      y: fullDragStartRef.current.panY + deltaY,
    })
  }

  const endFullDrag = () => {
    setFullDragging(false)
    fullDragStartRef.current = null
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

    const fogSource = map.fogDataUrl || map.fogImageUrl
    if (!fogSource) {
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = 'rgba(0, 0, 0, 1)'
      ctx.fillRect(0, 0, width, height)
      bumpFogSampleTick()
      return
    }

    const fogImage = new Image()
    fogImage.crossOrigin = 'anonymous'
    fogImage.onload = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(fogImage, 0, 0, width, height)
      bumpFogSampleTick()
    }
    fogImage.src = fogSource
  }

  const getFogCacheKey = (map: MapRecord, width: number, height: number) => {
    return `${map.id}:${map.updatedAtMs}:${width}x${height}`
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

    const sources = [map.visionBlockDataUrl, map.visionBlockImageUrl].filter(Boolean)
    if (sources.length === 0) {
      ctx.clearRect(0, 0, width, height)
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
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(blockImage, 0, 0, width, height)
      }
      blockImage.onerror = () => {
        loadAt(index + 1)
      }
      blockImage.src = source
    }
    loadAt(0)
  }

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
    mode: 'draw' | 'erase',
    brushSize = effectiveFogBrushSize,
  ) => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    const radius = brushSize / 2

    ctx.save()
    ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over'
    ctx.fillStyle = 'rgba(176, 44, 44, 0.95)'
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  const drawVisionStroke = (
    canvas: HTMLCanvasElement,
    from: { x: number; y: number },
    to: { x: number; y: number },
    mode: 'draw' | 'erase',
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

  const getFullscreenVisibleCanvasRect = (canvas: HTMLCanvasElement): CanvasClipRect | null => {
    const stage = fullStageRef.current
    if (!stage) return null

    const stageRect = stage.getBoundingClientRect()
    const canvasRect = canvas.getBoundingClientRect()
    if (stageRect.width <= 0 || stageRect.height <= 0 || canvasRect.width <= 0 || canvasRect.height <= 0) {
      return null
    }

    const intersectionLeft = Math.max(stageRect.left, canvasRect.left)
    const intersectionTop = Math.max(stageRect.top, canvasRect.top)
    const intersectionRight = Math.min(stageRect.right, canvasRect.right)
    const intersectionBottom = Math.min(stageRect.bottom, canvasRect.bottom)
    if (intersectionRight <= intersectionLeft || intersectionBottom <= intersectionTop) return null

    const leftRatio = (intersectionLeft - canvasRect.left) / canvasRect.width
    const topRatio = (intersectionTop - canvasRect.top) / canvasRect.height
    const rightRatio = (intersectionRight - canvasRect.left) / canvasRect.width
    const bottomRatio = (intersectionBottom - canvasRect.top) / canvasRect.height

    return {
      minX: Math.max(0, Math.floor(leftRatio * canvas.width)),
      minY: Math.max(0, Math.floor(topRatio * canvas.height)),
      maxX: Math.min(canvas.width - 1, Math.ceil(rightRatio * canvas.width)),
      maxY: Math.min(canvas.height - 1, Math.ceil(bottomRatio * canvas.height)),
    }
  }

  const revealFromTokenPoint = (
    fogCanvas: HTMLCanvasElement,
    visionCanvas: HTMLCanvasElement | null,
    center: { x: number; y: number },
    brushSize: number,
    clipRect?: CanvasClipRect | null,
  ) => {
    const radius = Math.max(1, brushSize / 2)
    if (
      clipRect &&
      (center.x < clipRect.minX - radius ||
        center.x > clipRect.maxX + radius ||
        center.y < clipRect.minY - radius ||
        center.y > clipRect.maxY + radius)
    ) {
      return
    }

    if (!visionCanvas) {
      stampFog(fogCanvas, center.x, center.y, 'reveal', brushSize)
      return
    }

    const fogCtx = fogCanvas.getContext('2d', { willReadFrequently: true })
    const visionCtx = visionCanvas.getContext('2d', { willReadFrequently: true })
    if (!fogCtx || !visionCtx) return

    const minX = Math.max(0, Math.floor(center.x - radius - 2))
    const minY = Math.max(0, Math.floor(center.y - radius - 2))
    const maxX = Math.min(fogCanvas.width - 1, Math.ceil(center.x + radius + 2))
    const maxY = Math.min(fogCanvas.height - 1, Math.ceil(center.y + radius + 2))
    const clippedMinX = clipRect ? Math.max(minX, clipRect.minX) : minX
    const clippedMinY = clipRect ? Math.max(minY, clipRect.minY) : minY
    const clippedMaxX = clipRect ? Math.min(maxX, clipRect.maxX) : maxX
    const clippedMaxY = clipRect ? Math.min(maxY, clipRect.maxY) : maxY
    if (clippedMaxX < clippedMinX || clippedMaxY < clippedMinY) return
    const regionWidth = Math.max(1, clippedMaxX - clippedMinX + 1)
    const regionHeight = Math.max(1, clippedMaxY - clippedMinY + 1)
    const visionData = visionCtx.getImageData(clippedMinX, clippedMinY, regionWidth, regionHeight).data

    let maskCanvas = revealMaskCanvasRef.current
    if (!maskCanvas) {
      maskCanvas = document.createElement('canvas')
      revealMaskCanvasRef.current = maskCanvas
    }
    if (maskCanvas.width !== fogCanvas.width || maskCanvas.height !== fogCanvas.height) {
      maskCanvas.width = fogCanvas.width
      maskCanvas.height = fogCanvas.height
    }
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })
    if (!maskCtx) return
    maskCtx.clearRect(clippedMinX, clippedMinY, regionWidth, regionHeight)
    maskCtx.fillStyle = 'rgba(0,0,0,1)'

    const rays = Math.max(220, Math.min(1800, Math.round(radius * 5.4)))
    const rayStep = (Math.PI * 2) / rays
    const distStep = 1
    const dot = Math.max(1, radius * 0.03)
    const surfaceDot = Math.max(2, dot * LOS_SURFACE_REVEAL_MULTIPLIER)
    const alphaAt = (x: number, y: number) => {
      const lx = x - clippedMinX
      const ly = y - clippedMinY
      if (lx < 0 || ly < 0 || lx >= regionWidth || ly >= regionHeight) return 0
      return visionData[(ly * regionWidth + lx) * 4 + 3]
    }
    const isBlockedAt = (x: number, y: number) => {
      for (let oy = -LOS_BLOCKER_SAMPLE_RADIUS; oy <= LOS_BLOCKER_SAMPLE_RADIUS; oy += 1) {
        for (let ox = -LOS_BLOCKER_SAMPLE_RADIUS; ox <= LOS_BLOCKER_SAMPLE_RADIUS; ox += 1) {
          if (alphaAt(x + ox, y + oy) > 20) return true
        }
      }
      return false
    }

    for (let i = 0; i < rays; i += 1) {
      const angle = i * rayStep
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      for (let dist = 0; dist <= radius; dist += distStep) {
        const x = Math.round(center.x + cos * dist)
        const y = Math.round(center.y + sin * dist)
        if (x < clippedMinX || x > clippedMaxX || y < clippedMinY || y > clippedMaxY) break
        const blocked = isBlockedAt(x, y)
        maskCtx.beginPath()
        maskCtx.arc(x, y, dot, 0, Math.PI * 2)
        maskCtx.fill()
        if (blocked) {
          // Reveal the blocking surface itself (wall/house edge), but not beyond it.
          maskCtx.beginPath()
          maskCtx.arc(x, y, surfaceDot, 0, Math.PI * 2)
          maskCtx.fill()
          break
        }
      }
    }

    fogCtx.save()
    fogCtx.globalCompositeOperation = 'destination-out'
    fogCtx.drawImage(
      maskCanvas,
      clippedMinX,
      clippedMinY,
      regionWidth,
      regionHeight,
      clippedMinX,
      clippedMinY,
      regionWidth,
      regionHeight,
    )
    fogCtx.restore()
  }

  const revealFromTokenStroke = (
    fogCanvas: HTMLCanvasElement,
    visionCanvas: HTMLCanvasElement | null,
    from: { x: number; y: number },
    to: { x: number; y: number },
    brushSize: number,
    clipRect?: CanvasClipRect | null,
  ) => {
    if (clipRect) {
      const radius = Math.max(1, brushSize / 2)
      const minX = Math.min(from.x, to.x) - radius
      const minY = Math.min(from.y, to.y) - radius
      const maxX = Math.max(from.x, to.x) + radius
      const maxY = Math.max(from.y, to.y) + radius
      if (
        maxX < clipRect.minX ||
        maxY < clipRect.minY ||
        minX > clipRect.maxX ||
        minY > clipRect.maxY
      ) {
        return
      }
    }

    const deltaX = to.x - from.x
    const deltaY = to.y - from.y
    const distance = Math.hypot(deltaX, deltaY)
    const step = Math.max(2, brushSize * 0.14)
    const steps = Math.max(1, Math.ceil(distance / step))
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps
      revealFromTokenPoint(
        fogCanvas,
        visionCanvas,
        { x: from.x + deltaX * t, y: from.y + deltaY * t },
        brushSize,
        clipRect,
      )
    }
  }

  // Keep tokensRef in sync with the latest tokens state so Firestore callbacks can
  // read the pre-update positions without a stale closure.
  tokensRef.current = tokens

  // Reassigned each render so the rAF callbacks always hold fresh closures over
  // revealFromTokenPoint / revealFromTokenStroke / renderToken* / activeFogCanvasRef.
  animTickRef.current = () => {
    const now = Date.now()
    const nextPositions: Record<string, { x: number; y: number }> = {}
    let hasActive = false

    for (const [tokenId, anim] of Object.entries(tokenAnimationsRef.current)) {
      const t = Math.min(1, (now - anim.startTime) / anim.duration)
      const pos = interpolateAlongPath(anim.path, t)
      nextPositions[tokenId] = pos

      // Fog reveal at ~15Hz for party tokens on clients that have an active fog canvas.
      if (anim.party && activeFogCanvasRef.current && activeVisionCanvasRef.current) {
        if (now - anim.lastRevealTime >= ANIM_REVEAL_INTERVAL_MS) {
          const canvasPoint = {
            x: pos.x * activeFogCanvasRef.current.width,
            y: Math.max(0, pos.y * activeFogCanvasRef.current.height - anim.tokenHeight * 0.5),
          }
          if (anim.lastRevealCanvasPos) {
            revealFromTokenStroke(
              activeFogCanvasRef.current,
              activeVisionCanvasRef.current,
              anim.lastRevealCanvasPos,
              canvasPoint,
              anim.brushSize,
              null,
            )
          } else {
            revealFromTokenPoint(
              activeFogCanvasRef.current,
              activeVisionCanvasRef.current,
              canvasPoint,
              anim.brushSize,
              null,
            )
          }
          anim.lastRevealCanvasPos = canvasPoint
          anim.lastRevealTime = now
        }
      }

      if (t < 1) {
        hasActive = true
      } else {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete tokenAnimationsRef.current[tokenId]
      }
    }

    if (hasActive || Object.keys(tokenAnimationsRef.current).length > 0) {
      setAnimatedTokenPositions({ ...nextPositions })
      animRafRef.current = requestAnimationFrame(animTickRef.current)
    } else {
      setAnimatedTokenPositions({})
      animRafRef.current = null
    }
  }

  startTokenPathAnimationRef.current = (tokenId, fromPos, path, token) => {
    const brushSize = renderTokenViewDistance(token)
    const { height: tokenHeight } = renderTokenDimensions(token)
    const fullPath = [fromPos, ...path]
    const totalLen = pathTotalLength(fullPath)
    const duration = Math.min(1500, Math.max(400, totalLen * 1200))
    tokenAnimationsRef.current[tokenId] = {
      path: fullPath,
      startTime: Date.now(),
      duration,
      brushSize,
      tokenHeight,
      party: token.party,
      lastRevealTime: 0,
      lastRevealCanvasPos: null,
    }
    if (animRafRef.current === null) {
      animRafRef.current = requestAnimationFrame(animTickRef.current)
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
      const activeSize = usingFullScreenCanvas ? fullBaseSize : inlineBaseSize
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

  const getTokenDropPoint = (clientX: number, clientY: number) => {
    const canvas = activeFogCanvasRef.current
    if (canvas) {
      const rect = canvas.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0 && canvas.width > 0 && canvas.height > 0) {
        const scaleX = canvas.width / rect.width
        const scaleY = canvas.height / rect.height
        const canvasX = (clientX - rect.left) * scaleX
        const canvasY = (clientY - rect.top) * scaleY
        return {
          x: Math.max(0, Math.min(1, canvasX / canvas.width)),
          y: Math.max(0, Math.min(1, canvasY / canvas.height)),
        }
      }
    }

    const layer = activeMapLayerRef.current
    if (!layer) return null
    const rect = layer.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    }
  }

  const tokenPointToCanvasPoint = (point: { x: number; y: number }, tokenSizePx = 0) => {
    const canvas = activeFogCanvasRef.current
    if (!canvas) return null
    const yOffset = Math.max(0, tokenSizePx * 0.5)
    return {
      x: point.x * canvas.width,
      y: Math.max(0, point.y * canvas.height - yOffset),
    }
  }

  const updateToken = async (
    tokenId: string,
    updates: Partial<
      Pick<
        TokenRecord,
        'color' | 'size' | 'sizeScale' | 'viewDistance' | 'viewDistanceScale' | 'party' | 'name' | 'revealName' | 'hidden'
      >
    >,
  ) => {
    if (!selectedMap || role !== 'gm') return
    const nextUpdates = { ...updates } as typeof updates
    if (typeof nextUpdates.viewDistance === 'number' && typeof nextUpdates.viewDistanceScale !== 'number') {
      nextUpdates.viewDistanceScale = nextUpdates.viewDistance / TOKEN_REFERENCE_DIMENSION
    }
    await updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'tokens', tokenId), {
      ...nextUpdates,
      updatedAt: serverTimestamp(),
    })
  }

  const deleteToken = async (tokenId: string) => {
    if (!selectedMap || role !== 'gm') return
    await deleteDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'tokens', tokenId))
  }

  const requestDeleteToken = (tokenId: string) => {
    const token = tokens.find((entry) => entry.id === tokenId)
    if (!token) return
    setTokenDeleteCandidate(token)
  }

  const confirmDeleteToken = async () => {
    if (!tokenDeleteCandidate) return
    setDeletingTokenId(tokenDeleteCandidate.id)
    try {
      await deleteToken(tokenDeleteCandidate.id)
      setTokenDeleteCandidate(null)
    } finally {
      setDeletingTokenId('')
    }
  }

  const tokenDisplayName = (token: TokenRecord, index: number) => {
    const name = token.name.trim()
    return name || `Token ${index + 1}`
  }

  const hideTokenOnMap = async (tokenId: string) => {
    if (role !== 'gm') return
    setTokens((prev) => prev.map((token) => (token.id === tokenId ? { ...token, hidden: true } : token)))
    await updateToken(tokenId, { hidden: true })
  }

  const uploadTokenImage = async (file: File, assetName?: string) => {
    if (role !== 'gm') return
    setUploadingTokenImage(true)
    setMapError(null)
    try {
      await auth.currentUser?.getIdToken(true)
      const normalized = await normalizeImageForUpload(file, {
        maxWidth: 1024,
        maxHeight: 1024,
        preferType: 'image/webp',
        quality: 0.9,
      })
      const safeName = normalized.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const tokenAssetPath = `campaigns/${campaignId}/token-assets/${Date.now()}-${safeName}`
      const tokenAssetRef = ref(storage, tokenAssetPath)
      await uploadBytes(tokenAssetRef, normalized.file, { contentType: normalized.file.type })
      const url = await getDownloadURL(tokenAssetRef)
      const name = (assetName?.trim() || file.name.replace(/\.[^/.]+$/, '')).slice(0, 80)
      const assetRef = await addDoc(collection(db, 'campaigns', campaignId, 'tokenAssets'), {
        name,
        imagePath: tokenAssetPath,
        imageUrl: url,
        width: normalized.width,
        height: normalized.height,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setTokenAssets((prev) =>
        [
          ...prev,
          { id: assetRef.id, name, imagePath: tokenAssetPath, imageUrl: url, width: normalized.width, height: normalized.height },
        ].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      )
      setSelectedTokenAssetId(assetRef.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload token image'
      setMapError(`Token upload failed: ${message}`)
    } finally {
      setUploadingTokenImage(false)
    }
  }

  const renderTokenGlyph = (token: TokenRecord) => {
    const dimensions = renderTokenDimensions(token)
    if (token.tokenImageUrl) {
      return (
        <img
          src={token.tokenImageUrl}
          alt=""
          className="map-token-image"
          style={{ width: `${dimensions.width}px`, height: `${dimensions.height}px` }}
          draggable={false}
        />
      )
    }
    return <ChessPawn size={dimensions.baseSize} />
  }

  const placeToken = async (clientX: number, clientY: number) => {
    if (!selectedMap || role !== 'gm') return
    const point = getTokenDropPoint(clientX, clientY)
    if (!point) return
    const sizeScale = tokenSize / TOKEN_REFERENCE_DIMENSION

    await addDoc(collection(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'tokens'), {
      x: point.x,
      y: point.y,
      color: tokenColor,
      size: tokenSize,
      sizeScale,
      viewDistance: DEFAULT_TOKEN_VIEW_DISTANCE,
      viewDistanceScale: DEFAULT_TOKEN_VIEW_DISTANCE / TOKEN_REFERENCE_DIMENSION,
      party: false,
      name: selectedTokenAsset?.name ?? '',
      revealName: false,
      hidden: false,
      tokenImagePath: selectedTokenAsset?.imagePath ?? '',
      tokenImageUrl: selectedTokenAsset?.imageUrl ?? '',
      tokenImageWidth: selectedTokenAsset?.width ?? 0,
      tokenImageHeight: selectedTokenAsset?.height ?? 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  const placeAnnotation = async (clientX: number, clientY: number) => {
    if (!selectedMap || role !== 'gm') return
    const point = getTokenDropPoint(clientX, clientY)
    if (!point) return
    const annotationRef = await addDoc(collection(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'annotations'), {
      x: point.x,
      y: point.y,
      text: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    setActiveAnnotationId(annotationRef.id)
    setActiveAnnotationDraft('')
  }

  const commitActiveAnnotation = async () => {
    if (!selectedMap || role !== 'gm' || !activeAnnotation) return
    const nextText = activeAnnotationDraft.trim()
    if (nextText === activeAnnotation.text.trim()) return
    await updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'annotations', activeAnnotation.id), {
      text: nextText,
      updatedAt: serverTimestamp(),
    })
  }

  const deleteAnnotation = async (annotationId: string) => {
    if (!selectedMap || role !== 'gm') return
    await deleteDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'annotations', annotationId))
  }

  const handleMapLayerMouseDown: MouseEventHandler<HTMLDivElement> = (event) => {
    if (role !== 'gm') return
    if (!tokenSelectMode || event.button !== 0) return
    const target = event.target as HTMLElement
    if (target.closest('.map-token,.map-annotation-btn,.map-annotation-popover')) return
    const point = getTokenDropPoint(event.clientX, event.clientY)
    if (!point) return
    event.preventDefault()
    event.stopPropagation()
    setTokenSelectionBox({ start: point, end: point })
  }

  const handleMapLayerClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (role !== 'gm') return
    if (suppressNextMapClickRef.current) {
      suppressNextMapClickRef.current = false
      return
    }
    if ((event.target as HTMLElement).closest('.map-token,.map-annotation-btn,.map-annotation-popover')) return
    event.preventDefault()
    if (selectedTokenIds.length > 0) {
      setSelectedTokenIds([])
      return
    }
    if (tokenSelectMode) return
    if (annotationPlaceMode) {
      void placeAnnotation(event.clientX, event.clientY)
      return
    }
    if (!tokenPlaceMode) return
    void placeToken(event.clientX, event.clientY)
  }

  useEffect(() => {
    if (role !== 'gm' || !tokenSelectionBox) return

    const handleMove = (event: MouseEvent) => {
      const point = getTokenDropPoint(event.clientX, event.clientY)
      if (!point) return
      setTokenSelectionBox((current) => (current ? { ...current, end: point } : current))
    }

    const handleUp = (event: MouseEvent) => {
      const point = getTokenDropPoint(event.clientX, event.clientY) ?? tokenSelectionBox.end
      const minX = Math.min(tokenSelectionBox.start.x, point.x)
      const minY = Math.min(tokenSelectionBox.start.y, point.y)
      const maxX = Math.max(tokenSelectionBox.start.x, point.x)
      const maxY = Math.max(tokenSelectionBox.start.y, point.y)
      const width = maxX - minX
      const height = maxY - minY
      if (width < 0.005 && height < 0.005) {
        setSelectedTokenIds([])
      } else {
        setSelectedTokenIds(
          tokens
            .filter((token) => token.x >= minX && token.x <= maxX && token.y >= minY && token.y <= maxY)
            .map((token) => token.id),
        )
      }
      setTokenSelectionBox(null)
      suppressNextMapClickRef.current = true
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [getTokenDropPoint, role, tokenSelectionBox, tokens])

  useEffect(() => {
    if (!activeAnnotationId) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('.map-annotation-popover,.map-annotation-btn')) return
      void commitActiveAnnotation()
      setActiveAnnotationId('')
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [activeAnnotationId, activeAnnotationDraft, activeAnnotation, selectedMap, role, campaignId])

  useEffect(() => {
    setActiveAnnotationId('')
    setActiveAnnotationDraft('')
    setSelectedTokenIds([])
    setTokenSelectionBox(null)
  }, [selectedMapId])

  useEffect(() => {
    setSelectedTokenIds((current) => current.filter((tokenId) => tokens.some((token) => token.id === tokenId)))
  }, [tokens])

  useEffect(() => {
    if (!streamingMode) return
    setActiveAnnotationId('')
  }, [streamingMode])

  const clampMobileZoom = (value: number) => Math.min(4, Math.max(1, value))

  const touchDistance = (touches: React.TouchList) => {
    const [a, b] = [touches[0], touches[1]]
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
  }

  const touchCenter = (touches: React.TouchList) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  })

  const handleMobilePlayerTouchStart: TouchEventHandler<HTMLDivElement> = (event) => {
    if (!isMobileZoomMapView) return

    if (event.touches.length === 2) {
      const center = touchCenter(event.touches)
      mobileTouchRef.current = {
        mode: 'pinch',
        startZoom: mobilePlayerZoom,
        startDistance: touchDistance(event.touches),
        startPan: mobilePlayerPan,
        startCenter: center,
      }
      return
    }

    if (role === 'gm' && (fogTool || visionTool)) return

    if (event.touches.length === 1 && mobilePlayerZoom > 1) {
      const touch = event.touches[0]
      mobileTouchRef.current = {
        mode: 'pan',
        startZoom: mobilePlayerZoom,
        startDistance: 0,
        startPan: mobilePlayerPan,
        startCenter: { x: touch.clientX, y: touch.clientY },
      }
    }
  }

  const handleMobilePlayerTouchMove: TouchEventHandler<HTMLDivElement> = (event) => {
    if (!isMobileZoomMapView) return
    if (event.touches.length === 0) return

    if (mobileTouchRef.current.mode === 'pinch' && event.touches.length >= 2) {
      event.preventDefault()
      const currentDistance = touchDistance(event.touches)
      const scale = currentDistance / Math.max(1, mobileTouchRef.current.startDistance)
      const nextZoom = clampMobileZoom(mobileTouchRef.current.startZoom * scale)
      const center = touchCenter(event.touches)
      const deltaCenter = {
        x: center.x - mobileTouchRef.current.startCenter.x,
        y: center.y - mobileTouchRef.current.startCenter.y,
      }
      setMobilePlayerZoom(nextZoom)
      setMobilePlayerPan({
        x: mobileTouchRef.current.startPan.x + deltaCenter.x,
        y: mobileTouchRef.current.startPan.y + deltaCenter.y,
      })
      return
    }

    if (mobileTouchRef.current.mode === 'pan' && event.touches.length === 1) {
      event.preventDefault()
      const touch = event.touches[0]
      const delta = {
        x: touch.clientX - mobileTouchRef.current.startCenter.x,
        y: touch.clientY - mobileTouchRef.current.startCenter.y,
      }
      setMobilePlayerPan({
        x: mobileTouchRef.current.startPan.x + delta.x,
        y: mobileTouchRef.current.startPan.y + delta.y,
      })
    }
  }

  const handleMobilePlayerTouchEnd: TouchEventHandler<HTMLDivElement> = (event) => {
    if (!isMobileZoomMapView) return

    if (event.touches.length === 0) {
      mobileTouchRef.current.mode = 'none'
      if (mobilePlayerZoom <= 1) {
        setMobilePlayerPan({ x: 0, y: 0 })
      }
      return
    }

    if (event.touches.length === 1 && mobilePlayerZoom > 1) {
      const touch = event.touches[0]
      mobileTouchRef.current = {
        mode: 'pan',
        startZoom: mobilePlayerZoom,
        startDistance: 0,
        startPan: mobilePlayerPan,
        startCenter: { x: touch.clientX, y: touch.clientY },
      }
    }
  }

  const startTokenDragAtPoint = (tokenId: string, clientX: number, clientY: number) => {
    if (role !== 'gm') return
    const point = getTokenDropPoint(clientX, clientY)
    const token = tokens.find((entry) => entry.id === tokenId)
    if (!point || !token) return
    const groupIds =
      selectedTokenIds.length > 1 && selectedTokenIds.includes(tokenId)
        ? selectedTokenIds
        : [tokenId]
    const startPositions = Object.fromEntries(
      groupIds
        .map((id) => {
          const entry = tokens.find((item) => item.id === id)
          if (!entry) return null
          return [id, { x: entry.x, y: entry.y }] as const
        })
        .filter((entry): entry is readonly [string, { x: number; y: number }] => entry !== null),
    )
    if (!startPositions[tokenId]) return

    tokenDragOffsetRef.current = {
      x: point.x - token.x,
      y: point.y - token.y,
    }
    const tokenRenderSize = renderTokenDimensions(token).height
    tokenFogTrailPointRef.current = token.party
      ? tokenPointToCanvasPoint({ x: token.x, y: token.y }, tokenRenderSize)
      : null
    setDraggingTokenId(tokenId)
    setDraggingTokenIds(Object.keys(startPositions))
    dragTokenStartPositionsRef.current = startPositions
    dragTokenPositionsRef.current = startPositions
    setDragTokenPositions(startPositions)
    const startPosition = startPositions[tokenId]
    dragTokenPositionRef.current = startPosition
    setDragTokenPosition(startPosition)
  }

  const startTokenDrag = (tokenId: string, event: Parameters<MouseEventHandler<HTMLButtonElement>>[0]) => {
    if (role !== 'gm') return
    event.preventDefault()
    event.stopPropagation()
    setSelectedTokenIds((current) => (current.includes(tokenId) ? current : [tokenId]))
    startTokenDragAtPoint(tokenId, event.clientX, event.clientY)
  }

  const handleTokenTouchStart = (
    tokenId: string,
    event: Parameters<TouchEventHandler<HTMLButtonElement>>[0],
  ) => {
    if (role !== 'gm') return
    if (event.touches.length !== 1) return
    event.stopPropagation()
    setSelectedTokenIds((current) => (current.includes(tokenId) ? current : [tokenId]))

    const touch = event.touches[0]
    if (tokenLongPressTimerRef.current) {
      window.clearTimeout(tokenLongPressTimerRef.current)
      tokenLongPressTimerRef.current = null
    }

    tokenTouchDraggingRef.current = false
    tokenLongPressTimerRef.current = window.setTimeout(() => {
      startTokenDragAtPoint(tokenId, touch.clientX, touch.clientY)
      tokenTouchDraggingRef.current = true
      tokenLongPressTimerRef.current = null
    }, 240)
  }

  const handleTokenTouchEnd: TouchEventHandler<HTMLButtonElement> = () => {
    if (tokenLongPressTimerRef.current) {
      window.clearTimeout(tokenLongPressTimerRef.current)
      tokenLongPressTimerRef.current = null
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

  useEffect(() => {
    if (!draggingTokenId || role !== 'gm' || !selectedMap) return
    const draggingToken = tokens.find((entry) => entry.id === draggingTokenId) ?? null
    const dragPaths: Record<string, { x: number; y: number }[]> = {}
    const lastSampledPositions: Record<string, { x: number; y: number }> = {}
    let lastStreamingLocalRevealAt = 0
    let lastFogComputeTime = 0
    let lastFogComputeCanvasPoint: { x: number; y: number } | null = null
    let revealFrameId: number | null = null
    let pendingRevealPoint: { x: number; y: number } | null = null
    let pendingRevealBrushSize = 0
    let pendingRevealClipRect: CanvasClipRect | null = null
    const handleLiveWriteError = (error: unknown) => {
      console.warn('Token write failed', error)
    }

    const flushPendingReveal = () => {
      revealFrameId = null
      if (!draggingToken?.party || !activeFogCanvasRef.current || !pendingRevealPoint) return

      const nextCanvasPoint = pendingRevealPoint
      const tokenBrushSize = pendingRevealBrushSize
      const clipRect = pendingRevealClipRect
      pendingRevealPoint = null

      if (streamingMode) {
        const now = Date.now()
        const canvasArea = Math.max(1, activeFogCanvasRef.current.width * activeFogCanvasRef.current.height)
        const areaScale = Math.sqrt(canvasArea / (1280 * 720))
        const streamingInterval = Math.min(
          STREAMING_LOCAL_REVEAL_MAX_INTERVAL_MS,
          Math.max(STREAMING_LOCAL_REVEAL_INTERVAL_MS, STREAMING_LOCAL_REVEAL_INTERVAL_MS * areaScale),
        )
        if (now - lastStreamingLocalRevealAt < streamingInterval) {
          return
        }
        lastStreamingLocalRevealAt = now
      } else {
        // Cap fog LOS recompute to ~12Hz unless the token has moved far enough.
        const now = Date.now()
        const dist = lastFogComputeCanvasPoint
          ? Math.hypot(nextCanvasPoint.x - lastFogComputeCanvasPoint.x, nextCanvasPoint.y - lastFogComputeCanvasPoint.y)
          : Infinity
        if (now - lastFogComputeTime < FOG_COMPUTE_INTERVAL_MS && dist < FOG_COMPUTE_MIN_MOVE) {
          return
        }
        lastFogComputeTime = now
        lastFogComputeCanvasPoint = nextCanvasPoint
      }

      const lastPoint = tokenFogTrailPointRef.current
      if (lastPoint) {
        revealFromTokenStroke(
          activeFogCanvasRef.current,
          activeVisionCanvasRef.current,
          lastPoint,
          nextCanvasPoint,
          tokenBrushSize,
          clipRect,
        )
      } else {
        revealFromTokenPoint(
          activeFogCanvasRef.current,
          activeVisionCanvasRef.current,
          nextCanvasPoint,
          tokenBrushSize,
          clipRect,
        )
      }
      tokenFogTrailPointRef.current = nextCanvasPoint
    }

    const queueReveal = (nextCanvasPoint: { x: number; y: number }, tokenBrushSize: number, clipRect: CanvasClipRect | null) => {
      pendingRevealPoint = nextCanvasPoint
      pendingRevealBrushSize = tokenBrushSize
      pendingRevealClipRect = clipRect
      if (revealFrameId !== null) return
      revealFrameId = window.requestAnimationFrame(flushPendingReveal)
    }

    const handleMoveAt = (clientX: number, clientY: number) => {
      const point = getTokenDropPoint(clientX, clientY)
      if (!point) return
      const offset = tokenDragOffsetRef.current ?? { x: 0, y: 0 }
      const nextPosition = {
        x: Math.max(0, Math.min(1, point.x - offset.x)),
        y: Math.max(0, Math.min(1, point.y - offset.y)),
      }
      const startPositions = dragTokenStartPositionsRef.current
      const groupIds = draggingTokenIds.length > 1 ? draggingTokenIds : [draggingTokenId]

      if (startPositions && groupIds.length > 1 && startPositions[draggingTokenId]) {
        const anchorStart = startPositions[draggingTokenId]
        const rawDx = nextPosition.x - anchorStart.x
        const rawDy = nextPosition.y - anchorStart.y
        const maxNegDx = Math.max(...groupIds.map((id) => -startPositions[id].x))
        const maxPosDx = Math.min(...groupIds.map((id) => 1 - startPositions[id].x))
        const maxNegDy = Math.max(...groupIds.map((id) => -startPositions[id].y))
        const maxPosDy = Math.min(...groupIds.map((id) => 1 - startPositions[id].y))
        const clampedDx = Math.max(maxNegDx, Math.min(maxPosDx, rawDx))
        const clampedDy = Math.max(maxNegDy, Math.min(maxPosDy, rawDy))
        const nextPositions = Object.fromEntries(
          groupIds.map((id) => [
            id,
            {
              x: startPositions[id].x + clampedDx,
              y: startPositions[id].y + clampedDy,
            },
          ]),
        )
        dragTokenPositionsRef.current = nextPositions
        setDragTokenPositions(nextPositions)
        dragTokenPositionRef.current = nextPositions[draggingTokenId]
        setDragTokenPosition(nextPositions[draggingTokenId])
      } else {
        const nextPositions = { [draggingTokenId]: nextPosition }
        dragTokenPositionsRef.current = nextPositions
        setDragTokenPositions(nextPositions)
        dragTokenPositionRef.current = nextPosition
        setDragTokenPosition(nextPosition)
      }

      // Sample path waypoints for drop-time write (replayed as animation on other clients).
      const currentPositions = dragTokenPositionsRef.current
      if (currentPositions) {
        for (const [id, pos] of Object.entries(currentPositions)) {
          const last = lastSampledPositions[id]
          if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) >= DRAG_PATH_SAMPLE_DISTANCE) {
            if (!dragPaths[id]) dragPaths[id] = []
            dragPaths[id].push({ x: pos.x, y: pos.y })
            lastSampledPositions[id] = pos
          }
        }
      }

      if (draggingToken?.party && activeFogCanvasRef.current) {
        const tokenBrushSize = renderTokenViewDistance(draggingToken)
        const nextCanvasPoint = tokenPointToCanvasPoint(nextPosition, renderTokenDimensions(draggingToken).height)
        if (!nextCanvasPoint) return
        const clipRect =
          streamingMode && usingFullScreenCanvas
            ? getFullscreenVisibleCanvasRect(activeFogCanvasRef.current)
            : null

        queueReveal(nextCanvasPoint, tokenBrushSize, clipRect)
      }
    }

    const handleMove = (event: MouseEvent) => {
      handleMoveAt(event.clientX, event.clientY)
    }

    const handleTouchMove = (event: globalThis.TouchEvent) => {
      if (event.touches.length !== 1) return
      if (tokenTouchDraggingRef.current) {
        event.preventDefault()
      }
      const touch = event.touches[0]
      handleMoveAt(touch.clientX, touch.clientY)
    }

    const handleUp = async () => {
      if (revealFrameId !== null) {
        window.cancelAnimationFrame(revealFrameId)
        revealFrameId = null
      }
      if (pendingRevealPoint) {
        // Bypass the Hz cap for the final drop flush so the endpoint is always revealed.
        lastFogComputeTime = 0
        flushPendingReveal()
      }
      const finalPositions = dragTokenPositionsRef.current
      if (!finalPositions) {
        setDraggingTokenId('')
        setDraggingTokenIds([])
        setDragTokenPositions(null)
        tokenDragOffsetRef.current = null
        return
      }

      const finalTokenIds = draggingTokenIds.length > 0 ? draggingTokenIds : [draggingTokenId]
      setDraggingTokenId('')
      setDraggingTokenIds([])
      setDragTokenPosition(null)
      setDragTokenPositions(null)
      dragTokenPositionRef.current = null
      dragTokenPositionsRef.current = null
      dragTokenStartPositionsRef.current = null
      tokenDragOffsetRef.current = null
      tokenFogTrailPointRef.current = null

      // Optimistically update local token positions so the dragger doesn't see the token
      // snap back to the pre-drag Firestore position while the batch write is in flight.
      setTokens((prev) => prev.map((t) => {
        const pos = finalPositions[t.id]
        return pos ? { ...t, x: pos.x, y: pos.y } : t
      }))

      // Mark as recently dropped so this client's listener skips the path animation.
      finalTokenIds.forEach((tokenId) => {
        recentlyDroppedRef.current.add(tokenId)
        window.setTimeout(() => recentlyDroppedRef.current.delete(tokenId), 3000)
      })

      try {
        const batch = writeBatch(db)
        finalTokenIds.forEach((tokenId) => {
          const finalPosition = finalPositions[tokenId]
          if (!finalPosition) return
          batch.update(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'tokens', tokenId), {
            x: finalPosition.x,
            y: finalPosition.y,
            path: dragPaths[tokenId] ?? [],
            updatedAt: serverTimestamp(),
          })
        })
        await batch.commit()
      } catch (error) {
        handleLiveWriteError(error)
      }

      if (draggingToken?.party) {
        try {
          await persistFog()
        } catch (error) {
          handleLiveWriteError(error)
        }
      }

      tokenTouchDraggingRef.current = false
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleUp)
    window.addEventListener('touchcancel', handleUp)

    return () => {
      if (revealFrameId !== null) {
        window.cancelAnimationFrame(revealFrameId)
      }
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleUp)
      window.removeEventListener('touchcancel', handleUp)
    }
    // draw/stamp/persist come from the same component scope and are intentionally captured here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeFogCanvasRef,
    activeVisionCanvasRef,
    campaignId,
    draggingTokenId,
    draggingTokenIds,
    role,
    selectedMap,
    selectedTokenIds,
    streamingMode,
    tokens,
    usingFullScreenCanvas,
  ])

  useEffect(() => {
    if (fullScreenOpen || !selectedMap || !inlineFogCanvasRef.current) return
    if (isMobile && role === 'gm' && mobileGmPane !== 'map') return
    if (inlineBaseSize.width <= 0 || inlineBaseSize.height <= 0) return

    if (loadedInlineCanvasRef.current !== inlineFogCanvasRef.current) {
      loadedInlineCanvasRef.current = inlineFogCanvasRef.current
      loadedInlineFogKeyRef.current = ''
    }

    const key = getFogCacheKey(selectedMap, inlineBaseSize.width, inlineBaseSize.height)
    if (loadedInlineFogKeyRef.current === key) return

    loadedInlineFogKeyRef.current = key
    initializeFogCanvas(inlineFogCanvasRef.current, selectedMap, inlineBaseSize.width, inlineBaseSize.height)
  }, [
    fullScreenOpen,
    inlineBaseSize.height,
    inlineBaseSize.width,
    isMobile,
    mobileGmPane,
    role,
    selectedMap,
  ])

  useEffect(() => {
    if (fullScreenOpen || !selectedMap || !inlineVisionCanvasRef.current) return
    if (isMobile && role === 'gm' && mobileGmPane !== 'map') return
    if (inlineBaseSize.width <= 0 || inlineBaseSize.height <= 0) return

    if (loadedInlineVisionCanvasRef.current !== inlineVisionCanvasRef.current) {
      loadedInlineVisionCanvasRef.current = inlineVisionCanvasRef.current
      loadedInlineVisionKeyRef.current = ''
    }

    const key = `${selectedMap.id}:${selectedMap.visionBlockImagePath || selectedMap.visionBlockImageUrl || selectedMap.visionBlockDataUrl}:${inlineBaseSize.width}x${inlineBaseSize.height}`
    if (loadedInlineVisionKeyRef.current === key) return

    loadedInlineVisionKeyRef.current = key
    initializeVisionCanvas(inlineVisionCanvasRef.current, selectedMap, inlineBaseSize.width, inlineBaseSize.height)
  }, [
    fullScreenOpen,
    inlineBaseSize.height,
    inlineBaseSize.width,
    isMobile,
    mobileGmPane,
    role,
    selectedMap,
  ])

  useEffect(() => {
    if (!fullScreenOpen || !selectedMap || !fullFogCanvasRef.current) return
    if (fullBaseSize.width <= 0 || fullBaseSize.height <= 0) return

    if (loadedFogCanvasRef.current !== fullFogCanvasRef.current) {
      loadedFogCanvasRef.current = fullFogCanvasRef.current
      loadedFogKeyRef.current = ''
    }

    const key = getFogCacheKey(selectedMap, fullBaseSize.width, fullBaseSize.height)
    if (loadedFogKeyRef.current === key) return

    loadedFogKeyRef.current = key
    initializeFogCanvas(fullFogCanvasRef.current, selectedMap, fullBaseSize.width, fullBaseSize.height)
  }, [fullBaseSize.height, fullBaseSize.width, fullScreenOpen, selectedMap])

  useEffect(() => {
    if (!fullScreenOpen || !selectedMap || !fullVisionCanvasRef.current) return
    if (fullBaseSize.width <= 0 || fullBaseSize.height <= 0) return

    if (loadedVisionCanvasRef.current !== fullVisionCanvasRef.current) {
      loadedVisionCanvasRef.current = fullVisionCanvasRef.current
      loadedVisionKeyRef.current = ''
    }

    const key = `${selectedMap.id}:${selectedMap.visionBlockImagePath || selectedMap.visionBlockImageUrl || selectedMap.visionBlockDataUrl}:${fullBaseSize.width}x${fullBaseSize.height}`
    if (loadedVisionKeyRef.current === key) return

    loadedVisionKeyRef.current = key
    initializeVisionCanvas(fullVisionCanvasRef.current, selectedMap, fullBaseSize.width, fullBaseSize.height)
  }, [fullBaseSize.height, fullBaseSize.width, fullScreenOpen, selectedMap])

  const handleDrop = async (targetMapId: string) => {
    if (!draggingMapId || draggingMapId === targetMapId) {
      setDraggingMapId('')
      setDragOverMapId('')
      return
    }

    const fromIndex = maps.findIndex((map) => map.id === draggingMapId)
    const toIndex = maps.findIndex((map) => map.id === targetMapId)
    if (fromIndex < 0 || toIndex < 0) {
      setDraggingMapId('')
      setDragOverMapId('')
      return
    }

    const ordered = [...maps]
    const [moved] = ordered.splice(fromIndex, 1)
    ordered.splice(toIndex, 0, moved)

    try {
      await persistMapOrder(ordered)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reorder maps'
      setMapError(message)
    } finally {
      setDraggingMapId('')
      setDragOverMapId('')
    }
  }

  return (
    <div className="maps-layout">
      {showListPane ? (
      <aside className="maps-sidebar">
        <div className="maps-sidebar-header">
          <h2>Maps</h2>
          {role === 'gm' ? (
            <label className="upload-trigger">
              <Upload size={16} />
              {uploading ? 'Uploading...' : 'Upload'}
              <input type="file" accept="image/*" onChange={handleMapUpload} disabled={uploading} />
            </label>
          ) : null}
        </div>
        <p className="maps-role">Role: {role ?? 'unknown'}</p>

        {mapsLoading ? <p>Loading maps...</p> : null}
        {!mapsLoading && maps.length === 0 ? <p>No maps uploaded yet.</p> : null}
        {!mapsLoading && maps.length > 0 && visibleMaps.length === 0 && role !== 'gm' ? (
          <p>No maps revealed to players yet.</p>
        ) : null}

        <div className="maps-list">
          {visibleMaps.map((map) => (
            <div
              key={map.id}
              className={[
                'map-row',
                map.id === selectedMapId ? 'active' : '',
                map.id === dragOverMapId ? 'drag-over' : '',
                map.id === draggingMapId ? 'dragging' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable={role === 'gm'}
              onDragStart={() => handleDragStart(map.id)}
              onDragOver={(event) => {
                event.preventDefault()
                if (dragOverMapId !== map.id) setDragOverMapId(map.id)
              }}
              onDragLeave={() => {
                if (dragOverMapId === map.id) setDragOverMapId('')
              }}
              onDrop={(event) => {
                event.preventDefault()
                void handleDrop(map.id)
              }}
              onDragEnd={() => {
                setDraggingMapId('')
                setDragOverMapId('')
              }}
            >
              <div
                className="map-select"
                role="button"
                tabIndex={0}
                onClick={() => selectMap(map.id)}
                onKeyDown={(event) => {
                  const target = event.target as HTMLElement
                  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                    return
                  }
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectMap(map.id)
                  }
                }}
              >
                <div className="map-thumb-column">
                  <div className="map-thumb-wrap">
                    {role === 'gm' && map.imageUrl ? <img src={map.imageUrl} alt={map.name} className="map-thumb" /> : null}
                  </div>
                  {role === 'gm' ? (
                    <button
                      type="button"
                      className={map.visibleToPlayers ? 'map-visibility-btn on' : 'map-visibility-btn'}
                      onClick={(event) => {
                        event.stopPropagation()
                        void togglePlayerVisibility(map, !map.visibleToPlayers)
                      }}
                      aria-label={map.visibleToPlayers ? 'Visible to players' : 'Hidden from players'}
                    >
                      {map.visibleToPlayers ? <Check size={14} /> : <Circle size={14} />}
                    </button>
                  ) : null}
                </div>
                <div className="map-meta">
                  {editingMapId === map.id ? (
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      aria-label="Edit map name"
                    />
                  ) : (
                    <strong>{map.name}</strong>
                  )}
                </div>
              </div>

              {role === 'gm' ? (
                <div className="map-actions">
                  {editingMapId === map.id ? (
                    <button type="button" className="map-edit-btn" onClick={() => void saveRename(map.id)}>
                      <Check size={14} />
                    </button>
                  ) : (
                    <button type="button" className="map-edit-btn" onClick={() => startRename(map)}>
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="map-delete-btn"
                    onClick={() => setDeleteCandidate(map)}
                    disabled={deletingMapId === map.id}
                    aria-label={`Delete ${map.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {mapError ? <p className="error">{mapError}</p> : null}
      </aside>
      ) : null}

      {showMapPane ? (
      <div
        className={[
          role === 'gm' ? 'maps-main gm' : 'maps-main player',
          isMobile && role === 'gm' ? 'mobile-gm' : '',
          isMobile && role !== 'gm' ? 'mobile-player' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {isMobile && role !== 'gm' ? (
          <button type="button" className="map-mobile-back" onClick={() => setMobileMapView('list')}>
            <ChevronLeft size={16} />
          </button>
        ) : null}
        {!isMobile || role !== 'gm' || mobileGmPane === 'map' ? (
        <div className={isMobileZoomMapView ? 'map-stage mobile-player-stage' : 'map-stage'}>
          {!isMobile ? (
            <button type="button" className="map-fullscreen-btn" onClick={openFullScreen}>
              <Maximize2 size={15} />
              Full Screen
            </button>
          ) : null}
          {selectedMap?.imageUrl ? (
            <div
              ref={inlineMapLayerRef}
              className={isMobileZoomMapView ? 'map-zoom-layer mobile-player-zoom' : 'map-zoom-layer'}
              onContextMenu={(event) => event.preventDefault()}
              onMouseDown={handleMapLayerMouseDown}
              onClick={handleMapLayerClick}
              onTouchStart={handleMobilePlayerTouchStart}
              onTouchMove={handleMobilePlayerTouchMove}
              onTouchEnd={handleMobilePlayerTouchEnd}
              onTouchCancel={handleMobilePlayerTouchEnd}
              style={
                isMobileZoomMapView
                  ? {
                      transform: `translate(${mobilePlayerPan.x}px, ${mobilePlayerPan.y}px) scale(${mobilePlayerZoom})`,
                    }
                  : undefined
              }
            >
              <img
                src={selectedMap.imageUrl}
                alt={selectedMap.name}
                className="map-image inline-map-image"
                onLoad={(event) => {
                  const target = event.currentTarget
                  setInlineBaseSize({
                    width: Math.max(1, Math.round(target.clientWidth)),
                    height: Math.max(1, Math.round(target.clientHeight)),
                  })
                  loadedInlineFogKeyRef.current = ''
                  loadedInlineVisionKeyRef.current = ''
                }}
              />
              <canvas
                ref={inlineFogCanvasRef}
                className={tokenPlaceMode || (!fogTool && !visionTool) ? 'map-fog-canvas read-only' : 'map-fog-canvas brush'}
                width={Math.max(1, inlineBaseSize.width)}
                height={Math.max(1, inlineBaseSize.height)}
                style={{ opacity: fogDisplayOpacity }}
                onMouseDown={handleFogPointerDown}
                onMouseMove={handleFogPointerMove}
                onMouseUp={handleFogPointerUp}
                onMouseLeave={handleFogPointerUp}
                onTouchStart={handleFogTouchStart}
                onTouchMove={handleFogTouchMove}
                onTouchEnd={handleFogTouchEnd}
                onTouchCancel={handleFogTouchEnd}
              />
              <canvas
                ref={inlineVisionCanvasRef}
                className="map-vision-canvas"
                width={Math.max(1, inlineBaseSize.width)}
                height={Math.max(1, inlineBaseSize.height)}
                style={{ opacity: visionOverlayOpacity }}
              />
              <div className={role === 'gm' ? 'map-token-layer gm' : 'map-token-layer'} aria-hidden={role !== 'gm'}>
                {tokens.map((token, index) => {
                  if (!isTokenVisible(token)) return null
                  const draggedPosition = dragTokenPositions?.[token.id]
                  const animPos = animatedTokenPositions[token.id]
                  const tokenX = draggedPosition?.x ?? animPos?.x ?? token.x
                  const tokenY = draggedPosition?.y ?? animPos?.y ?? token.y
                  const isAnimating = Boolean(animPos) && !draggedPosition

                  if (role !== 'gm') {
                    return (
                      <span
                        key={token.id}
                        className={isAnimating ? 'map-token-static animating' : 'map-token-static'}
                        style={{
                          left: `${tokenX * 100}%`,
                          top: `${tokenY * 100}%`,
                          color: token.color,
                        }}
                      >
                        {renderTokenGlyph(token)}
                        {token.revealName ? (
                          <span className="map-token-name" style={renderTokenNameStyle(token)}>
                            {tokenDisplayName(token, index)}
                          </span>
                        ) : null}
                      </span>
                    )
                  }

                  const isDraggingToken = Boolean(draggedPosition)
                  const isSelected = selectedTokenIds.includes(token.id)
                  return (
                    <button
                      key={token.id}
                      type="button"
                      className={[
                        'map-token',
                        isDraggingToken ? 'dragging' : '',
                        isAnimating ? 'animating' : '',
                        isSelected ? 'selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        left: `${tokenX * 100}%`,
                        top: `${tokenY * 100}%`,
                        color: token.color,
                      }}
                      onMouseDown={(event) => startTokenDrag(token.id, event)}
                      onTouchStart={(event) => handleTokenTouchStart(token.id, event)}
                      onTouchEnd={handleTokenTouchEnd}
                      onTouchCancel={handleTokenTouchEnd}
                      aria-label="Map token"
                    >
                      <span
                        role="button"
                        tabIndex={0}
                        className="map-token-hide-btn"
                        onMouseDown={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                        }}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void hideTokenOnMap(token.id)
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          event.stopPropagation()
                          void hideTokenOnMap(token.id)
                        }}
                        aria-label="Hide token"
                        title="Hide token"
                      >
                        <X size={10} />
                      </span>
                      {renderTokenGlyph(token)}
                      <span className={gmTokenNameClassName(token)} style={renderTokenNameStyle(token)}>
                        {tokenDisplayName(token, index)}
                      </span>
                    </button>
                  )
                })}
              </div>
              {role === 'gm' && tokenSelectionBox && selectionRectStyle ? (
                <div className="map-token-selection-box" style={selectionRectStyle} />
              ) : null}
              {role === 'gm' && !streamingMode ? (
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
                            void commitActiveAnnotation()
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
                              void commitActiveAnnotation()
                            }}
                            ref={autosizeAnnotationTextarea}
                            placeholder="GM note"
                            rows={4}
                          />
                          <button
                            type="button"
                            className="map-annotation-delete"
                            onClick={() => void deleteAnnotation(annotation.id)}
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
              ) : null}
            </div>
          ) : (
            <p>Select a map from the list.</p>
          )}
        </div>
        ) : null}

        {role === 'gm' && (!isMobile || mobileGmPane === 'controls') ? (
          <aside className="map-controls">
            <GmMapControls
              fogTool={fogTool}
              setFogTool={setFogTool}
              visionTool={visionTool}
              setVisionTool={setVisionTool}
              fogBrushSize={fogBrushSize}
              setFogBrushSize={setFogBrushSize}
              fogBrushStrength={fogBrushStrength}
              setFogBrushStrength={setFogBrushStrength}
              tokenPlaceMode={tokenPlaceMode}
              setTokenPlaceMode={setTokenPlaceMode}
              tokenSelectMode={tokenSelectMode}
              setTokenSelectMode={setTokenSelectMode}
              annotationPlaceMode={annotationPlaceMode}
              setAnnotationPlaceMode={setAnnotationPlaceMode}
              tokenColor={tokenColor}
              setTokenColor={setTokenColor}
              tokenSize={tokenSize}
              setTokenSize={setTokenSize}
              tokenAssets={tokenAssets}
              selectedTokenAssetId={selectedTokenAssetId}
              setSelectedTokenAssetId={setSelectedTokenAssetId}
              selectedTokenImageUrl={selectedTokenAsset?.imageUrl ?? ''}
              uploadingTokenImage={uploadingTokenImage}
              onUploadTokenImage={uploadTokenImage}
              streamingMode={streamingMode}
              setStreamingMode={setStreamingMode}
              applyFogPreset={applyFogPreset}
              canApplyPreset={Boolean(selectedMap)}
              fullyHidden={selectedMap?.fullyHidden === true}
              tokens={tokens}
              selectedTokenIds={selectedTokenIds}
              onUpdateToken={updateToken}
              onUpdateTokenSize={async (tokenId, size) => {
                const sizeScale = size / TOKEN_REFERENCE_DIMENSION
                setTokens((prev) =>
                  prev.map((token) => (token.id === tokenId ? { ...token, size, sizeScale } : token)),
                )
                await updateToken(tokenId, { size, sizeScale })
              }}
              onUpdateTokenViewDistance={async (tokenId, viewDistance) => {
                const viewDistanceScale = viewDistance / TOKEN_REFERENCE_DIMENSION
                setTokens((prev) =>
                  prev.map((token) =>
                    token.id === tokenId ? { ...token, viewDistance, viewDistanceScale } : token,
                  ),
                )
                await updateToken(tokenId, { viewDistance, viewDistanceScale })
              }}
              tokenViewDistanceSliderValue={tokenViewDistanceSliderValue}
              onRequestDeleteToken={requestDeleteToken}
            />
          </aside>
        ) : null}

        {isMobile && role === 'gm' ? (
          <div className="map-mobile-panel-nav">
            <button
              type="button"
              onClick={() => setMobileMapView('list')}
              aria-label="Back to map list"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className={mobileGmPane === 'map' ? 'active' : ''}
              onClick={() => setMobileGmPane('map')}
              disabled={mobileGmPane === 'map'}
              aria-label="Map pane"
            >
              <Map size={16} />
            </button>
            <button
              type="button"
              className={mobileGmPane === 'controls' ? 'active' : ''}
              onClick={() => setMobileGmPane('controls')}
              disabled={mobileGmPane === 'controls'}
              aria-label="Controls pane"
            >
              <SlidersHorizontal size={16} />
            </button>
          </div>
        ) : null}
      </div>
      ) : null}

      {fullScreenOpen && !isMobile ? (
        <div className="map-fullscreen-overlay" role="dialog" aria-modal="true">
          <div className="map-fullscreen-shell">
            <div
              ref={fullStageRef}
              className={fullDragging ? 'map-fullscreen-stage dragging' : 'map-fullscreen-stage'}
              onWheel={handleFullWheel}
              onMouseDown={handleFullMouseDown}
              onAuxClick={(event) => {
                if (event.button === 1) event.preventDefault()
              }}
              onMouseMove={handleFullMouseMove}
              onMouseUp={endFullDrag}
              onMouseLeave={endFullDrag}
            >
              <button
                type="button"
                className="map-fullscreen-close"
                onClick={closeFullScreen}
                aria-label="Close full screen map"
              >
                <X size={16} />
              </button>

              {selectedMap?.imageUrl ? (
            <div
              className="map-zoom-layer"
              ref={fullMapLayerRef}
              onMouseDown={handleMapLayerMouseDown}
              onClick={handleMapLayerClick}
              style={{
                transform: `translate(${fullPan.x}px, ${fullPan.y}px) scale(${fullZoom})`,
              }}
                >
                  <img
                    src={selectedMap.imageUrl}
                    alt={selectedMap.name}
                    className="map-image zoomable"
                    draggable={false}
                    onLoad={(event) => {
                      const target = event.currentTarget
                      setFullBaseSize({
                        width: Math.max(1, Math.round(target.clientWidth)),
                        height: Math.max(1, Math.round(target.clientHeight)),
                      })
                      loadedVisionKeyRef.current = ''
                    }}
                  />
                  <canvas
                    ref={fullFogCanvasRef}
                    className={tokenPlaceMode || (!fogTool && !visionTool) ? 'map-fog-canvas read-only' : 'map-fog-canvas brush'}
                    width={Math.max(1, fullBaseSize.width)}
                    height={Math.max(1, fullBaseSize.height)}
                    style={{ opacity: fogDisplayOpacity }}
                    onMouseDown={handleFogPointerDown}
                    onMouseMove={handleFogPointerMove}
                    onMouseUp={handleFogPointerUp}
                    onMouseLeave={handleFogPointerUp}
                  />
                  <canvas
                    ref={fullVisionCanvasRef}
                    className="map-vision-canvas"
                    width={Math.max(1, fullBaseSize.width)}
                    height={Math.max(1, fullBaseSize.height)}
                    style={{ opacity: visionOverlayOpacity }}
                  />
                  <div className={role === 'gm' ? 'map-token-layer gm' : 'map-token-layer'} aria-label="Map tokens">
                    {tokens.map((token, index) => {
                      if (!isTokenVisible(token)) return null
                      const draggedPosition = dragTokenPositions?.[token.id]
                      const animPos = animatedTokenPositions[token.id]
                      const isDragging = Boolean(draggedPosition)
                      const isAnimating = Boolean(animPos) && !draggedPosition
                      const x = draggedPosition?.x ?? animPos?.x ?? token.x
                      const y = draggedPosition?.y ?? animPos?.y ?? token.y
                      const isSelected = selectedTokenIds.includes(token.id)

                      if (role !== 'gm') {
                        return (
                          <span
                            key={token.id}
                            className={isAnimating ? 'map-token-static animating' : 'map-token-static'}
                            style={{
                              left: `${x * 100}%`,
                              top: `${y * 100}%`,
                              color: token.color,
                            }}
                          >
                            {renderTokenGlyph(token)}
                            {token.revealName ? (
                              <span className="map-token-name" style={renderTokenNameStyle(token)}>
                                {tokenDisplayName(token, index)}
                              </span>
                            ) : null}
                          </span>
                        )
                      }

                      return (
                        <button
                          key={token.id}
                          type="button"
                          className={[
                            'map-token',
                            isDragging ? 'dragging' : '',
                            isAnimating ? 'animating' : '',
                            isSelected ? 'selected' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{
                            left: `${x * 100}%`,
                            top: `${y * 100}%`,
                            color: token.color,
                          }}
                          onMouseDown={(event) => startTokenDrag(token.id, event)}
                          onTouchStart={(event) => handleTokenTouchStart(token.id, event)}
                          onTouchEnd={handleTokenTouchEnd}
                          onTouchCancel={handleTokenTouchEnd}
                          aria-label="Map token"
                        >
                          <span
                            role="button"
                            tabIndex={0}
                            className="map-token-hide-btn"
                            onMouseDown={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                            }}
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              void hideTokenOnMap(token.id)
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return
                              event.preventDefault()
                              event.stopPropagation()
                              void hideTokenOnMap(token.id)
                            }}
                            aria-label="Hide token"
                            title="Hide token"
                          >
                            <X size={10} />
                          </span>
                          {renderTokenGlyph(token)}
                          <span className={gmTokenNameClassName(token)} style={renderTokenNameStyle(token)}>
                            {tokenDisplayName(token, index)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {role === 'gm' && tokenSelectionBox && selectionRectStyle ? (
                    <div className="map-token-selection-box" style={selectionRectStyle} />
                  ) : null}
                  {role === 'gm' && !streamingMode ? (
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
                                void commitActiveAnnotation()
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
                                  void commitActiveAnnotation()
                                }}
                                ref={autosizeAnnotationTextarea}
                                placeholder="GM note"
                                rows={4}
                              />
                              <button
                                type="button"
                                className="map-annotation-delete"
                                onClick={() => void deleteAnnotation(annotation.id)}
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
                  ) : null}
                </div>
              ) : (
                <p>Select a map from the list.</p>
              )}
            </div>

            {role === 'gm' ? (
              <aside className="map-fullscreen-controls">
                <GmMapControls
                  dark
                  fogTool={fogTool}
                  setFogTool={setFogTool}
                  visionTool={visionTool}
                  setVisionTool={setVisionTool}
                  fogBrushSize={fogBrushSize}
                  setFogBrushSize={setFogBrushSize}
                  fogBrushStrength={fogBrushStrength}
                  setFogBrushStrength={setFogBrushStrength}
                  tokenPlaceMode={tokenPlaceMode}
                  setTokenPlaceMode={setTokenPlaceMode}
                  tokenSelectMode={tokenSelectMode}
                  setTokenSelectMode={setTokenSelectMode}
                  annotationPlaceMode={annotationPlaceMode}
                  setAnnotationPlaceMode={setAnnotationPlaceMode}
                  tokenColor={tokenColor}
                  setTokenColor={setTokenColor}
                  tokenSize={tokenSize}
                  setTokenSize={setTokenSize}
                  tokenAssets={tokenAssets}
                  selectedTokenAssetId={selectedTokenAssetId}
                  setSelectedTokenAssetId={setSelectedTokenAssetId}
                  selectedTokenImageUrl={selectedTokenAsset?.imageUrl ?? ''}
                  uploadingTokenImage={uploadingTokenImage}
                  onUploadTokenImage={uploadTokenImage}
                  streamingMode={streamingMode}
                  setStreamingMode={setStreamingMode}
                  applyFogPreset={applyFogPreset}
                  canApplyPreset={Boolean(selectedMap)}
                  fullyHidden={selectedMap?.fullyHidden === true}
                  tokens={tokens}
                  selectedTokenIds={selectedTokenIds}
                  onUpdateToken={updateToken}
                  onUpdateTokenSize={async (tokenId, size) => {
                    const sizeScale = size / TOKEN_REFERENCE_DIMENSION
                    setTokens((prev) =>
                      prev.map((token) => (token.id === tokenId ? { ...token, size, sizeScale } : token)),
                    )
                    await updateToken(tokenId, { size, sizeScale })
                  }}
                  onUpdateTokenViewDistance={async (tokenId, viewDistance) => {
                    const viewDistanceScale = viewDistance / TOKEN_REFERENCE_DIMENSION
                    setTokens((prev) =>
                      prev.map((token) =>
                        token.id === tokenId ? { ...token, viewDistance, viewDistanceScale } : token,
                      ),
                    )
                    await updateToken(tokenId, { viewDistance, viewDistanceScale })
                  }}
                  tokenViewDistanceSliderValue={tokenViewDistanceSliderValue}
                  onRequestDeleteToken={requestDeleteToken}
                />
              </aside>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={deleteCandidate !== null}
        title="Delete Map?"
        message={`Permanently remove "${deleteCandidate?.name ?? ''}" from this campaign?`}
        confirmLabel={deletingMapId ? 'Deleting...' : 'Delete'}
        confirmDisabled={Boolean(deletingMapId)}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => void deleteMap()}
      />
      <ConfirmModal
        open={tokenDeleteCandidate !== null}
        title="Delete Token?"
        message="Permanently remove this token from the map?"
        confirmLabel={deletingTokenId ? 'Deleting...' : 'Delete'}
        confirmDisabled={Boolean(deletingTokenId)}
        onCancel={() => setTokenDeleteCandidate(null)}
        onConfirm={() => void confirmDeleteToken()}
      />
    </div>
  )
}

function GmMapControls({
  dark = false,
  fogTool,
  setFogTool,
  visionTool,
  setVisionTool,
  fogBrushSize,
  setFogBrushSize,
  fogBrushStrength,
  setFogBrushStrength,
  tokenPlaceMode,
  setTokenPlaceMode,
  tokenSelectMode,
  setTokenSelectMode,
  annotationPlaceMode,
  setAnnotationPlaceMode,
  tokenColor,
  setTokenColor,
  tokenSize,
  setTokenSize,
  tokenAssets,
  selectedTokenAssetId,
  setSelectedTokenAssetId,
  selectedTokenImageUrl,
  uploadingTokenImage,
  onUploadTokenImage,
  streamingMode,
  setStreamingMode,
  applyFogPreset,
  canApplyPreset,
  fullyHidden,
  tokens,
  selectedTokenIds,
  onUpdateToken,
  onUpdateTokenSize,
  onUpdateTokenViewDistance,
  tokenViewDistanceSliderValue,
  onRequestDeleteToken,
}: {
  dark?: boolean
  fogTool: 'reveal' | 'hide' | null
  setFogTool: (tool: 'reveal' | 'hide' | null) => void
  visionTool: 'draw' | 'erase' | null
  setVisionTool: (tool: 'draw' | 'erase' | null) => void
  fogBrushSize: number
  setFogBrushSize: (size: number) => void
  fogBrushStrength: number
  setFogBrushStrength: (strength: number) => void
  tokenPlaceMode: boolean
  setTokenPlaceMode: (value: boolean) => void
  tokenSelectMode: boolean
  setTokenSelectMode: (value: boolean) => void
  annotationPlaceMode: boolean
  setAnnotationPlaceMode: (value: boolean) => void
  tokenColor: string
  setTokenColor: (value: string) => void
  tokenSize: number
  setTokenSize: (value: number) => void
  tokenAssets: TokenAssetRecord[]
  selectedTokenAssetId: string
  setSelectedTokenAssetId: (value: string) => void
  selectedTokenImageUrl: string
  uploadingTokenImage: boolean
  onUploadTokenImage: (file: File, assetName?: string) => Promise<void>
  streamingMode: boolean
  setStreamingMode: (value: boolean) => void
  applyFogPreset: (preset: 'hide-all' | 'unhide-all') => Promise<void>
  canApplyPreset: boolean
  fullyHidden: boolean
  tokens: TokenRecord[]
  selectedTokenIds: string[]
  onUpdateToken: (
    tokenId: string,
    updates: Partial<
      Pick<
        TokenRecord,
        'color' | 'size' | 'sizeScale' | 'viewDistance' | 'viewDistanceScale' | 'party' | 'name' | 'revealName' | 'hidden'
      >
    >,
  ) => Promise<void>
  onUpdateTokenSize: (tokenId: string, size: number) => Promise<void>
  onUpdateTokenViewDistance: (tokenId: string, viewDistance: number) => Promise<void>
  tokenViewDistanceSliderValue: (token: TokenRecord) => number
  onRequestDeleteToken: (tokenId: string) => void
}) {
  const toggleHidden = () => {
    void applyFogPreset(fullyHidden ? 'unhide-all' : 'hide-all')
  }

  const [tokenNameDrafts, setTokenNameDrafts] = useState<Record<string, string>>({})

  const commitTokenLabelEdit = async (token: TokenRecord, labelValue: string) => {
    const current = token.name.trim()
    const nextName = labelValue.trim()
    if (nextName !== current) {
      await onUpdateToken(token.id, { name: nextName })
    }

    setTokenNameDrafts((prev) => {
      const next = { ...prev }
      delete next[token.id]
      return next
    })
  }

  return (
    <div className={dark ? 'map-controls-body dark' : 'map-controls-body'}>
      <div className="map-icon-grid">
        <button
          type="button"
          className={fogTool === 'reveal' ? 'map-icon-btn active' : 'map-icon-btn'}
          onClick={() => {
            setTokenSelectMode(false)
            setVisionTool(null)
            setFogTool(fogTool === 'reveal' ? null : 'reveal')
          }}
          aria-label="Eraser brush"
          title="Eraser brush"
        >
          <Eraser size={16} />
        </button>
        <button
          type="button"
          className={fogTool === 'hide' ? 'map-icon-btn active' : 'map-icon-btn'}
          onClick={() => {
            setTokenSelectMode(false)
            setVisionTool(null)
            setFogTool(fogTool === 'hide' ? null : 'hide')
          }}
          aria-label="Spray fog brush"
          title="Spray fog brush"
        >
          <SprayCan size={16} />
        </button>
        <button
          type="button"
          className={visionTool === 'draw' ? 'map-icon-btn active' : 'map-icon-btn'}
          onClick={() => {
            setTokenSelectMode(false)
            setFogTool(null)
            setVisionTool(visionTool === 'draw' ? null : 'draw')
          }}
          aria-label="Vision wall brush"
          title="Vision wall brush"
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          className={visionTool === 'erase' ? 'map-icon-btn active' : 'map-icon-btn'}
          onClick={() => {
            setTokenSelectMode(false)
            setFogTool(null)
            setVisionTool(visionTool === 'erase' ? null : 'erase')
          }}
          aria-label="Erase vision wall brush"
          title="Erase vision wall brush"
        >
          <X size={16} />
        </button>
        <button
          type="button"
          className={fullyHidden ? 'map-icon-btn active' : 'map-icon-btn'}
          onClick={toggleHidden}
          disabled={!canApplyPreset}
          aria-label={fullyHidden ? 'Unhide all' : 'Hide all'}
          title={fullyHidden ? 'Unhide all' : 'Hide all'}
        >
          {fullyHidden ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
        <button
          type="button"
          className={tokenPlaceMode ? 'map-icon-btn active' : 'map-icon-btn'}
          onClick={() => {
            const next = !tokenPlaceMode
            setTokenPlaceMode(next)
            if (next) {
              setTokenSelectMode(false)
              setAnnotationPlaceMode(false)
            }
          }}
          aria-label="Toggle token placement mode"
          title="Toggle token placement mode"
        >
          <ChessPawn size={16} />
        </button>
        <button
          type="button"
          className={tokenSelectMode ? 'map-icon-btn active' : 'map-icon-btn'}
          onClick={() => {
            const next = !tokenSelectMode
            setTokenSelectMode(next)
            if (next) {
              setFogTool(null)
              setVisionTool(null)
              setTokenPlaceMode(false)
              setAnnotationPlaceMode(false)
            }
          }}
          aria-label="Toggle token drag-select mode"
          title="Toggle token drag-select mode"
        >
          <Square size={16} />
        </button>
        <button
          type="button"
          className={annotationPlaceMode ? 'map-icon-btn active' : 'map-icon-btn'}
          onClick={() => {
            const next = !annotationPlaceMode
            setAnnotationPlaceMode(next)
            if (next) {
              setTokenSelectMode(false)
              setTokenPlaceMode(false)
            }
          }}
          aria-label="Toggle annotation placement mode"
          title="Toggle annotation placement mode"
        >
          <Flag size={16} />
        </button>
        <button
          type="button"
          className={streamingMode ? 'map-icon-btn active' : 'map-icon-btn'}
          onClick={() => setStreamingMode(!streamingMode)}
          aria-label="Toggle streaming mode"
          title="Toggle streaming mode"
        >
          <TvMinimalPlay size={16} />
        </button>
      </div>
      {tokenPlaceMode ? (
        <div className="map-token-config">
          <TokenIconEditor
            className="map-token-icon-editor"
            minSize={16}
            maxSize={TOKEN_SIZE_MAX}
            value={{ icon: selectedTokenAssetId ? 'custom' : 'pawn', color: tokenColor, size: tokenSize } satisfies TokenIconConfig}
            onChange={(next) => {
              setTokenColor(next.color)
              setTokenSize(next.size)
              if (next.icon === 'pawn' && selectedTokenAssetId) setSelectedTokenAssetId('')
            }}
            tokenAssets={tokenAssets.map((asset) => ({ id: asset.id, name: asset.name, imageUrl: asset.imageUrl }))}
            selectedTokenAssetId={selectedTokenAssetId}
            onSelectedTokenAssetIdChange={setSelectedTokenAssetId}
            selectedTokenImageUrl={selectedTokenImageUrl}
            uploadingTokenImage={uploadingTokenImage}
            onUploadTokenImage={onUploadTokenImage}
          />
        </div>
      ) : null}
      {!streamingMode ? (
      <div className="token-list">
        {tokens.map((token, index) => (
          <div key={token.id} className={selectedTokenIds.includes(token.id) ? 'token-row selected' : 'token-row'}>
            <span className="token-row-icon" style={{ color: token.color }} aria-hidden>
              {token.tokenImageUrl ? (
                <img src={token.tokenImageUrl} alt="" className="token-row-image" />
              ) : (
                <ChessPawn size={14} />
              )}
            </span>
            <input
              type="text"
              className="token-row-label-input"
              value={tokenNameDrafts[token.id] ?? token.name}
              onFocus={() =>
                setTokenNameDrafts((prev) => ({
                  ...prev,
                  [token.id]: token.name,
                }))
              }
              onChange={(event) =>
                setTokenNameDrafts((prev) => ({
                  ...prev,
                  [token.id]: event.target.value,
                }))
              }
              onBlur={(event) => void commitTokenLabelEdit(token, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }
              }}
              aria-label={`Token ${index + 1} name`}
              placeholder={`Token ${index + 1}`}
            />
            <input
              type="color"
              value={token.color}
              onChange={(event) => void onUpdateToken(token.id, { color: event.target.value })}
              aria-label={`Token ${index + 1} color`}
            />
            <button
              type="button"
              className="token-row-delete"
              onClick={() => onRequestDeleteToken(token.id)}
              aria-label={`Delete token ${index + 1}`}
              title="Delete token"
            >
              <Trash2 size={14} />
            </button>
            <input
              type="range"
              className="token-row-size-slider"
              min={16}
              max={TOKEN_SIZE_MAX}
              step={1}
              value={token.size}
              onChange={(event) => void onUpdateTokenSize(token.id, Number(event.target.value))}
              aria-label={`Token ${index + 1} size`}
            />
            <span className="token-row-size-value">{token.size}</span>
            <div className="token-row-toggles">
              <label className="token-party-toggle">
                <input
                  type="checkbox"
                  checked={token.party}
                  onChange={(event) => {
                    const checked = event.target.checked
                    if (checked) {
                      const viewDistance = tokenViewDistanceSliderValue(token)
                      void onUpdateToken(token.id, {
                        party: checked,
                        viewDistance,
                      })
                      return
                    }
                    void onUpdateToken(token.id, { party: checked })
                  }}
                />
                Party Token
              </label>
              <label className="token-party-toggle">
                <input
                  type="checkbox"
                  checked={token.revealName}
                  onChange={(event) => void onUpdateToken(token.id, { revealName: event.target.checked })}
                />
                Reveal Name
              </label>
              <label className="token-party-toggle">
                <input
                  type="checkbox"
                  checked={token.hidden}
                  onChange={(event) => void onUpdateToken(token.id, { hidden: event.target.checked })}
                />
                Hide
              </label>
            </div>
            {token.party ? (
              <label className="token-party-toggle token-view-distance">
                View Distance: {tokenViewDistanceSliderValue(token)}
                <input
                  type="range"
                  min={8}
                  max={600}
                  step={2}
                  value={tokenViewDistanceSliderValue(token)}
                  onChange={(event) => void onUpdateTokenViewDistance(token.id, Number(event.target.value))}
                />
              </label>
            ) : null}
          </div>
        ))}
      </div>
      ) : null}

      <label>
        Brush Size: {fogBrushSize}
        <input
          type="range"
          min={8}
          max={260}
          step={2}
          value={fogBrushSize}
          onChange={(event) => setFogBrushSize(Number(event.target.value))}
        />
      </label>

      <label>
        Brush Strength: {fogBrushStrength.toFixed(2)}
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={fogBrushStrength}
          onChange={(event) => setFogBrushStrength(Number(event.target.value))}
        />
      </label>
    </div>
  )
}
