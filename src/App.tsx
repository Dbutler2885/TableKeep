import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { RulesTab } from './features/common/RulesTab'
import { MapsTab } from './features/maps/MapsTab'
import { MonstersTab } from './features/monsters/MonstersTab'
import { ItemsTab } from './features/items/ItemsTab'
import { NpcsTab } from './features/npcs/NpcsTab'
import { TablesTab } from './features/tables/TablesTab'
import { NotesTab } from './features/notes/NotesTab'
import { CalendarTab } from './features/notes/CalendarTab'
import { CliffhangerModal } from './features/notes/CliffhangerModal'
import { tabFromPathname, tabPaths, tabs } from './features/navigation/tabs'
import { useCampaignAccess } from './features/campaign/useCampaignAccess'
import { useCharacters } from './features/character/useCharacters'
import { useItemApprovals } from './features/character/useItemApprovals'
import { TransferNotification } from './features/transfers/TransferNotification'
import type { ItemApprovalRequest } from './types/app'

const OSE_SRD_URL = 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Main_Page'

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

    const userRef = doc(db, 'users', user.uid)
    setProfileReady(false)

    const unsub = onSnapshot(
      userRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        const data = snapshot.data()
        const nextUsername = typeof data?.username === 'string' ? data.username : null
        const canTrustMissingUsername = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites

        setUsername((current) => {
          if (nextUsername) return nextUsername
          return canTrustMissingUsername ? null : current
        })

        // Do not treat a cached "missing username" snapshot as authoritative:
        // that causes existing users to briefly see UsernameSetup on refresh.
        if (nextUsername || canTrustMissingUsername) {
          setProfileReady(true)
        }
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
    syncCharacterLocal,
    deleteCharacter,
    hasPendingWrite,
  } = useCharacters(campaign?.id ?? null, user.uid, username, role, setError)

  const characterTabProps = campaign ? {
    campaignId: campaign.id,
    currentUserId: user.uid,
    currentUsername: username,
    role,
    characters,
    charactersLoading,
    currentCharacterId,
    setCurrentCharacter,
    selectedCharacterId,
    setSelectedCharacterId,
    selectedCharacter,
    updateCharacter,
    syncCharacterLocal,
    deleteCharacter,
    hasPendingWrite,
  } : null

  const { pendingRequests, approveRequest, rejectRequest } = useItemApprovals(
    campaign?.id ?? null,
    role,
    user.uid,
  )
  const [approvalBusy, setApprovalBusy] = useState(false)

  const handleApprove = useCallback(async (request: ItemApprovalRequest) => {
    setApprovalBusy(true)
    try { await approveRequest(request) } catch (e) { console.error('Approve failed', e) }
    setApprovalBusy(false)
  }, [approveRequest])

  const handleReject = useCallback(async (request: ItemApprovalRequest) => {
    setApprovalBusy(true)
    try { await rejectRequest(request) } catch (e) { console.error('Reject failed', e) }
    setApprovalBusy(false)
  }, [rejectRequest])

  const tabLabel = (tab: (typeof tabs)[number]['id']) => {
    if (tab === 'character' && role === 'gm') return 'Characters'
    return tabs.find((item) => item.id === tab)?.label ?? tab
  }
  const visibleTabs = useMemo(
    () => (role === 'player' ? tabs.filter((tab) => !['items', 'monsters', 'tables'].includes(tab.id)) : tabs),
    [role],
  )

  useEffect(() => {
    if (!campaign || !role) return
    void Promise.all([
      setDoc(
        doc(db, 'campaigns', campaign.id, 'members', user.uid),
        {
          userId: user.uid,
          role,
          status: 'active',
          username,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
      setDoc(
        doc(db, 'users', user.uid, 'campaignMemberships', campaign.id),
        {
          campaignId: campaign.id,
          userId: user.uid,
          role,
          status: 'active',
          username,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ),
    ])
  }, [campaign, role, user.uid, username])

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
              {visibleTabs.map((tab) => (
                tab.id === 'rules' ? (
                  <a
                    key={tab.id}
                    href={OSE_SRD_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={() => setDrawerOpen(false)}
                    className="tab-button"
                  >
                    {tabLabel(tab.id)}
                  </a>
                ) : (
                  <NavLink
                    key={tab.id}
                    to={tabPaths[tab.id]}
                    end
                    onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) => (isActive ? 'tab-button active' : 'tab-button')}
                  >
                    {tabLabel(tab.id)}
                  </NavLink>
                )
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
              ['character', 'maps', 'monsters', 'items', 'npcs', 'tables', 'notes'].includes(activeTab)
                ? 'content-panel sidebar-panel'
                : 'content-panel'
            }
          >
            <Routes>
              <Route path="/" element={<Navigate to={tabPaths.character} replace />} />
              <Route
                path={tabPaths.character}
                element={
                  characterTabProps ? <CharacterTab {...characterTabProps} /> : null
                }
              />
              <Route
                path={tabPaths.maps}
                element={<MapsTab campaignId={campaign.id} role={role} characterTabProps={characterTabProps ?? undefined} />}
              />
              <Route
                path={tabPaths.monsters}
                element={role === 'gm'
                  ? <MonstersTab campaignId={campaign.id} role={role} />
                  : <Navigate to={tabPaths.character} replace />}
              />
              <Route
                path={tabPaths.items}
                element={role === 'gm'
                  ? <ItemsTab campaignId={campaign.id} role={role} characters={characters} />
                  : <Navigate to={tabPaths.character} replace />}
              />
              <Route
                path={tabPaths.npcs}
                element={<NpcsTab campaignId={campaign.id} role={role} />}
              />
              <Route
                path={tabPaths.tables}
                element={role === 'gm'
                  ? <TablesTab campaignId={campaign.id} />
                  : <Navigate to={tabPaths.character} replace />}
              />
              <Route path={tabPaths.notes} element={<NotesTab campaignId={campaign.id} role={role} />} />
              <Route path={tabPaths.calendar} element={<CalendarTab campaignId={campaign.id} role={role} />} />
              <Route path={tabPaths.rules} element={<RulesTab />} />
              <Route path="*" element={<Navigate to={tabPaths.character} replace />} />
            </Routes>
          </section>
        </div>
      )}
      {role === 'gm' && pendingRequests.length > 0 ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal">
            <h3>
              {pendingRequests[0]?.action === 'sell'
                ? 'Sell Approval Request'
                : pendingRequests[0]?.action === 'learn_spell'
                  ? 'Spell Transcription Request'
                  : pendingRequests[0]?.action === 'ability_reroll'
                    ? 'Ability Re-roll Request'
                  : 'Item Approval Request'}
            </h3>
            {(() => {
              const req = pendingRequests[0]
              const item = req.item
              if (req.action === 'ability_reroll') {
                return (
                  <>
                    <p>
                      <strong>{req.requestedByUsername}</strong> wants to re-roll ability scores for <strong>{req.characterName}</strong>.
                    </p>
                    <div className="confirm-actions">
                      <button
                        type="button"
                        className="confirm-danger"
                        disabled={approvalBusy}
                        onClick={() => void handleReject(req)}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={approvalBusy}
                        onClick={() => void handleApprove(req)}
                      >
                        Approve
                      </button>
                    </div>
                    {pendingRequests.length > 1 ? (
                      <p style={{ marginTop: 8, fontSize: '0.85em', opacity: 0.7 }}>
                        +{pendingRequests.length - 1} more pending
                      </p>
                    ) : null}
                  </>
                )
              }
              if (req.action === 'learn_spell') {
                const spellNames = req.spellNames ?? []
                return (
                  <>
                    <p>
                      <strong>{req.requestedByUsername}</strong> wants to transcribe spell
                      {spellNames.length === 1 ? '' : 's'} into <strong>{req.characterName}</strong>&apos;s spell book:
                    </p>
                    {spellNames.length > 0 ? (
                      <p style={{ margin: '8px 0', fontWeight: 600 }}>{spellNames.join(', ')}</p>
                    ) : (
                      <p style={{ margin: '8px 0', fontWeight: 600 }}>(No spell names provided)</p>
                    )}
                    <div className="confirm-actions">
                      <button
                        type="button"
                        className="confirm-danger"
                        disabled={approvalBusy}
                        onClick={() => void handleReject(req)}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={approvalBusy}
                        onClick={() => void handleApprove(req)}
                      >
                        Approve
                      </button>
                    </div>
                    {pendingRequests.length > 1 ? (
                      <p style={{ marginTop: 8, fontSize: '0.85em', opacity: 0.7 }}>
                        +{pendingRequests.length - 1} more pending
                      </p>
                    ) : null}
                  </>
                )
              }
              if (!item) return null
              const displayName = item.name
                ? `${item.typeName} "${item.name}"`
                : item.typeName
              return (
                <>
                  <p>
                    <strong>{req.requestedByUsername}</strong> wants to {req.action === 'sell' ? 'sell' : 'add'}
                    {' '}a <strong>{item.kind}</strong> {req.action === 'sell' ? 'from' : 'to'} <strong>{req.characterName}</strong>:
                  </p>
                  <p style={{ margin: '8px 0', fontWeight: 600 }}>{displayName}</p>
                  {item.costGp > 0 ? (
                    <p>{req.action === 'sell' ? `Sell for: ${item.costGp} gp` : `Cost: ${item.costGp} gp`}</p>
                  ) : null}
                  {item.kind === 'weapon' && 'damageDiceCount' in item ? (
                    <p style={{ fontSize: '0.9em' }}>
                      Damage: {item.damageDiceCount}d{item.damageDiceSides}
                      {Number(item.attackBonus) ? ` | Atk +${item.attackBonus}` : ''}
                      {Number(item.damageBonus) ? ` | Dmg +${item.damageBonus}` : ''}
                      {Number(item.rangeShort) ? ` | Range ${item.rangeShort}/${item.rangeMedium}/${item.rangeLong}` : ''}
                      {item.twoHanded ? ' | Two-handed' : ''}
                      {item.isMagic ? ' | Magic' : ''}
                    </p>
                  ) : null}
                  {item.kind === 'armour' && 'armourClass' in item ? (
                    <p style={{ fontSize: '0.9em' }}>
                      AC: {item.armourClass}
                      {item.armourType === 'shield' ? ' (Shield)' : ' (Body)'}
                      {Number(item.magicMod) ? ` | Magic +${item.magicMod}` : ''}
                      {item.isMagic ? ' | Magic' : ''}
                    </p>
                  ) : null}
                  {item.kind === 'ammunition' || item.kind === 'consumable' ? (
                    <p style={{ fontSize: '0.9em' }}>Qty: {item.qty}</p>
                  ) : null}
                  {item.description ? <p style={{ fontSize: '0.9em', opacity: 0.8 }}>{item.description}</p> : null}
                  {item.notes ? <p style={{ fontSize: '0.9em', opacity: 0.8 }}>{item.notes}</p> : null}
                  <div className="confirm-actions">
                    <button
                      type="button"
                      className="confirm-danger"
                      disabled={approvalBusy}
                      onClick={() => void handleReject(req)}
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      disabled={approvalBusy}
                      onClick={() => void handleApprove(req)}
                    >
                      Approve
                    </button>
                  </div>
                  {pendingRequests.length > 1 ? (
                    <p style={{ marginTop: 8, fontSize: '0.85em', opacity: 0.7 }}>
                      +{pendingRequests.length - 1} more pending
                    </p>
                  ) : null}
                </>
              )
            })()}
          </div>
        </div>
      ) : null}
      {campaign ? (
        <TransferNotification
          campaignId={campaign.id}
          currentUserId={user.uid}
          role={role}
          characters={characters}
        />
      ) : null}
      {campaign ? (
        <CliffhangerModal campaignId={campaign.id} userId={user.uid} />
      ) : null}
    </main>
  )
}

export default App
