import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEventHandler,
  FormEvent,
  MouseEventHandler,
  TouchEventHandler,
  WheelEventHandler,
} from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  where,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import {
  Check,
  ChessPawn,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eraser,
  Eye,
  EyeOff,
  Map,
  Maximize2,
  Menu,
  Pencil,
  SlidersHorizontal,
  SprayCan,
  Trash2,
  TvMinimalPlay,
  Upload,
  X,
} from 'lucide-react'
import './App.css'
import { auth, db, storage } from './firebase'
import { firebaseConfig } from './firebase/config'

type Role = 'gm' | 'player'
type AppTab = 'character' | 'maps' | 'npcs' | 'notes' | 'rules'

type Campaign = {
  id: string
  name: string
  status: string
}

type CharacterRecord = {
  id: string
  name: string
  ownerUserId: string
  className: string
  level: number
  hpCurrent: number
  hpMax: number
  ac: number
  xp: number
}

type MapRecord = {
  id: string
  name: string
  imagePath: string
  imageUrl: string
  fogDataUrl: string
  visionBlockDataUrl: string
  fullyHidden: boolean
  width: number
  height: number
  sortOrder: number
  visibleToPlayers: boolean
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
}

const TOKEN_REFERENCE_DIMENSION = 900
const DEFAULT_TOKEN_VIEW_DISTANCE = 120
const BRUSH_SIZE_MIN = 8
const TOKEN_VIEW_DISTANCE_MAX = 600
const LOS_SURFACE_REVEAL_MULTIPLIER = 2.4
const LOS_BLOCKER_SAMPLE_RADIUS = 2
const LIVE_DRAG_WRITE_INTERVAL_MS = 80
const LIVE_DRAG_EPSILON = 0.0015
const LIVE_FOG_WRITE_INTERVAL_MS = 900

const tabs: Array<{ id: AppTab; label: string }> = [
  { id: 'character', label: 'Character' },
  { id: 'maps', label: 'Maps' },
  { id: 'npcs', label: 'NPCs' },
  { id: 'notes', label: 'Notes' },
  { id: 'rules', label: 'Rules' },
]

const gmEmails = (import.meta.env.VITE_GM_EMAILS ?? '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)

const mockCharacters: CharacterRecord[] = [
  {
    id: 'mock-aldith',
    name: 'Aldith Fen',
    ownerUserId: 'mock-player-1',
    className: 'Cleric',
    level: 2,
    hpCurrent: 9,
    hpMax: 11,
    ac: 14,
    xp: 1860,
  },
  {
    id: 'mock-brann',
    name: 'Brann Ironroot',
    ownerUserId: 'mock-player-2',
    className: 'Fighter',
    level: 2,
    hpCurrent: 12,
    hpMax: 12,
    ac: 15,
    xp: 1720,
  },
  {
    id: 'mock-sable',
    name: 'Sable Thorne',
    ownerUserId: 'mock-player-3',
    className: 'Thief',
    level: 2,
    hpCurrent: 7,
    hpMax: 8,
    ac: 13,
    xp: 1640,
  },
  {
    id: 'mock-elin',
    name: 'Elin Vale',
    ownerUserId: 'mock-player-4',
    className: 'Magic-User',
    level: 2,
    hpCurrent: 5,
    hpMax: 6,
    ac: 12,
    xp: 1910,
  },
]

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)
      setAuthReady(true)

      if (nextUser) {
        await setDoc(
          doc(db, 'users', nextUser.uid),
          {
            email: nextUser.email ?? null,
            displayName: nextUser.displayName ?? null,
            photoURL: nextUser.photoURL ?? null,
            lastLoginAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true },
        )
      }
    })

    return () => unsub()
  }, [])

  if (!authReady) {
    return (
      <main className="auth-shell">
        <p>Loading authentication...</p>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <h1>Home Boys House</h1>
        <p>Sign in to access your OSE campaign sidecar.</p>
        <AuthPanel />
      </main>
    )
  }

  return <CampaignShell user={user} />
}

function AuthPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runAction = async (fn: () => Promise<unknown>) => {
    setError(null)
    setStatus(null)
    try {
      await fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
    }
  }

  const handlePasswordSignIn = async (event: FormEvent) => {
    event.preventDefault()
    await runAction(async () => {
      await signInWithEmailAndPassword(auth, email, password)
      setStatus('Signed in.')
    })
  }

  const handlePasswordSignUp = async () => {
    await runAction(async () => {
      await createUserWithEmailAndPassword(auth, email, password)
      setStatus('Account created.')
    })
  }

  const handleGoogleSignIn = async () => {
    await runAction(async () => {
      const provider = new GoogleAuthProvider()
      try {
        await signInWithPopup(auth, provider)
        setStatus('Signed in with Google.')
      } catch (err: unknown) {
        const code = typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code)
          : ''

        if (code.includes('popup-blocked') || code.includes('popup-closed-by-user')) {
          await signInWithRedirect(auth, provider)
          setStatus('Redirecting to Google sign-in...')
          return
        }

        throw err
      }
    })
  }

  return (
    <section className="panel">
      <h2>Sign In</h2>

      <form onSubmit={handlePasswordSignIn} className="stack">
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </label>

        <button type="submit">Sign In with Email</button>
      </form>

      <div className="row">
        <button type="button" onClick={handlePasswordSignUp}>
          Create Account
        </button>
        <button type="button" onClick={handleGoogleSignIn}>
          Sign In with Google
        </button>
      </div>

      {status ? <p className="success">{status}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  )
}

