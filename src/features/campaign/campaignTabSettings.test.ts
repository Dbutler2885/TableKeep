import { describe, expect, it } from 'vitest'
import type { AppTab } from '../../types/app'
import { campaignSettingsTabs, enabledTabsToSave, initialEnabledTabs, toggleEnabledTab } from './campaignTabSettings'

describe('toggleEnabledTab', () => {
  it('turns a tab on and off without changing the set it was given', () => {
    const enabled = new Set<AppTab>(['character', 'maps'])

    expect([...toggleEnabledTab(enabled, 'maps')]).toEqual(['character'])
    expect([...toggleEnabledTab(enabled, 'notes')]).toEqual(['character', 'maps', 'notes'])
    expect([...enabled]).toEqual(['character', 'maps'])
  })

  it('never turns the character tab off', () => {
    const enabled = new Set<AppTab>(['character'])

    expect(toggleEnabledTab(enabled, 'character')).toBe(enabled)
  })
})

describe('initialEnabledTabs', () => {
  it('turns on every tab of the system, rules link included, when nothing is saved', () => {
    expect([...initialEnabledTabs('ose', undefined)]).toEqual(['character', 'maps', 'monsters', 'items', 'npcs', 'tables', 'notes', 'calendar', 'rules'])
    expect([...initialEnabledTabs('vtm', [])]).toEqual(['character', 'maps', 'monsters', 'npcs', 'notes', 'calendar'])
  })

  it('keeps a saved list as it is', () => {
    expect([...initialEnabledTabs('vtm', ['notes', 'items'])]).toEqual(['notes', 'items'])
  })
})

describe('enabledTabsToSave', () => {
  it('saves only the tabs the system has, in its order', () => {
    expect(enabledTabsToSave('vtm', new Set<AppTab>(['notes', 'items', 'character', 'rules']))).toEqual(['character', 'notes'])
  })
})

describe('the live-fight tab in settings', () => {
  it('is neither offered nor saved, as it follows the fight', () => {
    expect(campaignSettingsTabs('lubec').map((tab) => tab.id)).toEqual(['character', 'maps', 'items', 'npcs', 'notes', 'calendar'])
    expect([...initialEnabledTabs('lubec', undefined)]).not.toContain('combat')
    expect(enabledTabsToSave('lubec', new Set<AppTab>(['character', 'combat', 'notes']))).toEqual(['character', 'notes'])
  })
})
