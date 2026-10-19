import { describe, expect, it } from 'vitest'
import type { AppTab } from '../../types/app'
import { campaignNavTabs, campaignTabLabel, contentPanelClass, routableTab } from './shellTabs'

const ids = (tabs: Array<{ id: AppTab }>) => tabs.map((tab) => tab.id)

describe('campaignTabLabel', () => {
  it('calls the character tab Characters for the GM only', () => {
    expect(campaignTabLabel('character', 'gm')).toBe('Characters')
    expect(campaignTabLabel('character', 'player')).toBe('Character')
    expect(campaignTabLabel('character', null)).toBe('Character')
  })

  it('uses the shared tab label otherwise', () => {
    expect(campaignTabLabel('npcs', 'gm')).toBe('NPCs')
    expect(campaignTabLabel('rules', 'player')).toBe('OSE SRD')
  })

  it('falls back to the id for a tab it does not know', () => {
    expect(campaignTabLabel('unknown' as AppTab, 'gm')).toBe('unknown')
  })
})

describe('campaignNavTabs', () => {
  it('gives the GM every OSE tab, labelled', () => {
    expect(campaignNavTabs('ose', 'gm', undefined)).toEqual([
      { id: 'character', label: 'Characters' },
      { id: 'maps', label: 'Maps' },
      { id: 'monsters', label: 'Monsters' },
      { id: 'items', label: 'Items' },
      { id: 'npcs', label: 'NPCs' },
      { id: 'tables', label: 'Tables' },
      { id: 'notes', label: 'Notes' },
      { id: 'calendar', label: 'Calendar' },
      { id: 'rules', label: 'OSE SRD' },
    ])
  })

  it('hides items, monsters and tables from an OSE player', () => {
    expect(ids(campaignNavTabs('ose', 'player', undefined))).toEqual(['character', 'maps', 'npcs', 'notes', 'calendar', 'rules'])
  })

  it('hides nothing from a VtM player', () => {
    expect(ids(campaignNavTabs('vtm', 'player', undefined))).toEqual(['character', 'maps', 'monsters', 'npcs', 'notes', 'calendar'])
  })

  it('hides nothing without a role', () => {
    expect(ids(campaignNavTabs('ose', null, undefined))).toEqual(['character', 'maps', 'monsters', 'items', 'npcs', 'tables', 'notes', 'calendar', 'rules'])
  })

  it('keeps only the enabled tabs the system has, in system order', () => {
    expect(ids(campaignNavTabs('ose', 'gm', ['rules', 'notes', 'items', 'maps']))).toEqual(['maps', 'items', 'notes', 'rules'])
    expect(ids(campaignNavTabs('vtm', 'gm', ['items', 'rules', 'npcs']))).toEqual(['npcs'])
    expect(ids(campaignNavTabs('ose', 'player', ['items', 'tables', 'npcs']))).toEqual(['npcs'])
    expect(campaignNavTabs('ose', 'gm', [])).toEqual([])
  })
})

describe('routableTab', () => {
  it('keeps a tab the system has', () => {
    expect(routableTab('ose', 'items')).toBe('items')
    expect(routableTab('ose', 'rules')).toBe('rules')
    expect(routableTab('vtm', 'monsters')).toBe('monsters')
  })

  it('sends a tab the system lacks to the character tab', () => {
    expect(routableTab('vtm', 'items')).toBe('character')
    expect(routableTab('vtm', 'tables')).toBe('character')
    expect(routableTab('vtm', 'rules')).toBe('character')
  })
})

describe('contentPanelClass', () => {
  it('gives the list-and-detail tabs the sidebar layout', () => {
    const sidebar: AppTab[] = ['character', 'maps', 'monsters', 'items', 'npcs', 'tables', 'notes']
    for (const tab of sidebar) expect(contentPanelClass(tab)).toBe('content-panel sidebar-panel')
    expect(contentPanelClass('calendar')).toBe('content-panel')
    expect(contentPanelClass('rules')).toBe('content-panel')
  })
})
