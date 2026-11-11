import { describe, expect, it } from 'vitest'
import type { AppTab } from '../../types/app'
import { enabledTabsToSave, initialEnabledTabs, toggleEnabledTab } from './campaignTabSettings'

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
