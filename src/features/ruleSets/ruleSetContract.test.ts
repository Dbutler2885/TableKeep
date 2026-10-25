/**
 * The rule-set contract: what each rule set declares and what the shell does
 * with it. The resolution, side nav, route gate and settings rows for OSE and
 * VtM were recorded from the code as it stood before the registry existed, so
 * any change to them is a visible change for a player or GM, not a refactor.
 */
import { describe, expect, it } from 'vitest'
import type { AppTab, Campaign } from '../../types/app'
import { campaignSettingsTabs } from '../campaign/campaignTabSettings'
import { oseCharacterParser } from '../character/lib/storedCharacterRecord'
import { OSE_STORE_ITEMS } from '../character/storeCatalog'
import { vtmCharacterParser } from '../character/vtmCharacterRecord'
import { campaignCardLabel } from '../groups/groupHomeCampaigns'
import { mapCharacterSummaryFromData } from '../maps/lib/mapCharacterSummary'
import { isPartyCharacter } from '../maps/lib/partyCharacterEligibility'
import { campaignSystem } from '../shell/shellSelection'
import { lubecCharacterParser } from './lubec/characterParser'
import lubecFixture from './lubec/fixtures/stored-character.json'
import { campaignNavTabs, routableTab } from '../shell/shellTabs'
import { oseCarrying } from './ose/carrying'
import { resolveRuleSet, ruleSets, selectableRuleSets } from './registry'
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
    ['lubec', 'lubec'],
    [undefined, 'ose'],
    [null, 'ose'],
    ['', 'ose'],
    ['VTM', 'ose'],
    ['LUBEC', 'ose'],
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
    ['lubec', 'Lubec 1977', 'LUBEC'],
  ] as const)('%s is labelled %j, shortened to %j', (id: RuleSetId, label, shortLabel) => {
    expect(ruleSets[id]).toMatchObject({ id, label, shortLabel })
  })
})

describe('campaign creation and cards', () => {
  it.each([
    ['ose', true],
    ['vtm', true],
    ['lubec', true],
  ] as const)('%s is selectable for a new campaign: %s', (id: RuleSetId, selectable) => {
    expect(ruleSets[id].selectable).toBe(selectable)
  })

  it('the picker offers the selectable rule sets by full name, OSE first', () => {
    expect(selectableRuleSets().map((ruleSet) => [ruleSet.id, ruleSet.label])).toEqual([
      ['ose', 'Old-School Essentials'],
      ['vtm', 'Vampire: the Masquerade'],
      ['lubec', 'Lubec 1977'],
    ])
  })

  it.each([
    ['ose', 'OSE'],
    ['vtm', 'VTM'],
    ['lubec', 'LUBEC'],
    [undefined, 'OSE'],
    ['', 'OSE'],
    ['pathfinder', 'OSE'],
  ] as const)('a campaign card storing %j reads %j', (stored, shortLabel) => {
    const campaign = { id: 'c1', name: 'Campaign', status: 'active', groupId: 'g1', system: stored } as Campaign
    expect(campaignCardLabel(campaign, 'active')).toBe(`${shortLabel} · active`)
  })
})

