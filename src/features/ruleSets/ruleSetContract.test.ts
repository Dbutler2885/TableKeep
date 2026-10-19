/**
 * The rule-set contract: what each rule set declares and what the shell does
 * with it. The resolution, side nav, route gate and settings rows for OSE and
 * VtM were recorded from the code as it stood before the registry existed, so
 * any change to them is a visible change for a player or GM, not a refactor.
 */
import { describe, expect, it } from 'vitest'
import type { AppTab, Campaign } from '../../types/app'
import { campaignSettingsTabs } from '../campaign/campaignTabSettings'
import { OSE_STORE_ITEMS } from '../character/storeCatalog'
import { campaignSystem } from '../shell/shellSelection'
import { campaignNavTabs, routableTab } from '../shell/shellTabs'
import { resolveRuleSet, ruleSets } from './registry'
import type { RuleSetId } from './registry'

// A campaign stores its rule set as a raw `system` string, which may be
// missing, empty or a value no rule set registers.
const resolve = (stored: string | null | undefined) =>
  campaignSystem({ id: 'c1', name: 'Campaign', status: 'active', groupId: 'g1', system: stored } as Campaign)

const allTabs: AppTab[] = ['character', 'maps', 'monsters', 'items', 'npcs', 'tables', 'notes', 'calendar', 'rules']

describe('rule-set resolution', () => {
  it.each([
    ['ose', 'ose'],
    ['vtm', 'vtm'],
    [undefined, 'ose'],
    [null, 'ose'],
    ['', 'ose'],
    ['lubec', 'ose'],
    ['VTM', 'ose'],
    ['constructor', 'ose'],
    ['__proto__', 'ose'],
  ] as const)('a campaign storing %j resolves to %s', (stored, expected) => {
    expect(resolve(stored)).toBe(expected)
  })

  it('resolves a campaign that is not open yet to OSE', () => {
    expect(campaignSystem(null)).toBe('ose')
  })
})

describe('rule-set declarations', () => {
  it('resolves every registered id to its own entry', () => {
    for (const [id, ruleSet] of Object.entries(ruleSets)) {
      expect(ruleSet.id).toBe(id)
      expect(resolveRuleSet(id)).toBe(ruleSet)
      expect(resolve(id)).toBe(id)
    }
  })

  it.each([
    ['ose', 'Old-School Essentials', 'OSE'],
    ['vtm', 'Vampire: the Masquerade', 'VTM'],
  ] as const)('%s is labelled %j, shortened to %j', (id: RuleSetId, label, shortLabel) => {
    expect(ruleSets[id]).toMatchObject({ id, label, shortLabel })
  })
})

describe('campaign dialogs and strip', () => {
  it.each([
    ['ose', ['create', 'sell', 'learn_spell', 'ability_reroll'], true],
    ['vtm', [], false],
  ] as const)('%s declares approvals %j and transfers %s', (id: RuleSetId, approvals, transfers) => {
    expect(ruleSets[id].approvals).toEqual(approvals)
    expect(ruleSets[id].transfers).toBe(transfers)
  })

  it.each(Object.keys(ruleSets) as RuleSetId[])('%s leaves the campaign strip off', (id) => {
    expect(ruleSets[id].shell).toEqual({ campaignStrip: false })
  })
})

describe('catalog', () => {
  it('OSE declares the store list as its catalog', () => {
    expect(ruleSets.ose.catalog).toBe(OSE_STORE_ITEMS)
  })

  it('VtM declares no catalog', () => {
    expect(ruleSets.vtm).not.toHaveProperty('catalog')
  })
})

