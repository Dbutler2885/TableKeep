import { useEffect, useMemo, useState } from 'react'
import { Menu } from 'lucide-react'
import {
  onAuthStateChanged,
  signOut,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import { auth, db } from './firebase'
import { AuthPanel } from './features/auth/AuthPanel'
import { UsernameSetup } from './features/auth/UsernameSetup'
import { CharacterTab } from './features/character/CharacterTab'
import { PlaceholderTab } from './features/common/PlaceholderTab'
import { MapsTab } from './features/maps/MapsTab'
import { MonstersTab } from './features/monsters/MonstersTab'
import { ItemsTab } from './features/items/ItemsTab'
import { tabFromPathname, tabPaths, tabs } from './features/navigation/tabs'
import { useCampaignAccess } from './features/campaign/useCampaignAccess'
import { useCharacters } from './features/character/useCharacters'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [profileReady, setProfileReady] = useState(false)

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

  useEffect(() => {
    if (!user) {
      setUsername(null)
      setProfileReady(false)
      return
    }

    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        const data = snapshot.data()
        const nextUsername = typeof data?.username === 'string' ? data.username : null
        setUsername(nextUsername)
        setProfileReady(true)
      },
      () => {
        setUsername(null)
        setProfileReady(true)
      },
    )

    return () => unsub()
  }, [user])

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

  if (!profileReady) {
    return (
      <main className="auth-shell">
        <p>Loading profile...</p>
      </main>
    )
  }

  if (!username) {
    return (
      <main className="auth-shell">
        <h1>Home Boys House</h1>
        <p>Choose your username to continue.</p>
        <UsernameSetup user={user} onComplete={setUsername} />
      </main>
    )
  }

  return <CampaignShell user={user} username={username} />
}

function CampaignShell({ user, username }: { user: User, username: string }) {
  const location = useLocation()
  const activeTab = useMemo(() => tabFromPathname(location.pathname), [location.pathname])
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { campaign, role, loading, error, setError } = useCampaignAccess(user)
  const {
    characters,
    charactersLoading,
    currentCharacterId,
    setCurrentCharacter,
    selectedCharacterId,
    setSelectedCharacterId,
    selectedCharacter,
    updateCharacter,
    deleteCharacter,
  } = useCharacters(campaign?.id ?? null, user.uid, username, role, setError)

  const tabLabel = (tab: (typeof tabs)[number]['id']) => {
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

            <div className="nav-list">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.id}
                  to={tabPaths[tab.id]}
                  end
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) => (isActive ? 'tab-button active' : 'tab-button')}
                >
                  {tabLabel(tab.id)}
                </NavLink>
              ))}
            </div>

            <div className="account-panel">
              <p className="account-email account-username">Username: {username}</p>
              <p className="account-email">Role: {role}</p>
              <button type="button" onClick={() => signOut(auth)}>
                Sign Out
              </button>
            </div>
          </nav>

          {drawerOpen ? <button className="drawer-backdrop" onClick={() => setDrawerOpen(false)} /> : null}

          <section
            className={
              ['character', 'maps', 'monsters', 'items'].includes(activeTab)
                ? 'content-panel sidebar-panel'
                : 'content-panel'
            }
          >
            <Routes>
              <Route path="/" element={<Navigate to={tabPaths.character} replace />} />
              <Route
                path={tabPaths.character}
                element={
                  <CharacterTab
                    campaignId={campaign.id}
                    currentUserId={user.uid}
                    currentUsername={username}
                    role={role}
                    characters={characters}
                    charactersLoading={charactersLoading}
                    currentCharacterId={currentCharacterId}
                    setCurrentCharacter={setCurrentCharacter}
                    selectedCharacterId={selectedCharacterId}
                    setSelectedCharacterId={setSelectedCharacterId}
                    selectedCharacter={selectedCharacter}
                    updateCharacter={updateCharacter}
                    deleteCharacter={deleteCharacter}
                  />
                }
              />
              <Route path={tabPaths.maps} element={<MapsTab campaignId={campaign.id} role={role} />} />
              <Route path={tabPaths.monsters} element={<MonstersTab campaignId={campaign.id} role={role} />} />
              <Route path={tabPaths.items} element={<ItemsTab role={role} />} />
              <Route path={tabPaths.npcs} element={<PlaceholderTab tab="npcs" />} />
              <Route path={tabPaths.notes} element={<PlaceholderTab tab="notes" />} />
              <Route path={tabPaths.rules} element={<PlaceholderTab tab="rules" />} />
              <Route path="*" element={<Navigate to={tabPaths.character} replace />} />
            </Routes>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
