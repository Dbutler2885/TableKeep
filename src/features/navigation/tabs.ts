import type { AppTab } from '../../types/app'

// The shell's name for a rule-set id.
export type { RuleSetId as GameSystem } from '../ruleSets/registry'

export const tabs: Array<{ id: AppTab; label: string }> = [
  { id: 'character', label: 'Character' },
  { id: 'maps', label: 'Maps' },
  { id: 'monsters', label: 'Monsters' },
  { id: 'items', label: 'Items' },
  { id: 'npcs', label: 'NPCs' },
  { id: 'tables', label: 'Tables' },
  { id: 'notes', label: 'Notes' },
  { id: 'handouts', label: 'Handouts' },
  { id: 'clocks', label: 'Clocks' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'rules', label: 'Rules' },
]

export const tabPaths: Record<AppTab, string> = {
  character: '/character',
  maps: '/maps',
  monsters: '/monsters',
  items: '/items',
  npcs: '/npcs',
  tables: '/tables',
  notes: '/notes',
  handouts: '/handouts',
  clocks: '/clocks',
  calendar: '/calendar',
  rules: '/rules',
}

// Tabs every campaign whose rule set has them shows, whatever its saved tab
// settings say. A saved list cannot tell a tab the GM turned off from one that
// did not exist yet when it was saved, so a tab added later is on for good.
export const requiredTabs: readonly AppTab[] = ['handouts', 'clocks']

export const tabFromPathname = (pathname: string): AppTab => {
  const matched = tabs.find((tab) => pathname.endsWith(tabPaths[tab.id]) || pathname.includes(`${tabPaths[tab.id]}/`))
  return matched?.id ?? 'character'
}

export const groupPickerPath = '/groups'

export const groupHomePath = (groupId: string) => `/groups/${groupId}`

export const campaignTabPath = (groupId: string, campaignId: string, tab: AppTab) =>
  `/groups/${groupId}/campaigns/${campaignId}${tabPaths[tab]}`
