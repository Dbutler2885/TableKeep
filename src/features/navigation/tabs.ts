import type { AppTab } from '../../types/app'

export type GameSystem = 'ose' | 'vtm'

export const resolveSystem = (system: string | undefined | null): GameSystem =>
  system === 'vtm' ? 'vtm' : 'ose'

export const tabs: Array<{ id: AppTab; label: string }> = [
  { id: 'character', label: 'Character' },
  { id: 'maps', label: 'Maps' },
  { id: 'monsters', label: 'Monsters' },
  { id: 'items', label: 'Items' },
  { id: 'npcs', label: 'NPCs' },
  { id: 'tables', label: 'Tables' },
  { id: 'notes', label: 'Notes' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'rules', label: 'OSE SRD' },
]

// Which tabs each game system exposes, in display order. VtM is a lighter,
// mostly-presentational variant: fillable sheets, NPCs, monster reference, and
// maps — no items/store, no treasure tables, no OSE SRD link.
const SYSTEM_TAB_IDS: Record<GameSystem, AppTab[]> = {
  ose: ['character', 'maps', 'monsters', 'items', 'npcs', 'tables', 'notes', 'calendar', 'rules'],
  vtm: ['character', 'maps', 'monsters', 'npcs', 'notes', 'calendar'],
}

export const tabsForSystem = (system: GameSystem): Array<{ id: AppTab; label: string }> =>
  SYSTEM_TAB_IDS[system]
    .map((id) => tabs.find((tab) => tab.id === id))
    .filter((tab): tab is { id: AppTab; label: string } => Boolean(tab))

export const tabPaths: Record<AppTab, string> = {
  character: '/character',
  maps: '/maps',
  monsters: '/monsters',
  items: '/items',
  npcs: '/npcs',
  tables: '/tables',
  notes: '/notes',
  calendar: '/calendar',
  rules: '/rules',
}

export const tabFromPathname = (pathname: string): AppTab => {
  const matched = tabs.find((tab) => pathname.endsWith(tabPaths[tab.id]) || pathname.includes(`${tabPaths[tab.id]}/`))
  return matched?.id ?? 'character'
}

export const groupPickerPath = '/groups'

export const groupHomePath = (groupId: string) => `/groups/${groupId}`

export const campaignTabPath = (groupId: string, campaignId: string, tab: AppTab) =>
  `/groups/${groupId}/campaigns/${campaignId}${tabPaths[tab]}`