describe('campaign dialogs and strip', () => {
  it.each([
    ['ose', ['create', 'sell', 'learn_spell', 'ability_reroll'], true],
    ['vtm', [], false],
    ['lubec', [], false],
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

  it.each(['vtm', 'lubec'] as const)('%s declares no catalog', (id) => {
    expect(ruleSets[id]).not.toHaveProperty('catalog')
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
    ['lubec', 'gm', [
      ['character', 'Characters'],
      ['maps', 'Maps'],
      ['npcs', 'NPCs'],
      ['notes', 'Notes'],
      ['calendar', 'Calendar'],
    ]],
    ['lubec', 'player', [
      ['character', 'Character'],
      ['maps', 'Maps'],
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
    expect(campaignNavTabs(resolve('lubec'), 'gm', enabled).map((tab) => tab.id))
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
    ['lubec', ['character', 'maps', 'npcs', 'notes', 'calendar'], ['monsters', 'items', 'tables', 'rules']],
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
    ['lubec', [
      ['character', 'Character', true],
      ['maps', 'Maps', false],
      ['npcs', 'NPCs', false],
      ['notes', 'Notes', false],
      ['calendar', 'Calendar', false],
    ]],
  ] as const)('%s lists only its own tabs', (stored, expected) => {
    expect(campaignSettingsTabs(resolve(stored)).map((tab) => [tab.id, tab.label, tab.locked])).toEqual(expected)
  })
})

describe('character schema versions', () => {
  // Lubec is born at version 1, so it has no older version to step up from.
  it.each([
    ['ose', 1, 1],
    ['vtm', 1, 1],
    ['lubec', 1, 0],
  ] as const)('%s characters are written at version %i, with %i migration steps', (id: RuleSetId, version, steps) => {
    expect(ruleSets[id].characters.schemaVersion).toBe(version)
    expect(ruleSets[id].characters.migrations).toHaveLength(steps)
  })
})

describe('character parsers', () => {
  it('reads OSE and VtM characters through their own sheets\' parsers', () => {
    expect(ruleSets.ose.characters.parser).toBe(oseCharacterParser)
    expect(ruleSets.vtm.characters.parser).toBe(vtmCharacterParser)
  })

  it('reads Lubec characters through the Lubec sheet\'s parser', () => {
    expect(ruleSets.lubec.characters.parser).toBe(lubecCharacterParser)
  })

  // The checked-in Lubec character carries fields the parser does not model,
  // top-level, nested and on a list row, and a hole: Speed was never given.
  it('parses a Lubec character the same after a serialize, keeping its unknown fields and its hole', () => {
    const { parser } = ruleSets.lubec.characters
    const parsed = parser.parse(lubecFixture.id, lubecFixture.data)
    const serialized = parser.serialize(parsed)

    expect(parser.parse(lubecFixture.id, serialized)).toEqual(parsed)
    expect(serialized.unknownTopLevel).toEqual(lubecFixture.data.unknownTopLevel)
    const sheet = serialized.lubec as typeof lubecFixture.data.lubec
    expect(sheet.unknownNested).toEqual({ kept: true, deeper: { value: 7 } })
    expect(sheet.class.unknownClassField).toBe('kept on the class')
    expect(sheet.class.choices.unknownChoiceField).toBe('kept on the choices')
    expect(sheet.base.unknownBaseField).toBe('kept on the base')
    expect(sheet.counters.unknownCounter).toBe(9)
    expect(sheet.effects[0].unknownRowField).toBe('kept on the effect row')
    expect(sheet.base.Speed).toBeNull()
  })
})

// What a rule set's characters store to say which rule set they belong to.
// OSE characters store no `system`; every other rule set's characters store
// its id. Lubec characters are born at version 1, and the rules refuse a Lubec
// write without it, so none is stored unversioned.
const ruleSetFields = (stored: RuleSetId): Record<string, unknown> => ({
  ose: {},
  vtm: { system: 'vtm' },
  lubec: { system: 'lubec', schemaVersion: 1 },
})[stored]

// A character document as the map reads it.
const mapSummaryOf = (stored: RuleSetId, fields: Record<string, unknown>) =>
  mapCharacterSummaryFromData('pc-1', {
    name: 'Mirelda',
    ownerUserId: 'player-1',
    ...ruleSetFields(stored),
    ...fields,
  })

describe('map summary', () => {
  it.each([
    ['ose', '#bf2f2a'],
    ['vtm', '#7a1a1f'],
    ['lubec', '#c08a2e'],
  ] as const)('%s tokens without art default to a %s pawn', (stored, color) => {
    expect(ruleSets[stored].skin.tokenColor).toBe(color)
    expect(mapSummaryOf(stored, {}).tokenIcon).toEqual({ icon: 'pawn', color, size: 34 })
  })

  it('reads each rule set\'s characters through its own summary', () => {
    for (const ruleSet of Object.values(ruleSets)) {
      const stored = { ...ruleSetFields(ruleSet.id), system: ruleSet.id, creationStatus: 'active', hpCurrent: 3 }
      expect(mapCharacterSummaryFromData('pc-1', stored)).toMatchObject(ruleSet.characters.summary(stored))
    }
  })

  it.each([
    ['ose', {}, 'active'],
    ['ose', { creationMode: 'new' }, 'active'],
    ['ose', { creationMode: 'new', creationModeExplicit: true }, 'draft'],
    ['ose', { creationStatus: 'established_draft' }, 'established_draft'],
    ['vtm', {}, 'established_draft'],
    ['vtm', { creationMode: 'new' }, 'draft'],
    ['vtm', { creationStatus: 'active' }, 'active'],
    ['lubec', {}, 'established_draft'],
    ['lubec', { creationMode: 'new' }, 'draft'],
    ['lubec', { creationStatus: 'active' }, 'active'],
  ] as const)('%s with %j is %s', (stored, fields, creationStatus) => {
    expect(mapSummaryOf(stored, fields).creationStatus).toBe(creationStatus)
  })

  it.each([
    ['ose', { hpCurrent: 3, hpMax: 8 }, true],
    // Current hit points with no maximum stay in the party.
    ['ose', { hpCurrent: 3 }, true],
    ['ose', { hpCurrent: 0, hpMax: 8 }, false],
    ['ose', { hpCurrent: -2, hpMax: 8 }, false],
    ['ose', {}, false],
    ['vtm', { vtm: { health: { Incapacitated: false } } }, true],
    ['vtm', {}, true],
    ['vtm', { vtm: { health: { Incapacitated: true } } }, false],
    // A VtM document's OSE fields never count.
    ['vtm', { hpCurrent: 0, vtm: { health: {} } }, true],
    // A Lubec character is always in play.
    ['lubec', {}, true],
    ['lubec', { hpCurrent: 0, vtm: { health: { Incapacitated: true } } }, true],
  ] as const)('%s with %j is in play: %s', (stored, fields, inPlay) => {
    const summary = mapSummaryOf(stored, { creationStatus: 'active', ...fields })
    expect(summary.inPlay).toBe(inPlay)
    expect(isPartyCharacter(summary, 'gm-1')).toBe(inPlay)
  })

  it.each([
    ['draft', false],
    ['established_draft', false],
    ['active', true],
  ] as const)('a Lubec character in %s counts towards the party: %s', (creationStatus, party) => {
    expect(isPartyCharacter(mapSummaryOf('lubec', { creationStatus }), 'gm-1')).toBe(party)
  })

  it('a Lubec character with a stored token icon reports that icon', () => {
    const tokenIcon = { icon: 'custom', color: '#c08a2e', size: 40, customImagePath: 'groups/g1/campaigns/c1/characters/pc-1/token.png' }
    expect(mapSummaryOf('lubec', { tokenIcon }).tokenIcon).toEqual(tokenIcon)
  })

  it.each(['ose', 'vtm', 'lubec'] as const)('%s keeps the GM, drafts, hidden and deleted characters out of play', (stored) => {
    const alive = { creationStatus: 'active', hpCurrent: 3, vtm: { health: {} } }
    const inPlay = (fields: Record<string, unknown>, gmUserId: string | null = 'gm-1') =>
      isPartyCharacter(mapSummaryOf(stored, { ...alive, ...fields }), gmUserId)
    expect(inPlay({})).toBe(true)
    expect(inPlay({ ownerUserId: 'gm-1' })).toBe(false)
    expect(inPlay({ ownerUserId: '' })).toBe(false)
    expect(inPlay({}, null)).toBe(false)
    expect(inPlay({ creationStatus: 'draft' })).toBe(false)
    expect(inPlay({ hidden: true })).toBe(false)
    expect(inPlay({ deletedAt: { seconds: 1 } })).toBe(false)
  })
})

describe('map rules', () => {
  // VtM's row is the captain's decision (2026-10-17), not today's behaviour:
  // VtM maps used to run OSE's wandering-monster check by accident.
  it.each([
    ['ose', true],
    ['vtm', false],
    ['lubec', false],
  ] as const)('%s rolls for wandering monsters: %s', (id: RuleSetId, wanderingMonsters) => {
    expect(ruleSets[id].mapRules).toEqual({ wanderingMonsters })
  })
})

describe('carrying', () => {
  // OSE's packed slots and spill; VtM and Lubec carry without a limit until a
  // rule set of theirs declares one.
  it.each([
    ['ose', oseCarrying],
    ['vtm', null],
    ['lubec', null],
  ] as const)('%s declares its carrying rule', (id: RuleSetId, carrying) => {
    expect(ruleSets[id].carrying).toBe(carrying)
  })
})
