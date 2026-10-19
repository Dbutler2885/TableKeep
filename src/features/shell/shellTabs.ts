import { tabs, tabsForSystem } from '../navigation/tabs'
import type { GameSystem } from '../navigation/tabs'
import type { AppTab, Role } from '../../types/app'

export type CampaignNavTab = { id: AppTab; label: string }

const PLAYER_HIDDEN_OSE_TABS: AppTab[] = ['items', 'monsters', 'tables']
const SIDEBAR_PANEL_TABS: AppTab[] = ['character', 'maps', 'monsters', 'items', 'npcs', 'tables', 'notes']

export function campaignTabLabel(tab: AppTab, role: Role | null): string {
  if (tab === 'character' && role === 'gm') return 'Characters'
  return tabs.find((item) => item.id === tab)?.label ?? tab
}

function enabledSystemTabs(gameSystem: GameSystem, enabledTabs: AppTab[] | undefined) {
  const systemTabs = tabsForSystem(gameSystem)
  const enabledSet = enabledTabs ? new Set(enabledTabs) : null
  return enabledSet ? systemTabs.filter((tab) => enabledSet.has(tab.id)) : systemTabs
}

// The side nav: the system's tabs the campaign has enabled, minus the OSE tabs
// its players do not get, labelled for the viewer's role.
export function campaignNavTabs(gameSystem: GameSystem, role: Role | null, enabledTabs: AppTab[] | undefined): CampaignNavTab[] {
  const enabled = enabledSystemTabs(gameSystem, enabledTabs)
  const visible = role === 'player' && gameSystem === 'ose'
    ? enabled.filter((tab) => !PLAYER_HIDDEN_OSE_TABS.includes(tab.id))
    : enabled
  return visible.map((tab) => ({ id: tab.id, label: campaignTabLabel(tab.id, role) }))
}

// The route gate: a direct link to a tab the system lacks lands on the
// character tab instead.
export function routableTab(gameSystem: GameSystem, tab: AppTab): AppTab {
  const allowed = new Set(tabsForSystem(gameSystem).map((systemTab) => systemTab.id))
  return allowed.has(tab) ? tab : 'character'
}

export const contentPanelClass = (activeTab: AppTab) =>
  SIDEBAR_PANEL_TABS.includes(activeTab) ? 'content-panel sidebar-panel' : 'content-panel'
