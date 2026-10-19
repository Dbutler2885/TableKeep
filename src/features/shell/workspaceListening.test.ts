import { describe, expect, it } from 'vitest'
import type { AppTab } from '../../types/app'
import { listensForApprovals, listensForCharacters, showsCliffhangerModal, showsTransferNotification } from './workspaceListening'

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

describe('listensForApprovals', () => {
  it('listens for the GM on every tab and for others on the character tab', () => {
    expect(tabsWhere((tab) => listensForApprovals(true, 'gm', tab))).toEqual(ALL_TABS)
    expect(tabsWhere((tab) => listensForApprovals(true, 'player', tab))).toEqual(['character'])
    expect(tabsWhere((tab) => listensForApprovals(true, null, tab))).toEqual(['character'])
  })

  it('never listens while hidden', () => {
    expect(tabsWhere((tab) => listensForApprovals(false, 'gm', tab))).toEqual([])
  })
})

describe('showsTransferNotification', () => {
  it('shows on the visible character and maps tabs only', () => {
    expect(tabsWhere((tab) => showsTransferNotification(true, tab))).toEqual(['character', 'maps'])
    expect(tabsWhere((tab) => showsTransferNotification(false, tab))).toEqual([])
  })
})

describe('showsCliffhangerModal', () => {
  it('shows off the notes tab while visible', () => {
    expect(tabsWhere((tab) => showsCliffhangerModal(true, tab))).toEqual(ALL_TABS.filter((tab) => tab !== 'notes'))
    expect(tabsWhere((tab) => showsCliffhangerModal(false, tab))).toEqual([])
  })
})
