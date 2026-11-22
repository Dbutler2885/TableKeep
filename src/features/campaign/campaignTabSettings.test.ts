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

  it('never turns Handouts or Clocks off', () => {
    const enabled = new Set<AppTab>(['handouts', 'clocks'])

    expect(toggleEnabledTab(enabled, 'handouts')).toBe(enabled)
    expect(toggleEnabledTab(enabled, 'clocks')).toBe(enabled)
  })
})

describe('initialEnabledTabs', () => {
  it('turns on every tab of the system, rules link included, when nothing is saved', () => {
    expect([...initialEnabledTabs('ose', undefined)]).toEqual(['character', 'maps', 'monsters', 'items', 'npcs', 'tables', 'notes', 'handouts', 'calendar', 'rules'])
    expect([...initialEnabledTabs('vtm', [])]).toEqual(['character', 'maps', 'monsters', 'npcs', 'notes', 'handouts', 'calendar'])
  })

  it('adds Handouts to a saved list from before the feature', () => {
    expect([...initialEnabledTabs('vtm', ['notes', 'items'])]).toEqual(['notes', 'items', 'handouts'])
  })

  it('adds Lubec\'s Clocks to a saved list from before the feature, and no other rule set\'s', () => {
    expect([...initialEnabledTabs('lubec', ['character', 'maps'])]).toEqual(['character', 'maps', 'clocks', 'handouts'])
    expect([...initialEnabledTabs('ose', ['notes'])]).not.toContain('clocks')
  })
})

describe('enabledTabsToSave', () => {
  it('saves only the tabs the system has, in its order', () => {
    expect(enabledTabsToSave('vtm', new Set<AppTab>(['notes', 'items', 'character', 'rules']))).toEqual(['character', 'notes', 'handouts'])
    expect(enabledTabsToSave('lubec', new Set<AppTab>(['notes']))).toEqual(['clocks', 'notes', 'handouts'])
  })
})

describe('the Combat tab in settings', () => {
  it('is offered for Lubec only, and can be turned off', () => {
    expect(campaignSettingsTabs('lubec')).toContainEqual({ id: 'combat', label: 'Combat', locked: false })
    expect(campaignSettingsTabs('lubec').map((tab) => tab.id)).toEqual(['character', 'combat', 'maps', 'items', 'npcs', 'clocks', 'notes', 'handouts', 'calendar'])
    expect(campaignSettingsTabs('ose').map((tab) => tab.id)).not.toContain('combat')
    expect(campaignSettingsTabs('vtm').map((tab) => tab.id)).not.toContain('combat')
    expect([...toggleEnabledTab(new Set<AppTab>(['combat']), 'combat')]).toEqual([])
  })

  it('starts on in a campaign that never saved its tabs, and off in a saved list from before it', () => {
    expect([...initialEnabledTabs('lubec', undefined)]).toContain('combat')
    expect([...initialEnabledTabs('lubec', ['character', 'notes'])]).not.toContain('combat')
  })

  it('is saved for Lubec in rule-set order, and never for another rule set', () => {
    expect(enabledTabsToSave('lubec', new Set<AppTab>(['notes', 'combat', 'character']))).toEqual(['character', 'combat', 'clocks', 'notes', 'handouts'])
    expect(enabledTabsToSave('ose', new Set<AppTab>(['character', 'combat']))).toEqual(['character', 'handouts'])
  })
})
