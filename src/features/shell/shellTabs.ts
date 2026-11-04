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

/**
 * Whether the viewer's nav and routes offer the live-fight tab: false when
 * they do not, null while the live fight is still being read.
 */
export type CombatTabAccess = boolean | null

// Saved tab lists predate the live-fight tab, so they never hide it.
const LIVE_FIGHT_TAB: AppTab = 'combat'

function enabledSystemTabs(gameSystem: GameSystem, enabledTabs: AppTab[] | undefined) {
  const systemTabs = ruleSetTabs(gameSystem)
  const enabledSet = enabledTabs ? new Set([...enabledTabs, LIVE_FIGHT_TAB]) : null
  return enabledSet ? systemTabs.filter((tab) => enabledSet.has(tab.id)) : systemTabs
}

// The side nav: the rule set's tabs the campaign has enabled, minus the tabs
// its players do not get and the live-fight tab unless it is offered, labelled
// for the viewer's role.
export function campaignNavTabs(gameSystem: GameSystem, role: Role | null, enabledTabs: AppTab[] | undefined, combat: CombatTabAccess = false): CampaignNavTab[] {
  const hidden = [...(role === 'player' ? ruleSets[gameSystem].tabs.hiddenFromPlayers : []), ...(combat ? [] : [LIVE_FIGHT_TAB])]
  const visible = enabledSystemTabs(gameSystem, enabledTabs).filter((tab) => !hidden.includes(tab.id))
  return visible.map((tab) => ({ id: tab.id, label: campaignTabLabel(gameSystem, tab.id, role) }))
}

// The route gate: a direct link to a tab the rule set lacks, or to the
// live-fight tab when it is not offered, lands on the character tab instead.
// While the live fight is still being read the link waits where it is.
export function routableTab(gameSystem: GameSystem, tab: AppTab, combat: CombatTabAccess = false): AppTab {
  const offered = tab !== LIVE_FIGHT_TAB || combat !== false
  return offered && ruleSets[gameSystem].tabs.order.includes(tab) ? tab : 'character'
}

export const contentPanelClass = (activeTab: AppTab) =>
  SIDEBAR_PANEL_TABS.includes(activeTab) ? 'content-panel sidebar-panel' : 'content-panel'
