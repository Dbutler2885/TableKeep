import { requiredTabs, type GameSystem } from '../navigation/tabs'
import { ruleSetTabs } from '../ruleSets/ruleSetTabs'
import type { AppTab } from '../../types/app'

export type SettingsTab = { id: AppTab; label: string; locked: boolean }

// Every tab the rule set has, in display order, the rules link included.
// Saving keeps this order.
const systemTabIds = (gameSystem: GameSystem): AppTab[] => ruleSetTabs(gameSystem).map((tab) => tab.id)

// Character and the required tabs (Handouts, and Lubec's Clocks) cannot be turned off.
const isLocked = (tab: AppTab) => tab === 'character' || requiredTabs.includes(tab)

// The tabs campaign settings offer: the rule set's own, except the rules link,
// with the locked ones always on.
export const campaignSettingsTabs = (gameSystem: GameSystem): SettingsTab[] =>
  ruleSetTabs(gameSystem)
    .filter((tab) => tab.id !== 'rules')
    .map((tab) => ({ id: tab.id, label: tab.label, locked: isLocked(tab.id) }))

// A campaign that has never saved its tabs starts with every tab on, and a
// saved list gains the required tabs the rule set has.
export function initialEnabledTabs(gameSystem: GameSystem, enabledTabs: AppTab[] | undefined): Set<AppTab> {
  const systemTabs = systemTabIds(gameSystem)
  const saved = enabledTabs && enabledTabs.length > 0 ? enabledTabs : systemTabs
  return new Set([...saved, ...systemTabs.filter((id) => requiredTabs.includes(id))])
}

export function toggleEnabledTab(enabled: Set<AppTab>, tab: AppTab): Set<AppTab> {
  if (isLocked(tab)) return enabled
  const next = new Set(enabled)
  if (next.has(tab)) next.delete(tab)
  else next.add(tab)
  return next
}

// Only tabs the rule set has are saved, so a GM can't enable a tab that the
// rule set later hides (which would leave confusing stored state).
export const enabledTabsToSave = (gameSystem: GameSystem, enabled: Set<AppTab>): AppTab[] =>
  systemTabIds(gameSystem).filter((id) => requiredTabs.includes(id) || enabled.has(id))
