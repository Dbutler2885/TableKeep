import type { GameSystem } from '../navigation/tabs'
import { ruleSets } from '../ruleSets/registry'
import { ruleSetTabLabel, ruleSetTabs } from '../ruleSets/ruleSetTabs'
import type { AppTab, Role } from '../../types/app'

export type CampaignNavTab = { id: AppTab; label: string }

const SIDEBAR_PANEL_TABS: AppTab[] = ['character', 'maps', 'monsters', 'items', 'npcs', 'tables', 'notes']

export function campaignTabLabel(gameSystem: GameSystem, tab: AppTab, role: Role | null): string {
  if (tab === 'character' && role === 'gm') return 'Characters'
  return ruleSetTabLabel(gameSystem, tab)
}

function enabledSystemTabs(gameSystem: GameSystem, enabledTabs: AppTab[] | undefined) {
  const systemTabs = ruleSetTabs(gameSystem)
  const enabledSet = enabledTabs ? new Set(enabledTabs) : null
  return enabledSet ? systemTabs.filter((tab) => enabledSet.has(tab.id)) : systemTabs
}

// The side nav: the rule set's tabs the campaign has enabled, minus the tabs
// its players do not get, labelled for the viewer's role.
export function campaignNavTabs(gameSystem: GameSystem, role: Role | null, enabledTabs: AppTab[] | undefined): CampaignNavTab[] {
  const enabled = enabledSystemTabs(gameSystem, enabledTabs)
  const visible = role === 'player'
    ? enabled.filter((tab) => !ruleSets[gameSystem].tabs.hiddenFromPlayers.includes(tab.id))
    : enabled
  return visible.map((tab) => ({ id: tab.id, label: campaignTabLabel(gameSystem, tab.id, role) }))
}

// The route gate: a direct link to a tab the rule set lacks lands on the
// character tab instead.
export function routableTab(gameSystem: GameSystem, tab: AppTab): AppTab {
  return ruleSets[gameSystem].tabs.order.includes(tab) ? tab : 'character'
}

export const contentPanelClass = (activeTab: AppTab) =>
  SIDEBAR_PANEL_TABS.includes(activeTab) ? 'content-panel sidebar-panel' : 'content-panel'
