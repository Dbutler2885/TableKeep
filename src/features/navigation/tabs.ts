import type { AppTab } from '../../types/app'

export const tabs: Array<{ id: AppTab; label: string }> = [
  { id: 'character', label: 'Character' },
  { id: 'maps', label: 'Maps' },
  { id: 'monsters', label: 'Monsters' },
  { id: 'npcs', label: 'NPCs' },
  { id: 'notes', label: 'Notes' },
  { id: 'rules', label: 'Rules' },
]

export const tabPaths: Record<AppTab, string> = {
  character: '/character',
  maps: '/maps',
  monsters: '/monsters',
  npcs: '/npcs',
  notes: '/notes',
  rules: '/rules',
}

export const tabFromPathname = (pathname: string): AppTab => {
  const matched = tabs.find((tab) => pathname === tabPaths[tab.id] || pathname.startsWith(`${tabPaths[tab.id]}/`))
  return matched?.id ?? 'character'
}
