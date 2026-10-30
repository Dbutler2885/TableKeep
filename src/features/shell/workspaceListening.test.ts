import { describe, expect, it } from 'vitest'
import type { AppTab } from '../../types/app'
import { hasApprovals, listensForApprovals, listensForCharacters, showsCliffhangerModal, showsTransferNotification } from './workspaceListening'

const ALL_TABS: AppTab[] = ['character', 'maps', 'monsters', 'items', 'npcs', 'tables', 'notes', 'calendar', 'rules']
const tabsWhere = (test: (tab: AppTab) => boolean) => ALL_TABS.filter(test)

describe('listensForCharacters', () => {
  it('listens on the visible OSE character, maps and items tabs', () => {
    expect(tabsWhere((tab) => listensForCharacters('ose', true, tab))).toEqual(['character', 'maps', 'items'])
  })

  it('never listens for VtM or while hidden', () => {
    expect(tabsWhere((tab) => listensForCharacters('vtm', true, tab))).toEqual([])
    expect(tabsWhere((tab) => listensForCharacters('ose', false, tab))).toEqual([])
  })
})

describe('hasApprovals', () => {
  it('is true for OSE only', () => {
    expect(hasApprovals('ose')).toBe(true)
    expect(hasApprovals('vtm')).toBe(false)
  })
})

describe('listensForApprovals', () => {
  it('listens in OSE for the GM on every tab and for others on the character tab', () => {
    expect(tabsWhere((tab) => listensForApprovals('ose', true, 'gm', tab))).toEqual(ALL_TABS)
    expect(tabsWhere((tab) => listensForApprovals('ose', true, 'player', tab))).toEqual(['character'])
    expect(tabsWhere((tab) => listensForApprovals('ose', true, null, tab))).toEqual(['character'])
  })

  it('never listens for VtM or while hidden', () => {
    expect(tabsWhere((tab) => listensForApprovals('vtm', true, 'gm', tab))).toEqual([])
    expect(tabsWhere((tab) => listensForApprovals('vtm', true, 'player', tab))).toEqual([])
    expect(tabsWhere((tab) => listensForApprovals('ose', false, 'gm', tab))).toEqual([])
  })
})

describe('showsTransferNotification', () => {
  it.each(['ose', 'lubec'] as const)('shows in %s on the visible character and maps tabs only', (gameSystem) => {
    expect(tabsWhere((tab) => showsTransferNotification(gameSystem, true, tab))).toEqual(['character', 'maps'])
    expect(tabsWhere((tab) => showsTransferNotification(gameSystem, false, tab))).toEqual([])
  })

  it('never shows for VtM', () => {
    expect(tabsWhere((tab) => showsTransferNotification('vtm', true, tab))).toEqual([])
  })
})

describe('showsCliffhangerModal', () => {
  it('shows off the notes tab while visible', () => {
    expect(tabsWhere((tab) => showsCliffhangerModal(true, tab))).toEqual(ALL_TABS.filter((tab) => tab !== 'notes'))
    expect(tabsWhere((tab) => showsCliffhangerModal(false, tab))).toEqual([])
  })
})
