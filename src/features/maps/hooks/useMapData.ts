import { useEffect, useMemo, useState } from 'react'
import type { MutableRefObject } from 'react'
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
  where,
  writeBatch,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, db, storage } from '../../../firebase'
import { firebaseConfig } from '../../../firebase/config'
import type { Role } from '../../../types/app'
import type { TokenIconConfig } from '../../tokens/TokenIconEditor'
import type {
  AnnotationRecord,
  CharacterTokenSummary,
  MapRecord,
  MonsterSummary,
  NpcSummary,
  TokenAssetRecord,
  TokenRecord,
  Waypoint,
} from '../lib/types'
import {
  DEFAULT_GRID_CELL_SCALE,
  DEFAULT_TOKEN_VIEW_DISTANCE,
  TOKEN_REFERENCE_DIMENSION,
} from '../lib/constants'

type UseMapDataParams = {
  campaignId: string
  role: Role | null
  selectedMapId: string
  setSelectedMapId: (id: string | ((prev: string) => string)) => void
  // Coord resolver: converts screen coords to normalized map coords (owned by fog/viewport)
  getDropPoint: (clientX: number, clientY: number) => { x: number; y: number } | null
  // Token placement UI state (owned by MapsTab tool controls)
  tokenColor: string
  tokenSize: number
  // Refs for triggering path animations on remote token moves (owned by useTokenAnimation)
  tokensRef: MutableRefObject<TokenRecord[]>
  recentlyDroppedRef: MutableRefObject<Set<string>>
  lastAnimatedPathIdRef: MutableRefObject<Record<string, string>>
  startTokenPathAnimationRef: MutableRefObject<(
    tokenId: string,
    fromPos: { x: number; y: number },
    path: Waypoint[],
    token: TokenRecord,
  ) => void>
}

