import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Menu } from 'lucide-react'
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
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import './App.css'
import { auth, db } from './firebase'
import { AuthPanel } from './features/auth/AuthPanel'
import { UsernameSetup } from './features/auth/UsernameSetup'
import { CharacterTab } from './features/character/CharacterTab'
import { RulesTab } from './features/common/RulesTab'
import { useDocumentVisibility } from './features/common/useDocumentVisibility'
import { MapsTab } from './features/maps/MapsTab'
import { MonstersTab } from './features/monsters/MonstersTab'
import { ItemsTab } from './features/items/ItemsTab'
import { NpcsTab } from './features/npcs/NpcsTab'
import { TablesTab } from './features/tables/TablesTab'
import { NotesTab } from './features/notes/NotesTab'
import { CalendarTab } from './features/notes/CalendarTab'
import { CliffhangerModal } from './features/notes/CliffhangerModal'
import { campaignTabPath, groupHomePath, groupPickerPath, tabFromPathname, tabs } from './features/navigation/tabs'
import { campaignDocRef } from './features/campaign/firestorePaths'
import { useCharacters } from './features/character/useCharacters'
import { useItemApprovals } from './features/character/useItemApprovals'
import { TransferNotification } from './features/transfers/TransferNotification'
import { GroupPicker } from './features/groups/GroupPicker'
import { GroupHome } from './features/groups/GroupHome'
import { useGroupAccess } from './features/groups/useGroupAccess'
import { AcceptInvite } from './features/invites/AcceptInvite'
import type { GroupRecord, ItemApprovalRequest, Role } from './types/app'

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
    const isJoinFlow = window.location.pathname.startsWith('/join/')
    return (
      <main className="auth-shell">
        <h1>Home Boys House</h1>
        <p>
          {isJoinFlow
            ? 'You\'ve been invited. Sign in or create an account to accept.'
            : 'Sign in to access your OSE campaign sidecar.'}
        </p>
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

  return (
    <Routes>
      <Route path="/" element={<Navigate to={groupPickerPath} replace />} />
      <Route path="/join/:token" element={<AcceptInvite user={user} />} />
      <Route path="/groups" element={<GroupShell user={user} username={username} />} />
      <Route path="/groups/:groupId" element={<GroupShell user={user} username={username} />} />
      <Route path="/groups/:groupId/campaigns/:campaignId/*" element={<GroupShell user={user} username={username} />} />
      <Route path="*" element={<Navigate to={groupPickerPath} replace />} />
    </Routes>
  )
}

