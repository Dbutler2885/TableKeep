import type { ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { CharacterTab } from '../character/CharacterTab'
import { VtmCharacterTab } from '../character/VtmCharacterTab'
import { RulesTab } from '../common/RulesTab'
import { MapsTab } from '../maps/MapsTab'
import { MonstersTab } from '../monsters/MonstersTab'
import { ItemsTab } from '../items/ItemsTab'
import { NpcsTab } from '../npcs/NpcsTab'
import { TablesTab } from '../tables/TablesTab'
import { NotesTab } from '../notes/NotesTab'
import { CalendarTab } from '../notes/CalendarTab'
import type { GameSystem } from '../navigation/tabs'
import type { AppTab, Campaign, CharacterRecord, Role } from '../../types/app'
import type { CharacterTabProps } from './characterTabProps'

export type TabPanelContext = {
  campaign: Campaign
  role: Role | null
  gameSystem: GameSystem
  user: User
  username: string
  setError: (message: string) => void
  characters: CharacterRecord[]
  characterTabProps: CharacterTabProps | null
}

type CampaignTabContentProps = TabPanelContext & { activeTab: AppTab }

// Each tab's panel. A tab a role may not see renders nothing; the route gate,
// not the panel, keeps a campaign off the tabs its system lacks.
const TAB_PANELS: Record<AppTab, (context: TabPanelContext) => ReactNode> = {
  character: characterPanel,
  maps: mapsPanel,
  monsters: monstersPanel,
  items: itemsPanel,
  npcs: npcsPanel,
  tables: tablesPanel,
  notes: notesPanel,
  calendar: calendarPanel,
  rules: rulesPanel,
}

export function CampaignTabContent({ activeTab, ...context }: CampaignTabContentProps) {
  return TAB_PANELS[activeTab](context)
}

function characterPanel({ campaign, role, gameSystem, user, username, setError, characterTabProps }: TabPanelContext) {
  if (gameSystem === 'vtm') {
    return (
      <VtmCharacterTab
        campaignId={campaign.id}
        groupId={campaign.groupId}
        role={role}
        currentUserId={user.uid}
        currentUsername={username}
        gmUserId={campaign.gmUserId ?? null}
        setError={setError}
      />
    )
  }
  return characterTabProps ? <CharacterTab {...characterTabProps} /> : null
}

function mapsPanel({ campaign, role, gameSystem, characterTabProps }: TabPanelContext) {
  return (
    <MapsTab
      campaignId={campaign.id}
      groupId={campaign.groupId}
      role={role}
      gmUserId={campaign.gmUserId ?? null}
      characterTabProps={gameSystem === 'ose' ? characterTabProps ?? undefined : undefined}
    />
  )
}

function monstersPanel({ campaign, role, gameSystem }: TabPanelContext) {
  return role === 'gm' || gameSystem === 'vtm'
    ? <MonstersTab campaignId={campaign.id} groupId={campaign.groupId} role={role} />
    : null
}

function itemsPanel({ campaign, role, characters }: TabPanelContext) {
  return role === 'gm' ? <ItemsTab campaignId={campaign.id} groupId={campaign.groupId} role={role} characters={characters} /> : null
}

function npcsPanel({ campaign, role }: TabPanelContext) {
  return <NpcsTab campaignId={campaign.id} groupId={campaign.groupId} role={role} />
}

function tablesPanel({ campaign, role }: TabPanelContext) {
  return role === 'gm' ? <TablesTab campaignId={campaign.id} groupId={campaign.groupId} /> : null
}

function notesPanel({ campaign, role }: TabPanelContext) {
  return <NotesTab campaignId={campaign.id} groupId={campaign.groupId} role={role} />
}

function calendarPanel({ campaign, role }: TabPanelContext) {
  return <CalendarTab campaignId={campaign.id} groupId={campaign.groupId} role={role} />
}

function rulesPanel() {
  return <RulesTab />
}
