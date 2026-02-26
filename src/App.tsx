import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEventHandler, FormEvent, TouchEventHandler } from 'react'
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
import { Check, ChevronLeft, ChevronRight, Circle, Menu, Pencil, Trash2, Upload } from 'lucide-react'
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
  width: number
  height: number
  sortOrder: number
  visibleToPlayers: boolean
}

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

          <section className="content-panel">
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
  const [mapsLoading, setMapsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [editingMapId, setEditingMapId] = useState('')
  const [editName, setEditName] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<MapRecord | null>(null)
  const [deletingMapId, setDeletingMapId] = useState('')
  const [draggingMapId, setDraggingMapId] = useState('')
  const [dragOverMapId, setDragOverMapId] = useState('')

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
                onClick={() => setSelectedMapId(map.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedMapId(map.id)
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

      <div className={role === 'gm' ? 'maps-main gm' : 'maps-main player'}>
        <div className="map-stage">
          {selectedMap?.imageUrl ? (
            <img src={selectedMap.imageUrl} alt={selectedMap.name} className="map-image" />
          ) : (
            <p>Select a map from the list.</p>
          )}
        </div>

        {role === 'gm' ? (
          <aside className="map-controls">
            <h3>Map Controls</h3>
            <p>GM tools placeholder:</p>
            <ul>
              <li>Reveal / Hide brush</li>
              <li>Token add / move / remove</li>
              <li>GM view toggle</li>
            </ul>
          </aside>
        ) : null}
      </div>

      <ConfirmationModal
        open={deleteCandidate !== null}
        title="Delete Map?"
        message={`Permanently remove "${deleteCandidate?.name ?? ''}" from this campaign?`}
        confirmLabel={deletingMapId ? 'Deleting...' : 'Delete'}
        confirmDisabled={Boolean(deletingMapId)}
        onCancel={() => setDeleteCandidate(null)}
        onConfirm={() => void deleteMap()}
      />
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
