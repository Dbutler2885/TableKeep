import { useEffect, useMemo, useState } from 'react'
import type { MutableRefObject } from 'react'
import {
  addDoc,
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
import { campaignCollectionRef, campaignDocRef } from '../../campaign/firestorePaths'
import { normalizeImageForUpload } from '../../common/imageNormalization'
import type { TokenIconConfig } from '../../tokens/TokenIconEditor'
import { isRenderableImageUrl, resolveStoragePathUrl } from '../../common/mediaStorage'
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
import type { TokenPlacementCommand } from '../lib/tokenPlacementQueue'

const MAP_UPLOAD_MAX_DIMENSION = 2048

type UseMapDataParams = {
  campaignId: string
  groupId: string
  role: Role | null
  selectedMapId: string
  setSelectedMapId: (id: string | ((prev: string) => string)) => void
  // Coord resolver: converts screen coords to normalized map coords (owned by fog/viewport)
  getDropPoint: (clientX: number, clientY: number) => { x: number; y: number } | null
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
  groupId,
  role,
  selectedMapId,
  setSelectedMapId,
  getDropPoint,
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
  const [tokenDeleteCandidate, setTokenDeleteCandidate] = useState<TokenRecord[] | null>(null)
  const [deletingTokenId, setDeletingTokenId] = useState('')
  const [mapMonsters, setMapMonsters] = useState<MonsterSummary[]>([])
  const [mapCharacters, setMapCharacters] = useState<CharacterTokenSummary[]>([])
  const [mapNpcs, setMapNpcs] = useState<NpcSummary[]>([])

  // ── Token asset state ───────────────────────────────────────────────────────
  const [tokenAssets, setTokenAssets] = useState<TokenAssetRecord[]>([])
  const [selectedTokenAssetId, setSelectedTokenAssetId] = useState('')
  const [tokenAssetDeleteCandidate, setTokenAssetDeleteCandidate] = useState<TokenAssetRecord | null>(null)
  const [deletingTokenAssetId, setDeletingTokenAssetId] = useState('')

  const scope = { campaignId, groupId }
  const mapsCollectionRef = campaignCollectionRef(db, scope, 'maps')
  const mapDocRef = (mapId: string) => campaignDocRef(db, scope, 'maps', mapId)
  const mapTokensCollectionRef = (mapId: string) => campaignCollectionRef(db, scope, 'maps', mapId, 'tokens')
  const mapTokenDocRef = (mapId: string, tokenId: string) => campaignDocRef(db, scope, 'maps', mapId, 'tokens', tokenId)
  const mapAnnotationsCollectionRef = (mapId: string) => campaignCollectionRef(db, scope, 'maps', mapId, 'annotations')
  const mapAnnotationDocRef = (mapId: string, annotationId: string) =>
    campaignDocRef(db, scope, 'maps', mapId, 'annotations', annotationId)
  const tokenAssetsCollectionRef = campaignCollectionRef(db, scope, 'tokenAssets')
  const tokenAssetDocRef = (assetId: string) => campaignDocRef(db, scope, 'tokenAssets', assetId)
  const npcsCollectionRef = campaignCollectionRef(db, scope, 'npcs')
  const npcDocRef = (npcId: string) => campaignDocRef(db, scope, 'npcs', npcId)

  // ── Maps subscription ───────────────────────────────────────────────────────
  useEffect(() => {
    const mapsQuery = query(mapsCollectionRef)
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
  }, [campaignId, groupId])

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
        await updateDoc(mapDocRef(map.id), {
          imageUrl: url,
          updatedAt: serverTimestamp(),
        })
      }),
      ...missingFogUrlMaps.map(async (map) => {
        const url = await getDownloadURL(ref(storage, map.fogImagePath))
        await updateDoc(mapDocRef(map.id), {
          fogImageUrl: url,
          updatedAt: serverTimestamp(),
        })
      }),
      ...missingVisionUrlMaps.map(async (map) => {
        const url = await getDownloadURL(ref(storage, map.visionBlockImagePath))
        await updateDoc(mapDocRef(map.id), {
          visionBlockImageUrl: url,
          updatedAt: serverTimestamp(),
        })
      }),
    ])
  }, [campaignId, groupId, maps])

  // ── Token assets subscription ───────────────────────────────────────────────
  useEffect(() => {
    const assetsQuery = query(tokenAssetsCollectionRef)
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
  }, [campaignId, groupId])

  // ── Tokens subscription (per map) ───────────────────────────────────────────
  useEffect(() => {
    if (!selectedMapId) {
      setTokens([])
      return
    }

    const tokensQuery = query(mapTokensCollectionRef(selectedMapId))
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
            rotationDeg?: number
            flipHorizontal?: boolean
            flipVertical?: boolean
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
            group?: string
          }

          return {
            id: docSnap.id,
            x: typeof data.x === 'number' ? data.x : 0.5,
            y: typeof data.y === 'number' ? data.y : 0.5,
            color: typeof data.color === 'string' ? data.color : '#b45309',
            size: typeof data.size === 'number' ? data.size : 28,
            sizeScale: typeof data.sizeScale === 'number' ? data.sizeScale : null,
            rotationDeg: typeof data.rotationDeg === 'number' && Number.isFinite(data.rotationDeg)
              ? ((data.rotationDeg % 360) + 360) % 360
              : 0,
            flipHorizontal: data.flipHorizontal === true,
            flipVertical: data.flipVertical === true,
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
            group: typeof data.group === 'string' && data.group ? data.group : undefined,
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
  }, [campaignId, groupId, selectedMapId, tokensRef, recentlyDroppedRef, lastAnimatedPathIdRef, startTokenPathAnimationRef])

  // ── Annotations subscription (per map) ──────────────────────────────────────
  useEffect(() => {
    if (!selectedMapId) {
      setAnnotations([])
      return
    }

    const annotationsCollection = mapAnnotationsCollectionRef(selectedMapId)
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
  }, [campaignId, groupId, role, selectedMapId])

  // ── Monsters subscription (for token spawn picker) ──────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(campaignCollectionRef(db, scope, 'monsters'), (snap) => {
      setMapMonsters((current) =>
        snap.docs
          .map((d) => {
            const data = d.data()
            const local = current.find((monster) => monster.id === d.id)
            const name = (typeof data.name === 'string' && data.name)
              || (typeof data.typeName === 'string' && data.typeName)
              || ''
            const tokenIcon = data.tokenIcon
              ? (data.tokenIcon as TokenIconConfig)
              : { icon: 'pawn' as const, color: '#bf2f2a', size: 34 }
            const customImageUrl = tokenIcon.customImageUrl
              ?? (
                tokenIcon.customImagePath
                && local
                && local.tokenIcon.customImagePath === tokenIcon.customImagePath
                && isRenderableImageUrl(local.tokenIcon.customImageUrl)
                  ? local.tokenIcon.customImageUrl
                  : undefined
              )
            return {
              id: d.id,
              name,
              tokenIcon: customImageUrl ? { ...tokenIcon, customImageUrl } : tokenIcon,
            }
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
    })
    return () => unsub()
  }, [campaignId, groupId])

  // ── Characters subscription (for token spawn picker) ───────────────────────
  useEffect(() => {
    const unsub = onSnapshot(campaignCollectionRef(db, scope, 'characters'), (snap) => {
      setMapCharacters((current) =>
        snap.docs
          .map((d) => {
            const data = d.data()
            const local = current.find((character) => character.id === d.id)
            const tokenIcon = data.tokenIcon
              ? (data.tokenIcon as TokenIconConfig)
              : { icon: 'pawn' as const, color: '#bf2f2a', size: 34 }
            const customImageUrl = tokenIcon.customImageUrl
              ?? (
                tokenIcon.customImagePath
                && local
                && local.tokenIcon.customImagePath === tokenIcon.customImagePath
                && isRenderableImageUrl(local.tokenIcon.customImageUrl)
                  ? local.tokenIcon.customImageUrl
                  : undefined
              )
            return {
              id: d.id,
              name: typeof data.name === 'string' ? data.name : '',
              tokenIcon: customImageUrl ? { ...tokenIcon, customImageUrl } : tokenIcon,
            } satisfies CharacterTokenSummary
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
    })
    return () => unsub()
  }, [campaignId, groupId])

  // ── NPCs subscription (for token spawn picker + scene presentation) ───────
  useEffect(() => {
    const npcsCollection = npcsCollectionRef
    const npcsQuery = role === 'gm'
      ? query(npcsCollection)
      : query(npcsCollection, where('visibleToPlayers', '==', true))
    const unsub = onSnapshot(npcsQuery, (snap) => {
      setMapNpcs((current) =>
        snap.docs
          .map((d) => {
            const data = d.data()
            const local = current.find((npc) => npc.id === d.id)
            const portraitPath = typeof data.portraitPath === 'string' ? data.portraitPath : ''
            const persistedPortraitUrl = typeof data.portraitUrl === 'string' ? data.portraitUrl : null
            const tokenIcon = data.tokenIcon
              ? (data.tokenIcon as TokenIconConfig)
              : { icon: 'pawn' as const, color: '#2f5bbf', size: 34 }
            const portraitUrl = persistedPortraitUrl
              ?? (local?.portraitPath === portraitPath && isRenderableImageUrl(local.portraitUrl) ? local.portraitUrl : null)
            const customImageUrl = tokenIcon.customImageUrl
              ?? (
                tokenIcon.customImagePath
                && local
                && local.tokenIcon.customImagePath === tokenIcon.customImagePath
                && isRenderableImageUrl(local.tokenIcon.customImageUrl)
                  ? local.tokenIcon.customImageUrl
                  : undefined
              )
            return {
              id: d.id,
              name: typeof data.name === 'string' ? data.name : '',
              title: typeof data.title === 'string' ? data.title : '',
              tags: Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === 'string') : [],
              portraitPath,
              portraitUrl,
              portraitFocusX: typeof data.portraitFocusX === 'number' ? data.portraitFocusX : 50,
              portraitFocusY: typeof data.portraitFocusY === 'number' ? data.portraitFocusY : 50,
              tokenIcon: customImageUrl ? { ...tokenIcon, customImageUrl } : tokenIcon,
              playerDescription: typeof data.playerDescription === 'string' ? data.playerDescription : '',
              playerNotes: typeof data.playerNotes === 'string' ? data.playerNotes : '',
            } satisfies NpcSummary
          })
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
    })
    return () => unsub()
  }, [campaignId, groupId, role])

  useEffect(() => {
    const monstersNeedingMedia = mapMonsters.filter(
      (monster) => monster.tokenIcon.customImagePath && !isRenderableImageUrl(monster.tokenIcon.customImageUrl),
    )
    if (monstersNeedingMedia.length === 0) return

    void Promise.allSettled(
      monstersNeedingMedia.map(async (monster) => {
        const customImageUrl = (await resolveStoragePathUrl(monster.tokenIcon.customImagePath as string)) ?? undefined
        setMapMonsters((current) =>
          current.map((entry) =>
            entry.id === monster.id
              ? {
                  ...entry,
                  tokenIcon: {
                    ...entry.tokenIcon,
                    customImageUrl,
                  },
                }
              : entry,
          ),
        )
      }),
    )
  }, [mapMonsters])

  useEffect(() => {
    const charactersNeedingMedia = mapCharacters.filter(
      (character) => character.tokenIcon.customImagePath && !isRenderableImageUrl(character.tokenIcon.customImageUrl),
    )
    if (charactersNeedingMedia.length === 0) return

    void Promise.allSettled(
      charactersNeedingMedia.map(async (character) => {
        const customImageUrl = (await resolveStoragePathUrl(character.tokenIcon.customImagePath as string)) ?? undefined
        setMapCharacters((current) =>
          current.map((entry) =>
            entry.id === character.id
              ? {
                  ...entry,
                  tokenIcon: {
                    ...entry.tokenIcon,
                    customImageUrl,
                  },
                }
              : entry,
          ),
        )
      }),
    )
  }, [mapCharacters])

  useEffect(() => {
    const npcsNeedingMedia = mapNpcs.filter((npc) =>
      (npc.portraitPath && !isRenderableImageUrl(npc.portraitUrl))
      || (npc.tokenIcon.customImagePath && !isRenderableImageUrl(npc.tokenIcon.customImageUrl)),
    )
    if (npcsNeedingMedia.length === 0) return

    void Promise.allSettled(
      npcsNeedingMedia.map(async (npc) => {
        const [portraitUrl, customImageUrl] = await Promise.all([
          npc.portraitPath ? resolveStoragePathUrl(npc.portraitPath) : Promise.resolve<string | null>(null),
          npc.tokenIcon.customImagePath ? resolveStoragePathUrl(npc.tokenIcon.customImagePath) : Promise.resolve<string | null>(null),
        ])
        setMapNpcs((current) =>
          current.map((entry) =>
            entry.id === npc.id
              ? {
                  ...entry,
                  ...(portraitUrl ? { portraitUrl } : {}),
                  ...(customImageUrl
                    ? {
                        tokenIcon: {
                          ...entry.tokenIcon,
                          customImageUrl,
                        },
                      }
                    : {}),
                }
              : entry,
          ),
        )
      }),
    )
  }, [mapNpcs])

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
      const normalized = await normalizeImageForUpload(file, {
        maxWidth: MAP_UPLOAD_MAX_DIMENSION,
        maxHeight: MAP_UPLOAD_MAX_DIMENSION,
        preferType: 'image/webp',
        quality: 0.9,
      })
      const mapRef = doc(mapsCollectionRef)
      const storagePath = groupId
        ? `groups/${groupId}/campaigns/${campaignId}/maps/${mapRef.id}`
        : `campaigns/${campaignId}/maps/${mapRef.id}`
      const primaryStorageRef = ref(storage, storagePath)

      // Ensure auth token is fresh before Storage writes.
      await auth.currentUser?.getIdToken(true)
      await uploadBytes(primaryStorageRef, normalized.file, { contentType: normalized.file.type })

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
        width: normalized.width,
        height: normalized.height,
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
    await updateDoc(mapDocRef(mapId), {
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
      await deleteDoc(mapDocRef(deleteCandidate.id))
      setDeleteCandidate(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed'
      setMapError(`Delete failed: ${message}`)
    } finally {
      setDeletingMapId('')
    }
  }

  const togglePlayerVisibility = async (map: MapRecord, checked: boolean) => {
    await updateDoc(mapDocRef(map.id), {
      visibleToPlayers: checked,
      updatedAt: serverTimestamp(),
    })
  }

  const persistMapOrder = async (ordered: MapRecord[]) => {
    const batch = writeBatch(db)
    ordered.forEach((map, index) => {
      batch.update(mapDocRef(map.id), {
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
        | 'color'
        | 'size'
        | 'sizeScale'
        | 'rotationDeg'
        | 'flipHorizontal'
        | 'flipVertical'
        | 'viewDistance'
        | 'viewDistanceScale'
        | 'party'
        | 'name'
        | 'revealName'
        | 'hidden'
        | 'group'
      >
    >,
  ) => {
    if (!selectedMap || role !== 'gm') return
    const nextUpdates = { ...updates } as typeof updates
    if (typeof nextUpdates.viewDistance === 'number' && typeof nextUpdates.viewDistanceScale !== 'number') {
      nextUpdates.viewDistanceScale = nextUpdates.viewDistance / TOKEN_REFERENCE_DIMENSION
    }
    await updateDoc(mapTokenDocRef(selectedMap.id, tokenId), {
      ...nextUpdates,
      updatedAt: serverTimestamp(),
    })
  }

  const deleteToken = async (tokenId: string) => {
    if (!selectedMap || role !== 'gm') return
    await deleteDoc(mapTokenDocRef(selectedMap.id, tokenId))
  }

  const requestDeleteToken = (tokenId: string) => {
    const token = tokens.find((entry) => entry.id === tokenId)
    if (!token) return
    setTokenDeleteCandidate([token])
  }

  const requestDeleteTokens = (tokenIds: string[]) => {
    const tokenIdSet = new Set(tokenIds)
    const deleteCandidates = tokens.filter((entry) => tokenIdSet.has(entry.id))
    if (deleteCandidates.length === 0) return
    setTokenDeleteCandidate(deleteCandidates)
  }

  const confirmDeleteToken = async () => {
    if (!selectedMap || !tokenDeleteCandidate || tokenDeleteCandidate.length === 0) return
    setDeletingTokenId(tokenDeleteCandidate.length === 1 ? tokenDeleteCandidate[0].id : 'bulk')
    try {
      const batch = writeBatch(db)
      tokenDeleteCandidate.forEach((token) => {
        batch.delete(mapTokenDocRef(selectedMap.id, token.id))
      })
      await batch.commit()
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

  const placeQueuedToken = async (command: TokenPlacementCommand) => {
    if (!selectedMap || role !== 'gm') return
    const size = command.tokenIcon.size
    const sizeScale = size / TOKEN_REFERENCE_DIMENSION
    await addDoc(mapTokensCollectionRef(selectedMap.id), {
      x: command.point.x,
      y: command.point.y,
      color: command.tokenIcon.color,
      size,
      sizeScale,
      rotationDeg: 0,
      flipHorizontal: false,
      flipVertical: false,
      viewDistance: DEFAULT_TOKEN_VIEW_DISTANCE,
      viewDistanceScale: DEFAULT_TOKEN_VIEW_DISTANCE / TOKEN_REFERENCE_DIMENSION,
      party: command.party,
      name: command.name,
      revealName: command.revealName,
      hidden: false,
      tokenImagePath: command.tokenImagePath,
      tokenImageUrl: command.tokenImageUrl,
      tokenImageWidth: command.tokenImageWidth,
      tokenImageHeight: command.tokenImageHeight,
      monsterId: command.monsterId,
      characterId: command.characterId,
      npcId: command.npcId,
      tokenAssetId: command.tokenAssetId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  const updateSceneNpcIds = async (sceneNpcIds: string[]) => {
    if (!selectedMap || role !== 'gm') return
    const validIds = sceneNpcIds.filter((id, index) => !!id && sceneNpcIds.indexOf(id) === index)
    const presentedNpcId = validIds.includes(selectedMap.presentedNpcId) ? selectedMap.presentedNpcId : ''
    await updateDoc(mapDocRef(selectedMap.id), {
      sceneNpcIds: validIds,
      presentedNpcId,
      updatedAt: serverTimestamp(),
    })
  }

  const setPresentedNpcId = async (npcId: string) => {
    if (!selectedMap || role !== 'gm') return
    if (!npcId) {
      await updateDoc(mapDocRef(selectedMap.id), {
        presentedNpcId: '',
        updatedAt: serverTimestamp(),
      })
      return
    }

    const batch = writeBatch(db)
    batch.update(mapDocRef(selectedMap.id), {
      presentedNpcId: npcId,
      updatedAt: serverTimestamp(),
    })
    batch.set(
      npcDocRef(npcId),
      {
        visibleToPlayers: true,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
    await batch.commit()
  }

  // ── Annotation CRUD ─────────────────────────────────────────────────────────
  const placeAnnotation = async (clientX: number, clientY: number, kind: 'gm' | 'player' = 'gm') => {
    if (!selectedMap || role !== 'gm') return
    const point = getDropPoint(clientX, clientY)
    if (!point) return
    await addDoc(
      mapAnnotationsCollectionRef(selectedMap.id),
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
  }

  const commitActiveAnnotation = async () => {
    if (!selectedMap || role !== 'gm') return
    const activeAnnotation = annotations.find((a) => a.id === activeAnnotationId)
    if (!activeAnnotation) return
    const nextText = activeAnnotationDraft.trim()
    if (nextText === activeAnnotation.text.trim()) return
    await updateDoc(
      mapAnnotationDocRef(selectedMap.id, activeAnnotation.id),
      { text: nextText, updatedAt: serverTimestamp() },
    )
  }

  const deleteAnnotation = async (annotationId: string) => {
    if (!selectedMap || role !== 'gm') return
    await deleteDoc(mapAnnotationDocRef(selectedMap.id, annotationId))
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
      mapAnnotationDocRef(selectedMap.id, annotationId),
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
      mapAnnotationDocRef(selectedMap.id, annotationId),
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
      mapAnnotationDocRef(selectedMap.id, annotationId),
      { x: clampedX, y: clampedY, updatedAt: serverTimestamp() },
    )
  }

  // ── Token asset CRUD ────────────────────────────────────────────────────────
  const saveTokenAssetFile = async (nextFile: File, width: number, height: number, assetName?: string) => {
    const safeName = nextFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const tokenAssetPath = groupId
      ? `groups/${groupId}/campaigns/${campaignId}/token-assets/${Date.now()}-${safeName}`
      : `campaigns/${campaignId}/token-assets/${Date.now()}-${safeName}`
    const tokenAssetRef = ref(storage, tokenAssetPath)
    await uploadBytes(tokenAssetRef, nextFile, { contentType: nextFile.type })
    const url = await getDownloadURL(tokenAssetRef)
    const fallbackName = nextFile.name.replace(/\.[^/.]+$/, '')
    const name = (assetName?.trim() || fallbackName).slice(0, 80)
    const assetRef = await addDoc(tokenAssetsCollectionRef, {
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
    await updateDoc(tokenAssetDocRef(assetId), {
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
      await deleteDoc(tokenAssetDocRef(tokenAssetDeleteCandidate.id))
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
    requestDeleteTokens,
    confirmDeleteToken,
    toggleTokenHidden,
    placeQueuedToken,
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
