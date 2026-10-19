import type { GameSystem } from '../navigation/tabs'
import { ruleSetTabs } from '../ruleSets/ruleSetTabs'
import type { AppTab } from '../../types/app'

export type SettingsTab = { id: AppTab; label: string; locked: boolean }

// Every tab the rule set has, in display order, the rules link included.
// Saving keeps this order.
const systemTabIds = (gameSystem: GameSystem): AppTab[] => ruleSetTabs(gameSystem).map((tab) => tab.id)

// The tabs campaign settings offer: the rule set's own, except the rules link,
// with the character tab always on.
export const campaignSettingsTabs = (gameSystem: GameSystem): SettingsTab[] =>
  ruleSetTabs(gameSystem)
    .filter((tab) => tab.id !== 'rules')
    .map((tab) => ({ id: tab.id, label: tab.label, locked: tab.id === 'character' }))

// A campaign that has never saved its tabs starts with every tab on.
export const initialEnabledTabs = (gameSystem: GameSystem, enabledTabs: AppTab[] | undefined): Set<AppTab> =>
  new Set(enabledTabs && enabledTabs.length > 0 ? enabledTabs : systemTabIds(gameSystem))

// The character tab cannot be turned off.
export function toggleEnabledTab(enabled: Set<AppTab>, tab: AppTab): Set<AppTab> {
  if (tab === 'character') return enabled
  const next = new Set(enabled)
  if (next.has(tab)) next.delete(tab)
  else next.add(tab)
  return next
}

// Only tabs the rule set has are saved, so a GM can't enable a tab that the
// rule set later hides (which would leave confusing stored state).
export const enabledTabsToSave = (gameSystem: GameSystem, enabled: Set<AppTab>): AppTab[] =>
  systemTabIds(gameSystem).filter((id) => enabled.has(id))