export function useMapData({
  campaignId,
  role,
  selectedMapId,
  setSelectedMapId,
  getDropPoint,
  tokenColor,
  tokenSize,
  tokensRef,
  recentlyDroppedRef,
  lastAnimatedPathIdRef,
  startTokenPathAnimationRef,
}: UseMapDataParams) {
  // ── Map list state ──────────────────────────────────────────────────────────
  const [maps, setMaps] = useState<MapRecord[]>([])
  const [mapsLoading, setMapsLoading] = useState(true)
  const [mapError, setMapError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [editingMapId, setEditingMapId] = useState('')
  const [editName, setEditName] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<MapRecord | null>(null)
  const [deletingMapId, setDeletingMapId] = useState('')
  const [draggingMapId, setDraggingMapId] = useState('')
  const [dragOverMapId, setDragOverMapId] = useState('')

  // ── Per-map data state ──────────────────────────────────────────────────────
  const [tokens, setTokens] = useState<TokenRecord[]>([])
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([])
  const [activeAnnotationId, setActiveAnnotationId] = useState('')
  const [activeAnnotationDraft, setActiveAnnotationDraft] = useState('')
  const [tokenDeleteCandidate, setTokenDeleteCandidate] = useState<TokenRecord | null>(null)
  const [deletingTokenId, setDeletingTokenId] = useState('')
  const [mapMonsters, setMapMonsters] = useState<MonsterSummary[]>([])
  const [mapCharacters, setMapCharacters] = useState<CharacterTokenSummary[]>([])
  const [mapNpcs, setMapNpcs] = useState<NpcSummary[]>([])

  // ── Token asset state ───────────────────────────────────────────────────────
  const [tokenAssets, setTokenAssets] = useState<TokenAssetRecord[]>([])
  const [selectedTokenAssetId, setSelectedTokenAssetId] = useState('')
  const [tokenAssetDeleteCandidate, setTokenAssetDeleteCandidate] = useState<TokenAssetRecord | null>(null)
  const [deletingTokenAssetId, setDeletingTokenAssetId] = useState('')

  // ── Maps subscription ───────────────────────────────────────────────────────
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
            gridEnabled?: boolean
            gridVisible?: boolean
            gridCellScale?: number
            gridOffsetX?: number
            gridOffsetY?: number
            gridType?: unknown
            gridUnitsPerCell?: number
            gridCalibrated?: boolean
            sceneNpcIds?: string[]
            presentedNpcId?: string
            updatedAt?: { toMillis?: () => number }
          }
          const gridType: MapRecord['gridType'] =
            data.gridType === 'hex-pointy' || data.gridType === 'hex-flat'
              ? data.gridType
              : 'square'

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
            gridEnabled: data.gridEnabled === true,
            gridVisible: data.gridVisible === false ? false : true,
            gridCellScale:
              typeof data.gridCellScale === 'number' && Number.isFinite(data.gridCellScale)
                ? data.gridCellScale
                : DEFAULT_GRID_CELL_SCALE,
            gridOffsetX:
              typeof data.gridOffsetX === 'number' && Number.isFinite(data.gridOffsetX)
                ? data.gridOffsetX
                : 0,
            gridOffsetY:
              typeof data.gridOffsetY === 'number' && Number.isFinite(data.gridOffsetY)
                ? data.gridOffsetY
                : 0,
            gridType,
            gridUnitsPerCell:
              typeof data.gridUnitsPerCell === 'number' && Number.isFinite(data.gridUnitsPerCell)
                ? data.gridUnitsPerCell
                : 10,
            gridCalibrated: data.gridCalibrated === false ? false : true,
            sceneNpcIds: Array.isArray(data.sceneNpcIds)
              ? data.sceneNpcIds.filter((id): id is string => typeof id === 'string')
              : [],
            presentedNpcId: typeof data.presentedNpcId === 'string' ? data.presentedNpcId : '',
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

  // ── Resolve missing Storage download URLs ───────────────────────────────────
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

  // ── Token assets subscription ───────────────────────────────────────────────
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
              archived?: boolean
            }
            return {
              id: docSnap.id,
              name: typeof data.name === 'string' ? data.name : `Asset ${docSnap.id}`,
              imagePath: typeof data.imagePath === 'string' ? data.imagePath : '',
              imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
              width: typeof data.width === 'number' ? data.width : 0,
              height: typeof data.height === 'number' ? data.height : 0,
              archived: data.archived === true,
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

  // ── Tokens subscription (per map) ───────────────────────────────────────────
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
            monsterId?: string
            characterId?: string
            npcId?: string
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
            monsterId: typeof data.monsterId === 'string' ? data.monsterId : '',
            characterId: typeof data.characterId === 'string' ? data.characterId : undefined,
            npcId: typeof data.npcId === 'string' ? data.npcId : undefined,
          }
        })
        setTokens(next)

        // Trigger path animations for tokens moved by other clients.
        // tokensRef.current still holds pre-update positions here since setTokens
        // schedules a React update (doesn't flush synchronously).
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            // Seed lastAnimatedPathIdRef on initial load so subsequent
            // metadata-only updates (hide/unhide) don't replay stale paths.
            const data = change.doc.data() as { pathId?: unknown }
            const pathId = typeof data.pathId === 'string' ? data.pathId : null
            if (pathId) lastAnimatedPathIdRef.current[change.doc.id] = pathId
            return
          }
          if (change.type !== 'modified') return
          const tokenId = change.doc.id
          // Skip tokens this client just dropped — optimistic update already placed them.
          if (recentlyDroppedRef.current.has(tokenId)) return
          const data = change.doc.data() as { path?: unknown; pathId?: unknown }
          const incomingPathId = typeof data.pathId === 'string' ? data.pathId : null
          // Skip if this is the same path we already animated (e.g. hide/unhide on an old drop).
          if (incomingPathId && lastAnimatedPathIdRef.current[tokenId] === incomingPathId) return
          const rawPath = data.path
          if (!Array.isArray(rawPath) || rawPath.length < 2) return
          const path = (rawPath as unknown[])
            .filter((p): p is Record<string, unknown> =>
              typeof p === 'object' &&
              p !== null &&
              typeof (p as Record<string, unknown>).x === 'number' &&
              typeof (p as Record<string, unknown>).y === 'number',
            )
            .map((p): Waypoint => ({
              x: p.x as number,
              y: p.y as number,
              ...(typeof p.t === 'number' ? { t: p.t } : {}),
            }))
          if (path.length < 2) return
          const fromToken = tokensRef.current.find((t) => t.id === tokenId)
          if (!fromToken) return
          const updatedToken = next.find((t) => t.id === tokenId)
          if (!updatedToken) return
          if (incomingPathId) lastAnimatedPathIdRef.current[tokenId] = incomingPathId
          // Hidden tokens must never replay path animation. Covers:
          // 1) moved-while-hidden updates and 2) hide/unhide metadata updates.
          if (fromToken.hidden || updatedToken.hidden) return
          startTokenPathAnimationRef.current(tokenId, { x: fromToken.x, y: fromToken.y }, path, updatedToken)
        })
      },
      (err) => {
        setMapError(err.message)
      },
    )

    return () => unsub()
  }, [campaignId, selectedMapId, tokensRef, recentlyDroppedRef, lastAnimatedPathIdRef, startTokenPathAnimationRef])

  // ── Annotations subscription (per map) ──────────────────────────────────────
  useEffect(() => {
    if (!selectedMapId) {
      setAnnotations([])
      return
    }

    const annotationsCollection = collection(db, 'campaigns', campaignId, 'maps', selectedMapId, 'annotations')
    const annotationsQuery = role === 'gm'
      ? query(annotationsCollection)
      : query(
        annotationsCollection,
        where('kind', '==', 'player'),
        where('hidden', '==', false),
      )
    const unsub = onSnapshot(
      annotationsQuery,
      (snap) => {
        const next = snap.docs.map((docSnap) => {
          const data = docSnap.data() as {
            x?: number
            y?: number
            text?: string
            kind?: string
            hidden?: boolean
            pointerDirection?: string
          }
          return {
            id: docSnap.id,
            x: typeof data.x === 'number' ? data.x : 0.5,
            y: typeof data.y === 'number' ? data.y : 0.5,
            text: typeof data.text === 'string' ? data.text : '',
            kind: data.kind === 'player' ? ('player' as const) : ('gm' as const),
            hidden: data.hidden === true,
            pointerDirection: data.pointerDirection === 'down' ? ('down' as const) : ('up' as const),
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

  // ── Monsters subscription (for token spawn picker) ──────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'campaigns', campaignId, 'monsters'), (snap) => {
      setMapMonsters(
        snap.docs
          .map((d) => {
            const data = d.data()
            return {
              id: d.id,
              name: typeof data.name === 'string' ? data.name : '',
              tokenIcon: data.tokenIcon
                ? (data.tokenIcon as TokenIconConfig)
                : { icon: 'pawn' as const, color: '#bf2f2a', size: 34 },
            }
          })
          // Only surface monsters that have a custom token image configured.
          .filter((m) => m.tokenIcon.icon === 'custom' && !!m.tokenIcon.customImageUrl)
          .sort((a, b) => a.name.localeCompare(b.name))
      )
    })
    return () => unsub()
  }, [campaignId])

  // ── Characters subscription (for token spawn picker) ───────────────────────
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'campaigns', campaignId, 'characters'), (snap) => {
      setMapCharacters(
        snap.docs
          .map((d) => {
            const data = d.data()
            return {
              id: d.id,
              name: typeof data.name === 'string' ? data.name : '',
              tokenIcon: data.tokenIcon
                ? (data.tokenIcon as TokenIconConfig)
                : { icon: 'pawn' as const, color: '#bf2f2a', size: 34 },
            } satisfies CharacterTokenSummary
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
    })
    return () => unsub()
  }, [campaignId])

  // ── NPCs subscription (for token spawn picker + scene presentation) ───────
  useEffect(() => {
    const npcsCollection = collection(db, 'campaigns', campaignId, 'npcs')
    const npcsQuery = role === 'gm'
      ? query(npcsCollection)
      : query(npcsCollection, where('visibleToPlayers', '==', true))
    const unsub = onSnapshot(npcsQuery, (snap) => {
      setMapNpcs(
        snap.docs
          .map((d) => {
            const data = d.data()
            return {
              id: d.id,
              name: typeof data.name === 'string' ? data.name : '',
              title: typeof data.title === 'string' ? data.title : '',
              portraitUrl: typeof data.portraitUrl === 'string' ? data.portraitUrl : null,
              portraitFocusX: typeof data.portraitFocusX === 'number' ? data.portraitFocusX : 50,
              portraitFocusY: typeof data.portraitFocusY === 'number' ? data.portraitFocusY : 50,
              tokenIcon: data.tokenIcon
                ? (data.tokenIcon as TokenIconConfig)
                : { icon: 'pawn' as const, color: '#2f5bbf', size: 34 },
              playerDescription: typeof data.playerDescription === 'string' ? data.playerDescription : '',
              playerNotes: typeof data.playerNotes === 'string' ? data.playerNotes : '',
            } satisfies NpcSummary
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
    })
    return () => unsub()
  }, [campaignId, role])

  // ── Derived state ───────────────────────────────────────────────────────────
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
  }, [visibleMaps, setSelectedMapId])

  const selectedMap = visibleMaps.find((map) => map.id === selectedMapId) ?? null
  const selectedTokenAsset = tokenAssets.find((asset) => asset.id === selectedTokenAssetId) ?? null

  // ── Map CRUD ────────────────────────────────────────────────────────────────
  const handleMapUpload = async (file: File) => {
    setMapError(null)
    setUploading(true)

    try {
      const mapRef = doc(collection(db, 'campaigns', campaignId, 'maps'))
      const storagePath = `campaigns/${campaignId}/maps/${mapRef.id}`
      const primaryStorageRef = ref(storage, storagePath)

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
        gridEnabled: false,
        gridVisible: true,
        gridCellScale: DEFAULT_GRID_CELL_SCALE,
        gridOffsetX: 0,
        gridOffsetY: 0,
        gridType: 'square',
        gridUnitsPerCell: 10,
        gridCalibrated: true,
        sceneNpcIds: [],
        presentedNpcId: '',
        fogEnabled: true,
        fogGridSize: 128,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      try {
        const imageUrl = await getDownloadURL(primaryStorageRef)
        await updateDoc(mapRef, { imageUrl, updatedAt: serverTimestamp() })
      } catch {
        // URL resolution can fail transiently; the missing-URL resolver effect retries.
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
      if (deleteCandidate.imagePath) await deleteObject(ref(storage, deleteCandidate.imagePath))
      if (deleteCandidate.fogImagePath) await deleteObject(ref(storage, deleteCandidate.fogImagePath))
      if (deleteCandidate.visionBlockImagePath) await deleteObject(ref(storage, deleteCandidate.visionBlockImagePath))
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

  // ── Token CRUD ──────────────────────────────────────────────────────────────
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

  const toggleTokenHidden = async (tokenId: string) => {
    if (role !== 'gm') return
    const token = tokens.find((t) => t.id === tokenId)
    if (!token) return
    const next = !token.hidden
    setTokens((prev) => prev.map((t) => (t.id === tokenId ? { ...t, hidden: next } : t)))
    await updateToken(tokenId, { hidden: next })
  }

  const placeToken = async (clientX: number, clientY: number) => {
    if (!selectedMap || role !== 'gm') return
    const point = getDropPoint(clientX, clientY)
    if (!point) return

    const spawnMonster = mapMonsters.find((m) => m.id === selectedTokenAssetId) ?? null
    const spawnCharacter = mapCharacters.find((c) => c.id === selectedTokenAssetId) ?? null
    const spawnNpc = mapNpcs.find((n) => n.id === selectedTokenAssetId) ?? null

    if (spawnMonster) {
      const { tokenIcon } = spawnMonster
      const size = tokenIcon.size
      const sizeScale = size / TOKEN_REFERENCE_DIMENSION
      await addDoc(collection(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'tokens'), {
        x: point.x,
        y: point.y,
        color: tokenIcon.color,
        size,
        sizeScale,
        viewDistance: DEFAULT_TOKEN_VIEW_DISTANCE,
        viewDistanceScale: DEFAULT_TOKEN_VIEW_DISTANCE / TOKEN_REFERENCE_DIMENSION,
        party: false,
        name: spawnMonster.name,
        revealName: false,
        hidden: false,
        tokenImagePath: '',
        tokenImageUrl: tokenIcon.icon === 'custom' && tokenIcon.customImageUrl ? tokenIcon.customImageUrl : '',
        tokenImageWidth: 0,
        tokenImageHeight: 0,
        monsterId: spawnMonster.id,
        characterId: '',
        npcId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } else if (spawnCharacter) {
      const { tokenIcon } = spawnCharacter
      const size = tokenIcon.size
      const sizeScale = size / TOKEN_REFERENCE_DIMENSION
      await addDoc(collection(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'tokens'), {
        x: point.x,
        y: point.y,
        color: tokenIcon.color,
        size,
        sizeScale,
        viewDistance: DEFAULT_TOKEN_VIEW_DISTANCE,
        viewDistanceScale: DEFAULT_TOKEN_VIEW_DISTANCE / TOKEN_REFERENCE_DIMENSION,
        party: true,
        name: spawnCharacter.name,
        revealName: true,
        hidden: false,
        tokenImagePath: '',
        tokenImageUrl: tokenIcon.icon === 'custom' && tokenIcon.customImageUrl ? tokenIcon.customImageUrl : '',
        tokenImageWidth: 0,
        tokenImageHeight: 0,
        monsterId: '',
        characterId: spawnCharacter.id,
        npcId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } else if (spawnNpc) {
      const { tokenIcon } = spawnNpc
      const size = tokenIcon.size
      const sizeScale = size / TOKEN_REFERENCE_DIMENSION
      await addDoc(collection(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'tokens'), {
        x: point.x,
        y: point.y,
        color: tokenIcon.color,
        size,
        sizeScale,
        viewDistance: DEFAULT_TOKEN_VIEW_DISTANCE,
        viewDistanceScale: DEFAULT_TOKEN_VIEW_DISTANCE / TOKEN_REFERENCE_DIMENSION,
        party: false,
        name: spawnNpc.name,
        revealName: true,
        hidden: false,
        tokenImagePath: '',
        tokenImageUrl: tokenIcon.icon === 'custom' && tokenIcon.customImageUrl ? tokenIcon.customImageUrl : '',
        tokenImageWidth: 0,
        tokenImageHeight: 0,
        monsterId: '',
        characterId: '',
        npcId: spawnNpc.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    } else {
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
        monsterId: '',
        characterId: '',
        npcId: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    }
  }

  const updateSceneNpcIds = async (sceneNpcIds: string[]) => {
    if (!selectedMap || role !== 'gm') return
    const validIds = sceneNpcIds.filter((id, index) => !!id && sceneNpcIds.indexOf(id) === index)
    const presentedNpcId = validIds.includes(selectedMap.presentedNpcId) ? selectedMap.presentedNpcId : ''
    await updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id), {
      sceneNpcIds: validIds,
      presentedNpcId,
      updatedAt: serverTimestamp(),
    })
  }

  const setPresentedNpcId = async (npcId: string) => {
    if (!selectedMap || role !== 'gm') return
    await updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id), {
      presentedNpcId: npcId,
      updatedAt: serverTimestamp(),
    })
  }

  // ── Annotation CRUD ─────────────────────────────────────────────────────────
  const placeAnnotation = async (clientX: number, clientY: number, kind: 'gm' | 'player' = 'gm') => {
    if (!selectedMap || role !== 'gm') return
    const point = getDropPoint(clientX, clientY)
    if (!point) return
    const annotationRef = await addDoc(
      collection(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'annotations'),
      {
        x: point.x,
        y: point.y,
        text: '',
        kind,
        hidden: false,
        pointerDirection: 'up',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    )
    setActiveAnnotationId(annotationRef.id)
    setActiveAnnotationDraft('')
  }

  const commitActiveAnnotation = async () => {
    if (!selectedMap || role !== 'gm') return
    const activeAnnotation = annotations.find((a) => a.id === activeAnnotationId)
    if (!activeAnnotation) return
    const nextText = activeAnnotationDraft.trim()
    if (nextText === activeAnnotation.text.trim()) return
    await updateDoc(
      doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'annotations', activeAnnotation.id),
      { text: nextText, updatedAt: serverTimestamp() },
    )
  }

  const deleteAnnotation = async (annotationId: string) => {
    if (!selectedMap || role !== 'gm') return
    await deleteDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'annotations', annotationId))
  }

  const toggleAnnotationHidden = async (annotationId: string) => {
    if (!selectedMap || role !== 'gm') return
    const annotation = annotations.find((entry) => entry.id === annotationId)
    if (!annotation) return
    const nextHidden = !annotation.hidden
    setAnnotations((current) =>
      current.map((entry) => (entry.id === annotationId ? { ...entry, hidden: nextHidden } : entry)),
    )
    await updateDoc(
      doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'annotations', annotationId),
      { hidden: nextHidden, updatedAt: serverTimestamp() },
    )
  }

  const toggleAnnotationPointerDirection = async (annotationId: string) => {
    if (!selectedMap || role !== 'gm') return
    const annotation = annotations.find((entry) => entry.id === annotationId)
    if (!annotation) return
    const nextDirection = annotation.pointerDirection === 'down' ? 'up' : 'down'
    setAnnotations((current) =>
      current.map((entry) => (
        entry.id === annotationId
          ? { ...entry, pointerDirection: nextDirection }
          : entry
      )),
    )
    await updateDoc(
      doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'annotations', annotationId),
      { pointerDirection: nextDirection, updatedAt: serverTimestamp() },
    )
  }

  const moveAnnotationPosition = (annotationId: string, x: number, y: number) => {
    const clampedX = Math.max(0, Math.min(1, x))
    const clampedY = Math.max(0, Math.min(1, y))
    setAnnotations((current) =>
      current.map((annotation) =>
        annotation.id === annotationId
          ? { ...annotation, x: clampedX, y: clampedY }
          : annotation,
        ),
    )
  }

  const persistAnnotationPosition = async (annotationId: string, x: number, y: number) => {
    if (!selectedMap || role !== 'gm') return
    const clampedX = Math.max(0, Math.min(1, x))
    const clampedY = Math.max(0, Math.min(1, y))
    await updateDoc(
      doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'annotations', annotationId),
      { x: clampedX, y: clampedY, updatedAt: serverTimestamp() },
    )
  }

  // ── Token asset CRUD ────────────────────────────────────────────────────────
  const saveTokenAssetFile = async (nextFile: File, width: number, height: number, assetName?: string) => {
    const safeName = nextFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const tokenAssetPath = `campaigns/${campaignId}/token-assets/${Date.now()}-${safeName}`
    const tokenAssetRef = ref(storage, tokenAssetPath)
    await uploadBytes(tokenAssetRef, nextFile, { contentType: nextFile.type })
    const url = await getDownloadURL(tokenAssetRef)
    const fallbackName = nextFile.name.replace(/\.[^/.]+$/, '')
    const name = (assetName?.trim() || fallbackName).slice(0, 80)
    const assetRef = await addDoc(collection(db, 'campaigns', campaignId, 'tokenAssets'), {
      name,
      imagePath: tokenAssetPath,
      imageUrl: url,
      width,
      height,
      archived: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    setTokenAssets((prev) =>
      [...prev, { id: assetRef.id, name, imagePath: tokenAssetPath, imageUrl: url, width, height, archived: false }]
        .sort((a, b) => a.name.localeCompare(b.name)),
    )
    setSelectedTokenAssetId(assetRef.id)
  }

  const archiveTokenAsset = async (assetId: string, archived: boolean) => {
    await updateDoc(doc(db, 'campaigns', campaignId, 'tokenAssets', assetId), {
      archived,
      updatedAt: serverTimestamp(),
    })
  }

  const requestDeleteTokenAsset = (assetId: string) => {
    const asset = tokenAssets.find((entry) => entry.id === assetId)
    if (!asset) return
    setTokenAssetDeleteCandidate(asset)
  }

  const confirmDeleteTokenAsset = async () => {
    if (!tokenAssetDeleteCandidate) return
    setDeletingTokenAssetId(tokenAssetDeleteCandidate.id)
    try {
      if (tokenAssetDeleteCandidate.imagePath) {
        await deleteObject(ref(storage, tokenAssetDeleteCandidate.imagePath))
      }
      await deleteDoc(doc(db, 'campaigns', campaignId, 'tokenAssets', tokenAssetDeleteCandidate.id))
      if (selectedTokenAssetId === tokenAssetDeleteCandidate.id) {
        setSelectedTokenAssetId('')
      }
      setTokenAssetDeleteCandidate(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete token icon'
      setMapError(message)
    } finally {
      setDeletingTokenAssetId('')
    }
  }

  return {
    // Map list
    maps,
    setMaps,
    mapsLoading,
    mapError,
    setMapError,
    uploading,
    editingMapId,
    setEditingMapId,
    editName,
    setEditName,
    deleteCandidate,
    setDeleteCandidate,
    deletingMapId,
    draggingMapId,
    setDraggingMapId,
    dragOverMapId,
    setDragOverMapId,
    // Per-map data
    tokens,
    setTokens,
    annotations,
    activeAnnotationId,
    setActiveAnnotationId,
    activeAnnotationDraft,
    setActiveAnnotationDraft,
    tokenDeleteCandidate,
    setTokenDeleteCandidate,
    deletingTokenId,
    mapMonsters,
    mapCharacters,
    mapNpcs,
    // Token assets
    tokenAssets,
    selectedTokenAssetId,
    setSelectedTokenAssetId,
    selectedTokenAsset,
    tokenAssetDeleteCandidate,
    setTokenAssetDeleteCandidate,
    deletingTokenAssetId,
    // Derived
    visibleMaps,
    selectedMap,
    // Map CRUD
    handleMapUpload,
    startRename,
    saveRename,
    deleteMap,
    togglePlayerVisibility,
    persistMapOrder,
    handleDragStart,
    handleDrop,
    // Token CRUD
    updateToken,
    deleteToken,
    requestDeleteToken,
    confirmDeleteToken,
    toggleTokenHidden,
    placeToken,
    updateSceneNpcIds,
    setPresentedNpcId,
    // Annotation CRUD
    placeAnnotation,
    commitActiveAnnotation,
    deleteAnnotation,
    toggleAnnotationHidden,
    toggleAnnotationPointerDirection,
    moveAnnotationPosition,
    persistAnnotationPosition,
    // Token asset CRUD
    saveTokenAssetFile,
    archiveTokenAsset,
    requestDeleteTokenAsset,
    confirmDeleteTokenAsset,
  }
}
