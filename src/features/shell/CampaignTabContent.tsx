import type { ReactNode } from 'react'
import { RulesTab } from '../common/RulesTab'
import { MapsTab } from '../maps/MapsTab'
import { MapRuleSetContext } from '../maps/mapRuleSet'
import { MapNpcSheetProvider } from '../maps/components/MapNpcSheetOverlay'
import { MonstersTab } from '../monsters/MonstersTab'
import { NpcsTab } from '../npcs/NpcsTab'
import { TablesTab } from '../tables/TablesTab'
import { NotesTab } from '../notes/NotesTab'
import { CalendarTab } from '../notes/CalendarTab'
import type { GameSystem } from '../navigation/tabs'
import { ruleSets } from '../ruleSets/registry'
import type { RuleSetSheetProps } from '../ruleSets/RuleSetSheets'
import { ruleSetItemsTabs, ruleSetNpcSheets, ruleSetSheets } from '../ruleSets/sheetComponents'
import type { AppTab, CharacterRecord, NpcRecord } from '../../types/app'

export type TabPanelContext = RuleSetSheetProps & {
  gameSystem: GameSystem
  characters: CharacterRecord[]
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

// The character tab shows whichever sheet the rule set declares.
function characterPanel({ gameSystem, ...context }: TabPanelContext) {
  const Sheet = ruleSetSheets[gameSystem]
  return <Sheet {...context} />
}

// Maps shows the sheet beside the map only when the rule set says it can,
// gives the rule set to everything inside it, and lets the GM open an NPC's
// sheet over the map from its token.
function mapsPanel(context: TabPanelContext) {
  const { campaign, role, gameSystem, characterTabProps } = context
  const ruleSet = ruleSets[gameSystem]
  return (
    <MapRuleSetContext value={ruleSet}>
      <MapNpcSheetProvider scope={{ campaignId: campaign.id, groupId: campaign.groupId }} sheetFor={npcSheetTabFor(context)}>
        <MapsTab
          campaignId={campaign.id}
          groupId={campaign.groupId}
          role={role}
          gmUserId={campaign.gmUserId ?? null}
          characterTabProps={ruleSet.sheet.embeddable ? characterTabProps ?? undefined : undefined}
        />
      </MapNpcSheetProvider>
    </MapRuleSetContext>
  )
}

// A rule set with a statline has a Monsters tab, which its players see unless
// the rule set hides it from them.
function monstersPanel({ campaign, role, gameSystem }: TabPanelContext) {
  const { monsters, tabs } = ruleSets[gameSystem]
  const visible = role === 'gm' || !tabs.hiddenFromPlayers.includes('monsters')
  return monsters && visible
    ? <MonstersTab campaignId={campaign.id} groupId={campaign.groupId} role={role} />
    : null
}

// The Items tab is the GM's, and shows whichever the rule set declares.
function itemsPanel({ gameSystem, role, characterTabProps: _characterTabProps, ...context }: TabPanelContext) {
  const Items = ruleSetItemsTabs[gameSystem]
  return Items && role === 'gm' ? <Items role={role} {...context} /> : null
}

// The GM gets an NPC's character sheet, beside its story and over the map, in a
// rule set that keeps one.
function npcSheetTabFor({ gameSystem, role, campaign, user, username, setError }: TabPanelContext) {
  const NpcSheet = ruleSets[gameSystem].sheet.npcSheet ? ruleSetNpcSheets[gameSystem] : null
  if (!NpcSheet || role !== 'gm') return undefined
  return (npc: NpcRecord) => <NpcSheet npc={npc} campaign={campaign} role={role} user={user} username={username} setError={setError} />
}

function npcsPanel(context: TabPanelContext) {
  const { campaign, role } = context
  return <NpcsTab campaignId={campaign.id} groupId={campaign.groupId} role={role} sheetTab={npcSheetTabFor(context)} />
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