function GroupShell({ user, username }: { user: User, username: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const activeTab = useMemo(() => tabFromPathname(location.pathname), [location.pathname])
  const documentVisible = useDocumentVisibility()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { groups, loading, error, createCampaign, createGroup, setActiveCampaign, deactivateCampaign, deleteInactiveCampaign, deleteDraftCampaign, deleteGroup, setError } = useGroupAccess(user)
  const selectedGroupId = params.groupId ?? null
  const selectedCampaignId = params.campaignId ?? null
  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  )
  const workspaceGroupId = selectedGroup?.source === 'group' ? selectedGroup.id : null
  const selectedCampaign = useMemo(() => {
    if (!selectedGroup) return null
    const campaigns = [
      ...(selectedGroup.activeCampaign ? [selectedGroup.activeCampaign] : []),
      ...selectedGroup.drafts,
      ...selectedGroup.inactiveCampaigns,
    ]
    if (selectedCampaignId) {
      return campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null
    }
    return selectedGroup.activeCampaign ?? null
  }, [selectedCampaignId, selectedGroup])
  const campaign = selectedCampaign
  const role: Role | null = campaign ? (campaign.gmUserId === user.uid ? 'gm' : 'player') : null

  useEffect(() => {
    if (loading) return
    if (location.pathname === '/') {
      const target = groups.length === 1 ? groupHomePath(groups[0].id) : groupPickerPath
      void navigate(target, { replace: true })
    }
  }, [groups, loading, location.pathname, navigate])

  const handleSelectGroup = useCallback((groupId: string) => {
    const nextGroup = groups.find((group) => group.id === groupId) ?? null
    void navigate(
      nextGroup?.activeCampaign
        ? campaignTabPath(groupId, nextGroup.activeCampaign!.id, 'character')
        : groupHomePath(groupId),
      { replace: true },
    )
    setDrawerOpen(false)
  }, [groups, navigate])

  const handleCreateGroup = useCallback(async (name: string) => {
    const groupId = await createGroup(name)
    void navigate(groupHomePath(groupId), { replace: true })
  }, [createGroup, navigate])

  const handleCreateCampaign = useCallback(async (groupId: string, name: string, system: string) => {
    await createCampaign(groupId, name, system)
    void navigate(groupHomePath(groupId), { replace: true })
  }, [createCampaign, navigate])

  const handleDeleteGroup = useCallback(async (groupId: string) => {
    await deleteGroup(groupId)
    void navigate(groupPickerPath, { replace: true })
  }, [deleteGroup, navigate])

  const handleSetActiveCampaign = useCallback(async (groupId: string, campaignId: string) => {
    await setActiveCampaign(groupId, campaignId)
  }, [setActiveCampaign])

  const handleDeleteDraftCampaign = useCallback(async (groupId: string, campaignId: string) => {
    await deleteDraftCampaign(groupId, campaignId)
    if (selectedGroupId === groupId && selectedCampaignId === campaignId) {
      void navigate(groupHomePath(groupId), { replace: true })
    }
  }, [deleteDraftCampaign, navigate, selectedCampaignId, selectedGroupId])

  const handleDeactivateCampaign = useCallback(async (groupId: string, campaignId: string) => {
    await deactivateCampaign(groupId, campaignId)
  }, [deactivateCampaign])

  const handleDeleteInactiveCampaign = useCallback(async (groupId: string, campaignId: string) => {
    await deleteInactiveCampaign(groupId, campaignId)
    if (selectedGroupId === groupId && selectedCampaignId === campaignId) {
      void navigate(groupHomePath(groupId), { replace: true })
    }
  }, [deleteInactiveCampaign, navigate, selectedCampaignId, selectedGroupId])

  const handleOpenCampaign = useCallback((campaignId: string) => {
    if (!selectedGroupId) return
    void navigate(campaignTabPath(selectedGroupId, campaignId, 'character'), { replace: true })
  }, [navigate, selectedGroupId])

  const shouldListenForCharacters = documentVisible && ['character', 'maps', 'items'].includes(activeTab)
  const shouldListenForApprovals = documentVisible && (role === 'gm' || activeTab === 'character')
  const shouldShowTransferNotification = documentVisible && ['character', 'maps'].includes(activeTab)
  const shouldShowCliffhangerModal = documentVisible && activeTab !== 'notes'
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
  } = useCharacters(campaign?.id ?? null, workspaceGroupId, user.uid, username, role, setError, shouldListenForCharacters)

  const characterTabProps = campaign ? {
    campaignId: campaign.id,
    groupId: workspaceGroupId,
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
    workspaceGroupId,
    role,
    user.uid,
    shouldListenForApprovals,
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
    void setDoc(
      campaignDocRef(db, { campaignId: campaign.id, groupId: workspaceGroupId }, 'members', user.uid),
      {
        ...(workspaceGroupId ? {} : { campaignId: campaign.id }),
        userId: user.uid,
        role,
        status: 'active',
        username,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  }, [campaign, role, user.uid, username, workspaceGroupId])

  const renderCampaignWorkspace = (group: GroupRecord) => (
    <>
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
          <h2>Access Error</h2>
          <p>{error}</p>
        </section>
      ) : !campaign ? (
        <section>
          <h2>No Active Campaign</h2>
          <p>This group does not have an active campaign yet.</p>
        </section>
      ) : (
        <div className="shell-layout">
          <nav className={`side-nav ${drawerOpen ? 'open' : ''}`}>
            <h1 className="side-title">Home Boys House</h1>
            <p className="side-meta">{group.name}</p>
            <button
              type="button"
              className="side-campaign-back"
              onClick={() => {
                void navigate(groupHomePath(group.id), { replace: true })
              }}
              aria-label={`Back to ${group.name}`}
            >
              <ChevronLeft size={16} />
              <span>{campaign.name}</span>
            </button>

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
                    to={campaignTabPath(group.id, campaign.id, tab.id)}
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
            {activeTab === 'character' ? (
              characterTabProps ? <CharacterTab {...characterTabProps} /> : null
            ) : activeTab === 'maps' ? (
              <MapsTab campaignId={campaign.id} groupId={workspaceGroupId} role={role} characterTabProps={characterTabProps ?? undefined} />
            ) : activeTab === 'monsters' ? (
              role === 'gm' ? <MonstersTab campaignId={campaign.id} groupId={workspaceGroupId} role={role} /> : null
            ) : activeTab === 'items' ? (
              role === 'gm' ? <ItemsTab campaignId={campaign.id} groupId={workspaceGroupId} role={role} characters={characters} /> : null
            ) : activeTab === 'npcs' ? (
              <NpcsTab campaignId={campaign.id} groupId={workspaceGroupId} role={role} />
            ) : activeTab === 'tables' ? (
              role === 'gm' ? <TablesTab campaignId={campaign.id} groupId={workspaceGroupId} /> : null
            ) : activeTab === 'notes' ? (
              <NotesTab campaignId={campaign.id} groupId={workspaceGroupId} role={role} />
            ) : activeTab === 'calendar' ? (
              <CalendarTab campaignId={campaign.id} groupId={workspaceGroupId} role={role} />
            ) : (
              <RulesTab />
            )}
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
      {campaign && shouldShowTransferNotification ? (
        <TransferNotification
          campaignId={campaign.id}
          groupId={workspaceGroupId}
          currentUserId={user.uid}
          role={role}
          characters={characters}
        />
      ) : null}
      {campaign ? (
        <CliffhangerModal campaignId={campaign.id} groupId={workspaceGroupId} userId={user.uid} enabled={shouldShowCliffhangerModal} />
      ) : null}
    </>
  )

  return (
    <main className="shell-root">
      {location.pathname === groupPickerPath || !selectedGroup ? (
        <GroupPicker
          username={username}
          groups={groups}
          onCreateGroup={handleCreateGroup}
          onSelectGroup={handleSelectGroup}
        />
      ) : !selectedCampaignId ? (
        <GroupHome
          user={user}
          username={username}
          onCreateCampaign={handleCreateCampaign}
          onSetActiveCampaign={handleSetActiveCampaign}
          onDeactivateCampaign={handleDeactivateCampaign}
          onDeleteInactiveCampaign={handleDeleteInactiveCampaign}
          onDeleteDraftCampaign={handleDeleteDraftCampaign}
          group={selectedGroup}
          onDeleteGroup={handleDeleteGroup}
          onBackToGroups={() => { void navigate(groupPickerPath, { replace: true }) }}
          onOpenCampaign={handleOpenCampaign}
          onOpenActiveCampaign={() => {
            if (selectedGroup.activeCampaign) {
              void navigate(campaignTabPath(selectedGroup.id, selectedGroup.activeCampaign.id, 'character'), { replace: true })
            }
          }}
        />
      ) : (
        renderCampaignWorkspace(selectedGroup)
      )}
    </main>
  )
}

export default App
