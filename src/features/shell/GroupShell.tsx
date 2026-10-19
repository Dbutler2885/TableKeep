import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Menu, Settings } from 'lucide-react'
import { signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
// Sidebar uses the dedicated B&W "Tower Keep" mark; the color "Tablekeep"
// stays on the lobby/picker/auth surfaces via BrandWordmark.
import tablekeepLogo from '../../../logo/Tower Keep.svg'
import { auth } from '../../firebase'
import { DiscordConnection } from '../auth/DiscordConnection'
import { DiscordReturnNotice } from '../auth/DiscordReturnNotice'
import { CharacterTab } from '../character/CharacterTab'
import { VtmCharacterTab } from '../character/VtmCharacterTab'
import { RulesTab } from '../common/RulesTab'
import { useDocumentVisibility } from '../common/useDocumentVisibility'
import { MapsTab } from '../maps/MapsTab'
import { MonstersTab } from '../monsters/MonstersTab'
import { ItemsTab } from '../items/ItemsTab'
import { NpcsTab } from '../npcs/NpcsTab'
import { TablesTab } from '../tables/TablesTab'
import { NotesTab } from '../notes/NotesTab'
import { CalendarTab } from '../notes/CalendarTab'
import { CliffhangerModal } from '../notes/CliffhangerModal'
import { campaignTabPath, groupHomePath, groupPickerPath, tabFromPathname } from '../navigation/tabs'
import { useCharacters } from '../character/hooks/useCharacters'
import { useItemApprovals } from '../character/hooks/useItemApprovals'
import { TransferNotification } from '../transfers/TransferNotification'
import { GroupPicker } from '../groups/GroupPicker'
import { GroupHome } from '../groups/GroupHome'
import { useGroupAccess } from '../groups/useGroupAccess'
import { CampaignSettingsModal } from '../campaign/CampaignSettingsModal'
import { DemoBanner } from '../demo/DemoBanner'
import { forgetDemoExpiry, readDemoExpiry } from '../demo/demoSandboxState'
import type { GroupRecord, ItemApprovalRequest } from '../../types/app'
import { approvalTitle, flagSuffix, itemDisplayName, numericSuffix } from './approvalText'
import { campaignIds, campaignRole, campaignSystem, findCampaign, findGroup, shellTheme } from './shellSelection'
import { campaignNavTabs, contentPanelClass, routableTab } from './shellTabs'
import { listensForApprovals, listensForCharacters, showsCliffhangerModal, showsTransferNotification } from './workspaceListening'

const OSE_SRD_URL = 'https://oldschoolessentials.necroticgnome.com/srd/index.php/Main_Page'

export function GroupShell({ user, username, isDemoVisitor }: { user: User, username: string, isDemoVisitor: boolean }) {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()
  const activeTab = useMemo(() => tabFromPathname(location.pathname), [location.pathname])
  const documentVisible = useDocumentVisibility()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const { groups, loading, error, createCampaign, createGroup, setActiveCampaign, deactivateCampaign, deleteInactiveCampaign, deleteDraftCampaign, deleteGroup, setError } = useGroupAccess(user)
  const selectedGroupId = params.groupId ?? null
  const selectedCampaignId = params.campaignId ?? null
  const selectedGroup = useMemo(() => findGroup(groups, selectedGroupId), [groups, selectedGroupId])
  const campaign = useMemo(() => findCampaign(selectedGroup, selectedCampaignId), [selectedCampaignId, selectedGroup])
  const ids = campaignIds(campaign)
  const role = campaignRole(campaign, user.uid)
  const gameSystem = campaignSystem(campaign)

  useEffect(() => {
    if (loading) return
    if (location.pathname === '/') {
      const target = groups.length === 1 ? groupHomePath(groups[0].id) : groupPickerPath
      void navigate(target, { replace: true })
    }
  }, [groups, loading, location.pathname, navigate])

  const handleSignOut = useCallback(() => {
    forgetDemoExpiry()
    void signOut(auth)
  }, [])

  // Read once per mount rather than per render: the value is written by the
  // demo entry screen and never changes for the life of the sandbox.
  const demoExpiresAt = useMemo(
    () => (isDemoVisitor ? readDemoExpiry(user.uid) : null),
    [isDemoVisitor, user.uid],
  )

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

  const shouldListenForCharacters = listensForCharacters(gameSystem, documentVisible, activeTab)
  const shouldListenForApprovals = listensForApprovals(documentVisible, role, activeTab)
  const shouldShowTransferNotification = showsTransferNotification(documentVisible, activeTab)
  const shouldShowCliffhangerModal = showsCliffhangerModal(documentVisible, activeTab)
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
  } = useCharacters(ids.campaignId, ids.groupId, user.uid, username, role, ids.gmUserId, setError, shouldListenForCharacters)

  const characterTabProps = campaign ? {
    campaignId: campaign.id,
    groupId: campaign.groupId,
    gmUserId: campaign.gmUserId ?? null,
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
    ids.campaignId,
    ids.groupId,
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

  const visibleTabs = useMemo(
    () => campaignNavTabs(gameSystem, role, campaign?.enabledTabs),
    [role, campaign?.enabledTabs, gameSystem],
  )

  // Hard-gate routes by system: a VtM campaign has no items/tables/rules routes,
  // so redirect direct navigation there back to the character tab.
  useEffect(() => {
    if (!campaign) return
    const target = routableTab(gameSystem, activeTab)
    if (target !== activeTab) {
      void navigate(campaignTabPath(campaign.groupId, campaign.id, target), { replace: true })
    }
  }, [activeTab, campaign, gameSystem, navigate])

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
            <h1 className="side-title">
              <span className="vtm-fang-anchor">Table</span>
              <img className="side-title-logo" src={tablekeepLogo} alt="" aria-hidden="true" />
              <span className="vtm-fang-anchor">Keep</span>
            </h1>
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
                    {tab.label}
                  </a>
                ) : (
                  <NavLink
                    key={tab.id}
                    to={campaignTabPath(group.id, campaign.id, tab.id)}
                    end
                    onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) => (isActive ? 'tab-button active' : 'tab-button')}
                  >
                    {tab.label}
                  </NavLink>
                )
              ))}
            </div>

            <div className="account-panel">
              <p className="account-email account-username">Username: {username}</p>
              <p className="account-email">Role: {role}</p>
              {isDemoVisitor ? null : (
                <>
                  <DiscordConnection userId={user.uid} variant="panel" />
                  <DiscordReturnNotice variant="panel" />
                </>
              )}
              {role === 'gm' ? (
                <button
                  type="button"
                  className="side-settings-button"
                  onClick={() => {
                    setSettingsOpen(true)
                    setDrawerOpen(false)
                  }}
                >
                  <Settings size={14} />
                  <span>Campaign settings</span>
                </button>
              ) : null}
              <button type="button" onClick={handleSignOut}>
                Sign Out
              </button>
            </div>
          </nav>

          {drawerOpen ? <button className="drawer-backdrop" onClick={() => setDrawerOpen(false)} /> : null}

          <section className={contentPanelClass(activeTab)}>
            {activeTab === 'character' ? (
              gameSystem === 'vtm' ? (
                <VtmCharacterTab
                  campaignId={campaign.id}
                  groupId={campaign.groupId}
                  role={role}
                  currentUserId={user.uid}
                  currentUsername={username}
                  gmUserId={campaign.gmUserId ?? null}
                  setError={setError}
                />
              ) : characterTabProps ? <CharacterTab {...characterTabProps} /> : null
            ) : activeTab === 'maps' ? (
              <MapsTab
                campaignId={campaign.id}
                groupId={campaign.groupId}
                role={role}
                gmUserId={campaign.gmUserId ?? null}
                characterTabProps={gameSystem === 'ose' ? characterTabProps ?? undefined : undefined}
              />
            ) : activeTab === 'monsters' ? (
              role === 'gm' || gameSystem === 'vtm'
                ? <MonstersTab campaignId={campaign.id} groupId={campaign.groupId} role={role} />
                : null
            ) : activeTab === 'items' ? (
              role === 'gm' ? <ItemsTab campaignId={campaign.id} groupId={campaign.groupId} role={role} characters={characters} /> : null
            ) : activeTab === 'npcs' ? (
              <NpcsTab campaignId={campaign.id} groupId={campaign.groupId} role={role} />
            ) : activeTab === 'tables' ? (
              role === 'gm' ? <TablesTab campaignId={campaign.id} groupId={campaign.groupId} /> : null
            ) : activeTab === 'notes' ? (
              <NotesTab campaignId={campaign.id} groupId={campaign.groupId} role={role} />
            ) : activeTab === 'calendar' ? (
              <CalendarTab campaignId={campaign.id} groupId={campaign.groupId} role={role} />
            ) : (
              <RulesTab />
            )}
          </section>
        </div>
      )}
      {role === 'gm' && pendingRequests.length > 0 ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal">
            <h3>{approvalTitle(pendingRequests[0].action)}</h3>
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
              const displayName = itemDisplayName(item)
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
                      {numericSuffix(item.attackBonus, ` | Atk +${item.attackBonus}`)}
                      {numericSuffix(item.damageBonus, ` | Dmg +${item.damageBonus}`)}
                      {numericSuffix(item.rangeShort, ` | Range ${item.rangeShort}/${item.rangeMedium}/${item.rangeLong}`)}
                      {flagSuffix(item.twoHanded, ' | Two-handed')}
                      {flagSuffix(item.isMagic, ' | Magic')}
                    </p>
                  ) : null}
                  {item.kind === 'armour' && 'armourClass' in item ? (
                    <p style={{ fontSize: '0.9em' }}>
                      AC: {item.armourClass}
                      {item.armourType === 'shield' ? ' (Shield)' : ' (Body)'}
                      {numericSuffix(item.magicMod, ` | Magic +${item.magicMod}`)}
                      {flagSuffix(item.isMagic, ' | Magic')}
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
          groupId={campaign.groupId}
          currentUserId={user.uid}
          role={role}
          characters={characters}
        />
      ) : null}
      {campaign ? (
        <CliffhangerModal campaignId={campaign.id} groupId={campaign.groupId} userId={user.uid} enabled={shouldShowCliffhangerModal} />
      ) : null}
      {settingsOpen && campaign ? (
        <CampaignSettingsModal
          groupId={campaign.groupId}
          campaign={campaign}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </>
  )

  return (
    <main className="shell-root" data-theme={shellTheme(campaign, selectedCampaignId, gameSystem)}>
      {location.pathname === groupPickerPath || !selectedGroup ? (
        <GroupPicker
          username={username}
          groups={groups}
          onCreateGroup={handleCreateGroup}
          onSelectGroup={handleSelectGroup}
          onSignOut={handleSignOut}
          discordUserId={isDemoVisitor ? undefined : user.uid}
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
          canInvite={!isDemoVisitor}
          group={selectedGroup}
          onDeleteGroup={handleDeleteGroup}
          onBackToGroups={() => { void navigate(groupPickerPath, { replace: true }) }}
          onOpenCampaign={handleOpenCampaign}
          onSignOut={handleSignOut}
          onOpenActiveCampaign={() => {
            if (selectedGroup.activeCampaign) {
              void navigate(campaignTabPath(selectedGroup.id, selectedGroup.activeCampaign.id, 'character'), { replace: true })
            }
          }}
        />
      ) : (
        renderCampaignWorkspace(selectedGroup)
      )}
      {isDemoVisitor ? <DemoBanner expiresAtMs={demoExpiresAt} onLeave={handleSignOut} /> : null}
    </main>
  )
}