function CampaignShell({ user }: { user: User }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<AppTab>('character')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [characters, setCharacters] = useState<CharacterRecord[]>([])
  const [charactersLoading, setCharactersLoading] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState('')

  useEffect(() => {
    let cancelled = false

    const initCampaignAccess = async () => {
      setLoading(true)
      setError(null)

      try {
        const email = (user.email ?? '').toLowerCase()
        const desiredRole: Role = gmEmails.includes(email) ? 'gm' : 'player'

        const activeCampaignSnap = await getDocs(
          query(collection(db, 'campaigns'), where('status', '==', 'active'), limit(1)),
        )

        let campaignId = activeCampaignSnap.docs[0]?.id ?? null

        if (!campaignId) {
          if (desiredRole !== 'gm') {
            throw new Error('No active campaign exists yet. Ask the GM to sign in first.')
          }

          const createdCampaign = await addDoc(collection(db, 'campaigns'), {
            name: 'My OSE Module',
            slug: 'my-ose-module',
            status: 'active',
            createdBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            activeMapId: null,
          })

          campaignId = createdCampaign.id
        }

        await setDoc(
          doc(db, 'campaigns', campaignId, 'members', user.uid),
          {
            userId: user.uid,
            role: desiredRole,
            status: 'active',
            joinedAt: serverTimestamp(),
          },
          { merge: true },
        )

        await setDoc(
          doc(db, 'users', user.uid, 'campaignMemberships', campaignId),
          {
            campaignId,
            userId: user.uid,
            role: desiredRole,
            status: 'active',
            joinedAt: serverTimestamp(),
          },
          { merge: true },
        )

        const campaignDoc = await getDoc(doc(db, 'campaigns', campaignId))
        if (!campaignDoc.exists()) {
          throw new Error('Active campaign document could not be loaded.')
        }

        const data = campaignDoc.data() as { name?: string; status?: string }

        if (!cancelled) {
          setCampaign({
            id: campaignId,
            name: data.name ?? campaignId,
            status: data.status ?? 'active',
          })
          setRole(desiredRole)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        if (!cancelled) {
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void initCampaignAccess()

    return () => {
      cancelled = true
    }
  }, [user.email, user.uid])

  useEffect(() => {
    if (!campaign?.id) return

    let cancelled = false

    const loadCharacters = async () => {
      setCharactersLoading(true)
      try {
        const snap = await getDocs(collection(db, 'campaigns', campaign.id, 'characters'))
        const next = snap.docs.map((docSnap) => {
          const data = docSnap.data() as {
            name?: string
            ownerUserId?: string
            class?: string
            level?: number
          }

          return {
            id: docSnap.id,
            name: data.name ?? docSnap.id,
            ownerUserId: data.ownerUserId ?? '',
            className: data.class ?? 'Unknown',
            level: typeof data.level === 'number' ? data.level : 1,
            hpCurrent: typeof (data as { hpCurrent?: number }).hpCurrent === 'number'
              ? (data as { hpCurrent: number }).hpCurrent
              : 0,
            hpMax: typeof (data as { hpMax?: number }).hpMax === 'number'
              ? (data as { hpMax: number }).hpMax
              : 0,
            ac: typeof (data as { ac?: number }).ac === 'number' ? (data as { ac: number }).ac : 10,
            xp: typeof (data as { xp?: number }).xp === 'number' ? (data as { xp: number }).xp : 0,
          }
        })

        if (!cancelled) {
          setCharacters(next)

          if (next.length === 0) {
            setSelectedCharacterId('')
          } else {
            setSelectedCharacterId((current) => {
              const existing = next.find((character) => character.id === current)
              if (existing) return existing.id
              const owned = next.find((character) => character.ownerUserId === user.uid)
              return (owned ?? next[0]).id
            })
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load characters'
        if (!cancelled) {
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setCharactersLoading(false)
        }
      }
    }

    void loadCharacters()

    return () => {
      cancelled = true
    }
  }, [campaign?.id, user.uid])

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId) ?? null,
    [characters, selectedCharacterId],
  )

  const handleTabChange = (tab: AppTab) => {
    setActiveTab(tab)
    setDrawerOpen(false)
  }

  const tabLabel = (tab: AppTab) => {
    if (tab === 'character' && role === 'gm') return 'Characters'
    return tabs.find((item) => item.id === tab)?.label ?? tab
  }

  return (
    <main className="shell-root">
      <button
        type="button"
        className="menu-toggle"
        onClick={() => setDrawerOpen((current) => !current)}
        aria-label="Open navigation"
      >
        <Menu size={18} strokeWidth={2.5} />
      </button>

      {loading ? (
        <section>
          <h2>Loading Campaign</h2>
          <p>Checking active campaign access...</p>
        </section>
      ) : error ? (
        <section>
          <h2>Campaign Access Error</h2>
          <p>{error}</p>
        </section>
      ) : !campaign ? (
        <section>
          <h2>No Active Campaign</h2>
          <p>GM must sign in first to initialize the active campaign.</p>
        </section>
      ) : (
        <div className="shell-layout">
          <nav className={`side-nav ${drawerOpen ? 'open' : ''}`}>
            <h1 className="side-title">Home Boys House</h1>
            <p className="side-meta">{campaign.name}</p>
            <p className="side-meta">Role: {role}</p>

            <div className="nav-list">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={tab.id === activeTab ? 'tab-button active' : 'tab-button'}
                  onClick={() => handleTabChange(tab.id)}
                >
                  {tabLabel(tab.id)}
                </button>
              ))}
            </div>

            <div className="account-panel">
              <p className="account-email">{user.email ?? user.uid}</p>
              <button type="button" onClick={() => signOut(auth)}>
                Sign Out
              </button>
            </div>
          </nav>

          {drawerOpen ? <button className="drawer-backdrop" onClick={() => setDrawerOpen(false)} /> : null}

          <section className={activeTab === 'maps' ? 'content-panel maps-content-panel' : 'content-panel'}>
            {activeTab === 'character' ? (
              <CharacterTab
                role={role}
                characters={characters}
                charactersLoading={charactersLoading}
                selectedCharacterId={selectedCharacterId}
                setSelectedCharacterId={setSelectedCharacterId}
                selectedCharacter={selectedCharacter}
              />
            ) : activeTab === 'maps' ? (
              <MapsTab campaignId={campaign.id} role={role} />
            ) : (
              <PlaceholderTab tab={activeTab} />
            )}
          </section>
        </div>
      )}
    </main>
  )
}

function MapsTab({ campaignId, role }: { campaignId: string; role: Role | null }) {
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
  const [tokenColor, setTokenColor] = useState('#b45309')
  const [tokenSize, setTokenSize] = useState(28)
  const [tokens, setTokens] = useState<TokenRecord[]>([])
  const [, setFogSampleTick] = useState(0)
  const [draggingTokenId, setDraggingTokenId] = useState('')
  const [dragTokenPosition, setDragTokenPosition] = useState<{ x: number; y: number } | null>(null)
  const [tokenDeleteCandidate, setTokenDeleteCandidate] = useState<TokenRecord | null>(null)
  const [deletingTokenId, setDeletingTokenId] = useState('')
  const [inlineBaseSize, setInlineBaseSize] = useState({ width: 0, height: 0 })
  const [fullBaseSize, setFullBaseSize] = useState({ width: 0, height: 0 })
  const [mobilePlayerZoom, setMobilePlayerZoom] = useState(1)
  const [mobilePlayerPan, setMobilePlayerPan] = useState({ x: 0, y: 0 })
  const fullDragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const inlineFogCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fullFogCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const inlineVisionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const fullVisionCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const inlineMapLayerRef = useRef<HTMLDivElement | null>(null)
  const fullMapLayerRef = useRef<HTMLDivElement | null>(null)
  const fogLastPointRef = useRef<{ x: number; y: number } | null>(null)
  const tokenDragOffsetRef = useRef<{ x: number; y: number } | null>(null)
  const dragTokenPositionRef = useRef<{ x: number; y: number } | null>(null)
  const tokenFogTrailPointRef = useRef<{ x: number; y: number } | null>(null)
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
  const loadedInlineVisionKeyRef = useRef('')
  const loadedVisionKeyRef = useRef('')
  const revealMaskCanvasRef = useRef<HTMLCanvasElement | null>(null)

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
            visionBlockDataUrl?: string
            fullyHidden?: boolean
            width?: number
            height?: number
            sortOrder?: number
            visibleToPlayers?: boolean
          }

          return {
            id: docSnap.id,
            name: data.name ?? `Map ${docSnap.id}`,
            imagePath: data.imagePath ?? '',
            imageUrl: data.imageUrl ?? '',
            fogDataUrl: data.fogDataUrl ?? '',
            visionBlockDataUrl: data.visionBlockDataUrl ?? '',
            fullyHidden: data.fullyHidden === true,
            width: typeof data.width === 'number' ? data.width : 0,
            height: typeof data.height === 'number' ? data.height : 0,
            sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : Number.MAX_SAFE_INTEGER,
            visibleToPlayers: data.visibleToPlayers === true,
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
    const missingUrlMaps = maps.filter((map) => map.imagePath && !map.imageUrl)
    if (missingUrlMaps.length === 0) return

    void Promise.allSettled(
      missingUrlMaps.map(async (map) => {
        const url = await getDownloadURL(ref(storage, map.imagePath))
        await updateDoc(doc(db, 'campaigns', campaignId, 'maps', map.id), {
          imageUrl: url,
          updatedAt: serverTimestamp(),
        })
      }),
    )
  }, [campaignId, maps])

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
          }
        })
        setTokens(next)
      },
      (err) => {
        setMapError(err.message)
      },
    )

    return () => unsub()
  }, [campaignId, selectedMapId])

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
  const safeMapDimension = activeMapDimension > 1 ? activeMapDimension : TOKEN_REFERENCE_DIMENSION
  const bumpFogSampleTick = () => {
    setFogSampleTick((value) => value + 1)
  }

  const shouldShowTokenNameForGM = (token: TokenRecord) =>
    !usingFullScreenCanvas || !streamingMode || token.revealName

  const isMobileZoomMapView = isMobile && (role !== 'gm' || mobileGmPane === 'map')

  const renderTokenSize = (token: TokenRecord) => {
    const scale = token.sizeScale ?? token.size / TOKEN_REFERENCE_DIMENSION
    return Math.max(10, Math.min(120, Math.round(scale * activeMapDimension)))
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
    const size = renderTokenSize(token)
    return {
      color: token.color,
      fontSize: `${Math.max(10, Math.min(20, Math.round(size * 0.34)))}px`,
      transform: `translate(-50%, ${Math.max(6, Math.round(size * 0.24))}px)`,
    }
  }
  const effectiveFogBrushSize = Math.max(
    BRUSH_SIZE_MIN,
    Math.min(320, Math.round((fogBrushSize / TOKEN_REFERENCE_DIMENSION) * activeMapDimension)),
  )

  const isTokenVisible = (token: TokenRecord) => {
    if (token.party) return true

    const canvas = activeFogCanvasRef.current
    if (!canvas) return selectedMap ? !selectedMap.fullyHidden : true

    const ctx = canvas.getContext('2d')
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
        visionBlockDataUrl: '',
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

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (!map.fogDataUrl) {
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = 'rgba(0, 0, 0, 1)'
      ctx.fillRect(0, 0, width, height)
      bumpFogSampleTick()
      return
    }

    const fogImage = new Image()
    fogImage.onload = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(fogImage, 0, 0, width, height)
      bumpFogSampleTick()
    }
    fogImage.src = map.fogDataUrl
  }

  const initializeVisionCanvas = (canvas: HTMLCanvasElement, map: MapRecord, width: number, height: number) => {
    if (width <= 0 || height <= 0) return

    const resized = canvas.width !== width || canvas.height !== height
    if (resized) {
      canvas.width = width
      canvas.height = height
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (!map.visionBlockDataUrl) {
      ctx.clearRect(0, 0, width, height)
      return
    }

    const blockImage = new Image()
    blockImage.onload = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(blockImage, 0, 0, width, height)
    }
    blockImage.src = map.visionBlockDataUrl
  }

  const stampVisionBlock = (
    canvas: HTMLCanvasElement,
    x: number,
    y: number,
    mode: 'draw' | 'erase',
    brushSize = effectiveFogBrushSize,
  ) => {
    const ctx = canvas.getContext('2d')
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
    const ctx = canvas.getContext('2d')
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
      const maskCtx = maskCanvas.getContext('2d')
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

  const revealFromTokenPoint = (
    fogCanvas: HTMLCanvasElement,
    visionCanvas: HTMLCanvasElement | null,
    center: { x: number; y: number },
    brushSize: number,
  ) => {
    if (!visionCanvas) {
      stampFog(fogCanvas, center.x, center.y, 'reveal', brushSize)
      return
    }

    const fogCtx = fogCanvas.getContext('2d')
    const visionCtx = visionCanvas.getContext('2d')
    if (!fogCtx || !visionCtx) return

    const radius = Math.max(1, brushSize / 2)
    const minX = Math.max(0, Math.floor(center.x - radius - 2))
    const minY = Math.max(0, Math.floor(center.y - radius - 2))
    const maxX = Math.min(fogCanvas.width - 1, Math.ceil(center.x + radius + 2))
    const maxY = Math.min(fogCanvas.height - 1, Math.ceil(center.y + radius + 2))
    const regionWidth = Math.max(1, maxX - minX + 1)
    const regionHeight = Math.max(1, maxY - minY + 1)
    const visionData = visionCtx.getImageData(minX, minY, regionWidth, regionHeight).data

    let maskCanvas = revealMaskCanvasRef.current
    if (!maskCanvas) {
      maskCanvas = document.createElement('canvas')
      revealMaskCanvasRef.current = maskCanvas
    }
    if (maskCanvas.width !== fogCanvas.width || maskCanvas.height !== fogCanvas.height) {
      maskCanvas.width = fogCanvas.width
      maskCanvas.height = fogCanvas.height
    }
    const maskCtx = maskCanvas.getContext('2d')
    if (!maskCtx) return
    maskCtx.clearRect(minX, minY, regionWidth, regionHeight)
    maskCtx.fillStyle = 'rgba(0,0,0,1)'

    const rays = Math.max(220, Math.min(1800, Math.round(radius * 5.4)))
    const rayStep = (Math.PI * 2) / rays
    const distStep = 1
    const dot = Math.max(1, radius * 0.03)
    const surfaceDot = Math.max(2, dot * LOS_SURFACE_REVEAL_MULTIPLIER)
    const alphaAt = (x: number, y: number) => {
      const lx = x - minX
      const ly = y - minY
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
        if (x < minX || x > maxX || y < minY || y > maxY) break
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
    fogCtx.drawImage(maskCanvas, minX, minY, regionWidth, regionHeight, minX, minY, regionWidth, regionHeight)
    fogCtx.restore()
  }

  const revealFromTokenStroke = (
    fogCanvas: HTMLCanvasElement,
    visionCanvas: HTMLCanvasElement | null,
    from: { x: number; y: number },
    to: { x: number; y: number },
    brushSize: number,
  ) => {
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
      )
    }
  }

  const persistFog = async () => {
    if (!selectedMap || !activeFogCanvasRef.current || role !== 'gm') return
    const fogDataUrl = activeFogCanvasRef.current.toDataURL('image/png')
    await updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id), {
      fogDataUrl,
      fullyHidden: false,
      updatedAt: serverTimestamp(),
    })
    bumpFogSampleTick()
  }

  const persistVisionBlocks = async () => {
    if (!selectedMap || !activeVisionCanvasRef.current || role !== 'gm') return
    const visionBlockDataUrl = activeVisionCanvasRef.current.toDataURL('image/png')
    await updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id), {
      visionBlockDataUrl,
      updatedAt: serverTimestamp(),
    })
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
    setFogDrawing(false)
    fogLastPointRef.current = null
    if (visionTool) {
      void persistVisionBlocks()
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
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        if (preset === 'hide-all') {
          ctx.fillStyle = 'rgba(0, 0, 0, 1)'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }

        await updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id), {
          fogDataUrl: canvas.toDataURL('image/png'),
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

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      ctx.clearRect(0, 0, width, height)
      if (preset === 'hide-all') {
        ctx.fillStyle = 'rgba(0, 0, 0, 1)'
        ctx.fillRect(0, 0, width, height)
      }

      await updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id), {
        fogDataUrl: canvas.toDataURL('image/png'),
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

  const tokenPointToCanvasPoint = (point: { x: number; y: number }) => {
    const canvas = activeFogCanvasRef.current
    if (!canvas) return null
    return {
      x: point.x * canvas.width,
      y: point.y * canvas.height,
    }
  }

  const updateToken = async (
    tokenId: string,
    updates: Partial<
      Pick<
        TokenRecord,
        'color' | 'size' | 'sizeScale' | 'viewDistance' | 'viewDistanceScale' | 'party' | 'name' | 'revealName'
      >
    >,
  ) => {
    if (!selectedMap || role !== 'gm') return
    const nextUpdates = { ...updates } as typeof updates
    if (typeof nextUpdates.viewDistance === 'number' && typeof nextUpdates.viewDistanceScale !== 'number') {
      nextUpdates.viewDistanceScale = nextUpdates.viewDistance / safeMapDimension
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

  const placeToken = async (clientX: number, clientY: number) => {
    if (!selectedMap || role !== 'gm') return
    const point = getTokenDropPoint(clientX, clientY)
    if (!point) return
    const sizeScale = tokenSize / safeMapDimension

    await addDoc(collection(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'tokens'), {
      x: point.x,
      y: point.y,
      color: tokenColor,
      size: tokenSize,
      sizeScale,
      viewDistance: DEFAULT_TOKEN_VIEW_DISTANCE,
      viewDistanceScale: DEFAULT_TOKEN_VIEW_DISTANCE / safeMapDimension,
      party: false,
      name: '',
      revealName: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  const handleMapLayerClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (!tokenPlaceMode || role !== 'gm') return
    if ((event.target as HTMLElement).closest('.map-token')) return
    event.preventDefault()
    void placeToken(event.clientX, event.clientY)
  }

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

    tokenDragOffsetRef.current = {
      x: point.x - token.x,
      y: point.y - token.y,
    }
    tokenFogTrailPointRef.current = token.party ? tokenPointToCanvasPoint({ x: token.x, y: token.y }) : null
    setDraggingTokenId(tokenId)
    const startPosition = { x: token.x, y: token.y }
    dragTokenPositionRef.current = startPosition
    setDragTokenPosition(startPosition)
  }

  const startTokenDrag = (tokenId: string, event: Parameters<MouseEventHandler<HTMLButtonElement>>[0]) => {
    if (role !== 'gm') return
    event.preventDefault()
    event.stopPropagation()
    startTokenDragAtPoint(tokenId, event.clientX, event.clientY)
  }

  const handleTokenTouchStart = (
    tokenId: string,
    event: Parameters<TouchEventHandler<HTMLButtonElement>>[0],
  ) => {
    if (role !== 'gm') return
    if (event.touches.length !== 1) return
    event.stopPropagation()

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
    let lastLiveWriteAt = 0
    let lastLiveWritePos: { x: number; y: number } | null = null
    let pendingTokenWritePos: { x: number; y: number } | null = null
    let tokenWriteInFlight = false
    let tokenWriteTimer: number | null = null
    let lastLiveFogWriteAt = 0
    let liveFogWriteInFlight = false

    const scheduleTokenWrite = () => {
      if (tokenWriteInFlight || !pendingTokenWritePos || tokenWriteTimer !== null) return
      const now = Date.now()
      const wait = Math.max(0, LIVE_DRAG_WRITE_INTERVAL_MS - (now - lastLiveWriteAt))
      tokenWriteTimer = window.setTimeout(() => {
        tokenWriteTimer = null
        if (tokenWriteInFlight || !pendingTokenWritePos) return
        const position = pendingTokenWritePos
        pendingTokenWritePos = null
        tokenWriteInFlight = true
        lastLiveWriteAt = Date.now()
        lastLiveWritePos = position
        void updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'tokens', draggingTokenId), {
          x: position.x,
          y: position.y,
          updatedAt: serverTimestamp(),
        }).finally(() => {
          tokenWriteInFlight = false
          if (pendingTokenWritePos) {
            scheduleTokenWrite()
          }
        })
      }, wait)
    }

    const pushLiveFogUpdate = () => {
      if (!draggingToken?.party || !activeFogCanvasRef.current) return
      const now = Date.now()
      if (liveFogWriteInFlight || now - lastLiveFogWriteAt < LIVE_FOG_WRITE_INTERVAL_MS) return

      liveFogWriteInFlight = true
      lastLiveFogWriteAt = now
      const fogDataUrl = activeFogCanvasRef.current.toDataURL('image/png')
      void updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id), {
        fogDataUrl,
        fullyHidden: false,
        updatedAt: serverTimestamp(),
      })
        .then(() => {
          bumpFogSampleTick()
        })
        .finally(() => {
          liveFogWriteInFlight = false
        })
    }

    const pushLiveTokenPosition = (position: { x: number; y: number }) => {
      if (
        lastLiveWritePos &&
        Math.abs(position.x - lastLiveWritePos.x) < LIVE_DRAG_EPSILON &&
        Math.abs(position.y - lastLiveWritePos.y) < LIVE_DRAG_EPSILON
      ) {
        return
      }
      pendingTokenWritePos = position
      scheduleTokenWrite()
    }

    const handleMoveAt = (clientX: number, clientY: number) => {
      const point = getTokenDropPoint(clientX, clientY)
      if (!point) return
      const offset = tokenDragOffsetRef.current ?? { x: 0, y: 0 }
      const nextPosition = {
        x: Math.max(0, Math.min(1, point.x - offset.x)),
        y: Math.max(0, Math.min(1, point.y - offset.y)),
      }
      dragTokenPositionRef.current = nextPosition
      setDragTokenPosition(nextPosition)
      pushLiveTokenPosition(nextPosition)

      if (draggingToken?.party && activeFogCanvasRef.current) {
        const tokenBrushSize = renderTokenViewDistance(draggingToken)
        const nextCanvasPoint = tokenPointToCanvasPoint(nextPosition)
        if (!nextCanvasPoint) return

        const lastPoint = tokenFogTrailPointRef.current
        if (lastPoint) {
          revealFromTokenStroke(
            activeFogCanvasRef.current,
            activeVisionCanvasRef.current,
            lastPoint,
            nextCanvasPoint,
            tokenBrushSize,
          )
        } else {
          revealFromTokenPoint(
            activeFogCanvasRef.current,
            activeVisionCanvasRef.current,
            nextCanvasPoint,
            tokenBrushSize,
          )
        }
        pushLiveFogUpdate()
        tokenFogTrailPointRef.current = nextCanvasPoint
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
      const finalPosition = dragTokenPositionRef.current
      if (!finalPosition) {
        setDraggingTokenId('')
        tokenDragOffsetRef.current = null
        return
      }

      const tokenId = draggingTokenId
      setDraggingTokenId('')
      setDragTokenPosition(null)
      dragTokenPositionRef.current = null
      tokenDragOffsetRef.current = null
      tokenFogTrailPointRef.current = null

      await updateDoc(doc(db, 'campaigns', campaignId, 'maps', selectedMap.id, 'tokens', tokenId), {
        x: finalPosition.x,
        y: finalPosition.y,
        updatedAt: serverTimestamp(),
      })

      if (draggingToken?.party) {
        await persistFog()
      }

      tokenTouchDraggingRef.current = false
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleUp)
    window.addEventListener('touchcancel', handleUp)

    return () => {
      if (tokenWriteTimer !== null) {
        window.clearTimeout(tokenWriteTimer)
      }
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleUp)
      window.removeEventListener('touchcancel', handleUp)
    }
    // draw/stamp/persist come from the same component scope and are intentionally captured here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFogCanvasRef, activeVisionCanvasRef, campaignId, draggingTokenId, role, selectedMap, tokens])

  useEffect(() => {
    if (fullScreenOpen || !selectedMap || !inlineFogCanvasRef.current) return
    if (isMobile && role === 'gm' && mobileGmPane !== 'map') return
    if (inlineBaseSize.width <= 0 || inlineBaseSize.height <= 0) return

    if (loadedInlineCanvasRef.current !== inlineFogCanvasRef.current) {
      loadedInlineCanvasRef.current = inlineFogCanvasRef.current
      loadedInlineFogKeyRef.current = ''
    }

    const key = `${selectedMap.id}:${selectedMap.fogDataUrl}:${inlineBaseSize.width}x${inlineBaseSize.height}`
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

    const key = `${selectedMap.id}:${selectedMap.visionBlockDataUrl}:${inlineBaseSize.width}x${inlineBaseSize.height}`
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

    const key = `${selectedMap.id}:${selectedMap.fogDataUrl}:${fullBaseSize.width}x${fullBaseSize.height}`
    if (loadedFogKeyRef.current === key) return

    loadedFogKeyRef.current = key
    initializeFogCanvas(fullFogCanvasRef.current, selectedMap, fullBaseSize.width, fullBaseSize.height)
  }, [fullBaseSize.height, fullBaseSize.width, fullScreenOpen, selectedMap])

  useEffect(() => {
    if (!fullScreenOpen || !selectedMap || !fullVisionCanvasRef.current) return
    if (fullBaseSize.width <= 0 || fullBaseSize.height <= 0) return

    const key = `${selectedMap.id}:${selectedMap.visionBlockDataUrl}:${fullBaseSize.width}x${fullBaseSize.height}`
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
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    selectMap(map.id)
                  }
                }}
              >
                <div className="map-thumb-column">
                  <div className="map-thumb-wrap">
                    {map.imageUrl ? <img src={map.imageUrl} alt={map.name} className="map-thumb" /> : null}
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
                style={{ opacity: role === 'gm' ? 0.8 : 0 }}
              />
              <div className={role === 'gm' ? 'map-token-layer gm' : 'map-token-layer'} aria-hidden={role !== 'gm'}>
                {tokens.map((token, index) =>
                  !isTokenVisible(token) ? null :
                  role === 'gm' ? (
                    <button
                      key={token.id}
                      type="button"
                      className={draggingTokenId === token.id ? 'map-token dragging' : 'map-token'}
                      style={{
                        left: `${(draggingTokenId === token.id && dragTokenPosition ? dragTokenPosition.x : token.x) * 100}%`,
                        top: `${(draggingTokenId === token.id && dragTokenPosition ? dragTokenPosition.y : token.y) * 100}%`,
                        color: token.color,
                      }}
                      onMouseDown={(event) => startTokenDrag(token.id, event)}
                      onTouchStart={(event) => handleTokenTouchStart(token.id, event)}
                      onTouchEnd={handleTokenTouchEnd}
                      onTouchCancel={handleTokenTouchEnd}
                      aria-label="Map token"
                    >
                      <ChessPawn size={renderTokenSize(token)} />
                      {shouldShowTokenNameForGM(token) ? (
                        <span className="map-token-name" style={renderTokenNameStyle(token)}>
                          {tokenDisplayName(token, index)}
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    <span
                      key={token.id}
                      className="map-token-static"
                      style={{
                        left: `${token.x * 100}%`,
                        top: `${token.y * 100}%`,
                        color: token.color,
                      }}
                    >
                      <ChessPawn size={renderTokenSize(token)} />
                      {token.revealName ? (
                        <span className="map-token-name" style={renderTokenNameStyle(token)}>
                          {tokenDisplayName(token, index)}
                        </span>
                      ) : null}
                    </span>
                  ),
                )}
              </div>
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
              tokenColor={tokenColor}
              setTokenColor={setTokenColor}
              tokenSize={tokenSize}
              setTokenSize={setTokenSize}
              streamingMode={streamingMode}
              setStreamingMode={setStreamingMode}
              applyFogPreset={applyFogPreset}
              canApplyPreset={Boolean(selectedMap)}
              fullyHidden={selectedMap?.fullyHidden === true}
              tokens={tokens}
              onUpdateToken={updateToken}
              onUpdateTokenSize={async (tokenId, size) => {
                const sizeScale = size / safeMapDimension
                setTokens((prev) =>
                  prev.map((token) => (token.id === tokenId ? { ...token, size, sizeScale } : token)),
                )
                await updateToken(tokenId, { size, sizeScale })
              }}
              onUpdateTokenViewDistance={async (tokenId, viewDistance) => {
                const viewDistanceScale = viewDistance / safeMapDimension
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
                    style={{ opacity: role === 'gm' ? 0.8 : 0 }}
                  />
                  <div className={role === 'gm' ? 'map-token-layer gm' : 'map-token-layer'} aria-label="Map tokens">
                    {tokens.map((token, index) => {
                      if (!isTokenVisible(token)) return null
                      const isDragging = draggingTokenId === token.id && dragTokenPosition
                      const x = isDragging ? dragTokenPosition.x : token.x
                      const y = isDragging ? dragTokenPosition.y : token.y

                      if (role !== 'gm') {
                        return (
                          <span
                            key={token.id}
                            className="map-token-static"
                            style={{
                              left: `${x * 100}%`,
                              top: `${y * 100}%`,
                              color: token.color,
                            }}
                          >
                            <ChessPawn size={renderTokenSize(token)} />
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
                          className={isDragging ? 'map-token dragging' : 'map-token'}
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
                          <ChessPawn size={renderTokenSize(token)} />
                          {shouldShowTokenNameForGM(token) ? (
                            <span className="map-token-name" style={renderTokenNameStyle(token)}>
                              {tokenDisplayName(token, index)}
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
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
                  tokenColor={tokenColor}
                  setTokenColor={setTokenColor}
                  tokenSize={tokenSize}
                  setTokenSize={setTokenSize}
                  streamingMode={streamingMode}
                  setStreamingMode={setStreamingMode}
                  applyFogPreset={applyFogPreset}
                  canApplyPreset={Boolean(selectedMap)}
                  fullyHidden={selectedMap?.fullyHidden === true}
                  tokens={tokens}
                  onUpdateToken={updateToken}
                  onUpdateTokenSize={async (tokenId, size) => {
                    const sizeScale = size / safeMapDimension
                    setTokens((prev) =>
                      prev.map((token) => (token.id === tokenId ? { ...token, size, sizeScale } : token)),
                    )
                    await updateToken(tokenId, { size, sizeScale })
                  }}
                  onUpdateTokenViewDistance={async (tokenId, viewDistance) => {
                    const viewDistanceScale = viewDistance / safeMapDimension
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

      <ConfirmationModal
        open={deleteCandidate !== null}
        title="Delete Map?"
        message={`Permanently remove "${deleteCandidate?.name ?? ''}" from this campaign?`}
        confirmLabel={deletingMapId ? 'Deleting...' : 'Delete'}
        confirmDisabled={Boolean(deletingMapId)}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => void deleteMap()}
      />
      <ConfirmationModal
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
  tokenColor,
  setTokenColor,
  tokenSize,
  setTokenSize,
  streamingMode,
  setStreamingMode,
  applyFogPreset,
  canApplyPreset,
  fullyHidden,
  tokens,
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
  tokenColor: string
  setTokenColor: (value: string) => void
  tokenSize: number
  setTokenSize: (value: number) => void
  streamingMode: boolean
  setStreamingMode: (value: boolean) => void
  applyFogPreset: (preset: 'hide-all' | 'unhide-all') => Promise<void>
  canApplyPreset: boolean
  fullyHidden: boolean
  tokens: TokenRecord[]
  onUpdateToken: (
    tokenId: string,
    updates: Partial<
      Pick<
        TokenRecord,
        'color' | 'size' | 'sizeScale' | 'viewDistance' | 'viewDistanceScale' | 'party' | 'name' | 'revealName'
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
          onClick={() => setTokenPlaceMode(!tokenPlaceMode)}
          aria-label="Toggle token placement mode"
          title="Toggle token placement mode"
        >
          <ChessPawn size={16} />
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
          <input
            type="color"
            value={tokenColor}
            onChange={(event) => setTokenColor(event.target.value)}
            aria-label="Token color"
            title="Token color"
          />
          <label>
            Token Size: {tokenSize}
            <input
              type="range"
              min={16}
              max={56}
              step={1}
              value={tokenSize}
              onChange={(event) => setTokenSize(Number(event.target.value))}
            />
          </label>
        </div>
      ) : null}
      <div className="token-list">
        {tokens.map((token, index) => (
          <div key={token.id} className="token-row">
            <span className="token-row-icon" style={{ color: token.color }} aria-hidden>
              <ChessPawn size={14} />
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
              max={56}
              step={1}
              value={token.size}
              onChange={(event) => void onUpdateTokenSize(token.id, Number(event.target.value))}
              aria-label={`Token ${index + 1} size`}
            />
            <span className="token-row-size-value">{token.size}</span>
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
            <label className="token-party-toggle">
              <input
                type="checkbox"
                checked={token.revealName}
                onChange={(event) => void onUpdateToken(token.id, { revealName: event.target.checked })}
              />
              Reveal Name
            </label>
          </div>
        ))}
      </div>

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

function ConfirmationModal({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  confirmDisabled = false,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  confirmDisabled?: boolean
}) {
  if (!open) return null

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="confirm-danger"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function CharacterTab({
  role,
  characters,
  charactersLoading,
  selectedCharacterId,
  setSelectedCharacterId,
  selectedCharacter,
}: {
  role: Role | null
  characters: CharacterRecord[]
  charactersLoading: boolean
  selectedCharacterId: string
  setSelectedCharacterId: (id: string) => void
  selectedCharacter: CharacterRecord | null
}) {
  const [view, setView] = useState<'list' | 'sheet'>('list')
  const [pageStart, setPageStart] = useState(0)
  const [pagesPerView, setPagesPerView] = useState(1)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const displayCharacters = characters.length > 0 ? characters : mockCharacters
  const effectiveSelected =
    selectedCharacter ?? displayCharacters.find((character) => character.id === selectedCharacterId) ?? null
  const sheetPages = ['Core', 'Combat', 'Inventory', 'Spells & Notes']
  const maxStart = Math.max(0, sheetPages.length - pagesPerView)
  const clampedPageStart = Math.min(pageStart, maxStart)
  const visiblePages = sheetPages.slice(clampedPageStart, clampedPageStart + pagesPerView)

  useEffect(() => {
    const setResponsivePages = () => {
      if (window.innerWidth >= 1100) {
        setPagesPerView(2)
      } else {
        setPagesPerView(1)
      }
    }

    setResponsivePages()
    window.addEventListener('resize', setResponsivePages)
    return () => window.removeEventListener('resize', setResponsivePages)
  }, [])

  const openCharacterSheet = (character: CharacterRecord) => {
    setSelectedCharacterId(character.id)
    setPageStart(0)
    setView('sheet')
  }

  const goPrevPages = () => {
    setPageStart((current) => Math.max(0, Math.min(current, maxStart) - pagesPerView))
  }

  const goNextPages = () => {
    setPageStart((current) => Math.min(maxStart, Math.min(current, maxStart) + pagesPerView))
  }

  const handleTouchStart: TouchEventHandler<HTMLDivElement> = (event) => {
    const touch = event.changedTouches[0]
    touchStartX.current = touch.clientX
    touchStartY.current = touch.clientY
  }

  const handleTouchEnd: TouchEventHandler<HTMLDivElement> = (event) => {
    if (touchStartX.current === null || touchStartY.current === null) return

    const touch = event.changedTouches[0]
    const dx = touch.clientX - touchStartX.current
    const dy = touch.clientY - touchStartY.current

    touchStartX.current = null
    touchStartY.current = null

    // Only treat mostly-horizontal gestures as page swipes.
    if (Math.abs(dx) < 44 || Math.abs(dx) <= Math.abs(dy)) return

    if (dx < 0 && clampedPageStart < maxStart) {
      goNextPages()
    } else if (dx > 0 && clampedPageStart > 0) {
      goPrevPages()
    }
  }

  return (
    <div className="stack-tight">
      <h2>Character</h2>

      {charactersLoading ? <p>Loading characters...</p> : null}

      {!charactersLoading && characters.length === 0 ? (
        <p>Using temporary mock character cards for flow testing.</p>
      ) : null}

      {view === 'list' ? (
        <div className="character-card-grid">
          {displayCharacters.map((character) => (
            <button
              key={character.id}
              type="button"
              className="character-card"
              onClick={() => openCharacterSheet(character)}
            >
              <h3>{character.name}</h3>
              <p>
                {character.className} • Level {character.level}
              </p>
              <p>
                HP {character.hpCurrent}/{character.hpMax} • AC {character.ac}
              </p>
              <p>XP {character.xp.toLocaleString()}</p>
            </button>
          ))}
        </div>
      ) : null}

      {view === 'sheet' && effectiveSelected ? (
        <div className="stack-tight">
          <button type="button" className="back-link" onClick={() => setView('list')}>
            <ChevronLeft size={16} />
          </button>

          <h3>{effectiveSelected.name}</h3>
          <div className="info-grid">
            <p>
              <strong>Class:</strong> {effectiveSelected.className}
            </p>
            <p>
              <strong>Level:</strong> {effectiveSelected.level}
            </p>
            <p>
              <strong>HP:</strong> {effectiveSelected.hpCurrent}/{effectiveSelected.hpMax}
            </p>
            <p>
              <strong>AC:</strong> {effectiveSelected.ac}
            </p>
            <p>
              <strong>XP:</strong> {effectiveSelected.xp.toLocaleString()}
            </p>
            <p>
              <strong>View Mode:</strong> {role === 'gm' ? 'GM' : 'Player'}
            </p>
          </div>

          <div className="sheet-pages" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            {visiblePages.map((pageName, index) => (
              <article key={`${pageName}-${index}`} className="sheet-page">
                <h4>Sheet Page {clampedPageStart + index + 1}</h4>
                <p>{pageName}</p>
                <p>Placeholder layout block for full sheet page flow.</p>
              </article>
            ))}
          </div>

          <div className="sheet-nav">
            <button
              type="button"
              className="sheet-nav-btn"
              onClick={goPrevPages}
              disabled={clampedPageStart === 0}
              aria-label="Previous sheet pages"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="sheet-nav-btn"
              onClick={goNextPages}
              disabled={clampedPageStart >= maxStart}
              aria-label="Next sheet pages"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PlaceholderTab({ tab }: { tab: AppTab }) {
  const label = tabs.find((item) => item.id === tab)?.label ?? tab

  return (
    <div className="stack-tight">
      <h2>{label}</h2>
      <p>{label} flow shell is in place. Detailed component implementation comes next.</p>
    </div>
  )
}

export default App
