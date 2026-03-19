import type { AppTab } from '../../types/app'

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
  const matched = tabs.find((tab) => pathname === tabPaths[tab.id] || pathname.startsWith(`${tabPaths[tab.id]}/`))
  return matched?.id ?? 'character'
}