describe('side nav tabs per role', () => {
  it.each([
    ['ose', 'gm', [
      ['character', 'Characters'],
      ['maps', 'Maps'],
      ['monsters', 'Monsters'],
      ['items', 'Items'],
      ['npcs', 'NPCs'],
      ['tables', 'Tables'],
      ['notes', 'Notes'],
      ['calendar', 'Calendar'],
      ['rules', 'OSE SRD'],
    ]],
    ['ose', 'player', [
      ['character', 'Character'],
      ['maps', 'Maps'],
      ['npcs', 'NPCs'],
      ['notes', 'Notes'],
      ['calendar', 'Calendar'],
      ['rules', 'OSE SRD'],
    ]],
    ['vtm', 'gm', [
      ['character', 'Characters'],
      ['maps', 'Maps'],
      ['monsters', 'Monsters'],
      ['npcs', 'NPCs'],
      ['notes', 'Notes'],
      ['calendar', 'Calendar'],
    ]],
    ['vtm', 'player', [
      ['character', 'Character'],
      ['maps', 'Maps'],
      ['monsters', 'Monsters'],
      ['npcs', 'NPCs'],
      ['notes', 'Notes'],
      ['calendar', 'Calendar'],
    ]],
  ] as const)('%s %s', (stored, role, expected) => {
    const nav = campaignNavTabs(resolve(stored), role, undefined)
    expect(nav.map((tab) => [tab.id, tab.label])).toEqual(expected)
  })

  it('keeps only the enabled tabs, in the rule set\'s order, and ignores tabs it lacks', () => {
    const enabled: AppTab[] = ['rules', 'items', 'character', 'notes', 'maps']
    expect(campaignNavTabs(resolve('ose'), 'gm', enabled).map((tab) => tab.id))
      .toEqual(['character', 'maps', 'items', 'notes', 'rules'])
    expect(campaignNavTabs(resolve('vtm'), 'gm', enabled).map((tab) => tab.id))
      .toEqual(['character', 'maps', 'notes'])
  })

  it('still hides OSE player tabs that the campaign has enabled', () => {
    expect(campaignNavTabs(resolve('ose'), 'player', ['character', 'items', 'monsters', 'tables', 'notes']).map((tab) => tab.id))
      .toEqual(['character', 'notes'])
    expect(campaignNavTabs(resolve('vtm'), 'player', ['character', 'monsters']).map((tab) => tab.id))
      .toEqual(['character', 'monsters'])
  })

  it('shows every tab with plain labels before the viewer\'s role is known', () => {
    expect(campaignNavTabs(resolve('ose'), null, undefined).map((tab) => tab.label))
      .toEqual(['Character', 'Maps', 'Monsters', 'Items', 'NPCs', 'Tables', 'Notes', 'Calendar', 'OSE SRD'])
  })
})

describe('route gate', () => {
  it.each([
    ['ose', allTabs, []],
    ['vtm', ['character', 'maps', 'monsters', 'npcs', 'notes', 'calendar'], ['items', 'tables', 'rules']],
  ] as const)('%s keeps its own tabs and sends the rest to the character tab', (stored, kept, redirected) => {
    for (const tab of kept) expect(routableTab(resolve(stored), tab)).toBe(tab)
    for (const tab of redirected) expect(routableTab(resolve(stored), tab)).toBe('character')
  })
})

describe('campaign settings tabs', () => {
  it.each([
    ['ose', [
      ['character', 'Character', true],
      ['maps', 'Maps', false],
      ['monsters', 'Monsters', false],
      ['items', 'Items', false],
      ['npcs', 'NPCs', false],
      ['tables', 'Tables', false],
      ['notes', 'Notes', false],
      ['calendar', 'Calendar', false],
    ]],
    ['vtm', [
      ['character', 'Character', true],
      ['maps', 'Maps', false],
      ['monsters', 'Monsters', false],
      ['npcs', 'NPCs', false],
      ['notes', 'Notes', false],
      ['calendar', 'Calendar', false],
    ]],
  ] as const)('%s lists only its own tabs', (stored, expected) => {
    expect(campaignSettingsTabs(resolve(stored)).map((tab) => [tab.id, tab.label, tab.locked])).toEqual(expected)
  })
})

describe('character schema versions', () => {
  it.each([
    ['ose', 1],
    ['vtm', 1],
  ] as const)('%s characters are written at version %i, with a step for each older version', (id: RuleSetId, version) => {
    expect(ruleSets[id].characters.schemaVersion).toBe(version)
    expect(ruleSets[id].characters.migrations).toHaveLength(version)
  })
})
