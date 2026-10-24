import type { AppTab, ItemApprovalAction } from '../../types/app'
import { OSE_STORE_ITEMS } from '../character/storeCatalog'
import { oseMonsterRuleset, type MonsterRulesetDef } from '../monsters/rulesets'
import { oseCharacterParser } from '../character/lib/storedCharacterRecord'
import { vtmCharacterParser } from '../character/vtmCharacterRecord'
import type { CarryingRule } from './carrying'
import type { CharacterSummaryReader } from './characterIdentity'
import {
  lubecCharacterVersioning,
  oseCharacterVersioning,
  vtmCharacterVersioning,
  type CharacterVersioning,
} from './characterMigrations'
import type { CharacterParser } from './characterParser'
import { lubecCharacterParser } from './lubec/characterParser'
import { lubecCharacterSummary } from './lubec/characterSummary'
import { oseCarrying } from './ose/carrying'
import { oseCharacterSummary } from './ose/characterSummary'
import { vtmCharacterSummary } from './vtm/characterSummary'

// Every rule set the app knows. A campaign stores its rule set's id in its
// `system` field.
export type RuleSetId = 'ose' | 'vtm' | 'lubec'

export type RuleSetTabs = {
  // Every tab the rule set has, in display order. A campaign can route only
  // to these.
  order: readonly AppTab[]
  // Tabs its players never see in the side nav.
  hiddenFromPlayers: readonly AppTab[]
  // Labels that replace a tab's usual one in this rule set.
  labels?: Partial<Record<AppTab, string>>
}

// A stock item a rule set offers. The registry knows only its id and name;
// every other field belongs to the rule set.
export type RuleSetCatalogItem = { id: string; name: string }

// The character tab's page itself is in `sheetComponents.ts`.
export type RuleSetSheet = {
  // Whether Maps may show that page beside the map.
  embeddable: boolean
}

// The shell's `data-theme` inside an open campaign.
export type ShellTheme = 'default' | 'vtm' | 'lubec'

export type RuleSetSkin = {
  theme: ShellTheme
  // The pawn colour of a character token without art of its own.
  tokenColor: string
}

export type RuleSetCharacters = CharacterVersioning & {
  // What the map shows of a character: its creation status and whether it is
  // in play.
  summary: CharacterSummaryReader
  // How a stored character at the current version is read into the rule
  // set's record, and how a save writes that record back.
  parser: CharacterParser<unknown>
}

export type RuleSetMapRules = {
  // Whether moving the party on a calibrated map rolls for wandering monsters.
  wanderingMonsters: boolean
}

// The shell's fixed places that a rule set switches on.
export type RuleSetShell = {
  // The strip across the top of the content area, for one line of live
  // campaign information.
  campaignStrip: boolean
}

export type RuleSetDefinition<Id extends RuleSetId = RuleSetId> = {
  id: Id
  // Its full name, in the new-campaign picker.
  label: string
  // Its name on a campaign card.
  shortLabel: string
  // Whether a GM can pick it for a new campaign.
  selectable: boolean
  tabs: RuleSetTabs
  sheet: RuleSetSheet
  skin: RuleSetSkin
  // The statline its Monsters tab works in, or null for a rule set without a
  // Monsters tab.
  monsters: MonsterRulesetDef | null
  // The player requests its GM approves or rejects, or none for a rule set
  // without approvals.
  approvals: readonly ItemApprovalAction[]
  // Whether a character can hand an item to another, which the receiver
  // accepts or declines.
  transfers: boolean
  // What a character can carry, and what happens to an add, grant or transfer
  // that does not fit, or null for a rule set without a carrying limit.
  carrying: CarryingRule | null
  shell: RuleSetShell
  // The version its characters are written at, the steps that bring an older
  // stored character up to it, how one is read and written, and what the map
  // shows of one.
  characters: RuleSetCharacters
  mapRules: RuleSetMapRules
  // The stock items the rule set offers, if it has any.
  catalog?: readonly RuleSetCatalogItem[]
}

// One entry per id, each filed under its own id, so a missing entry or a
// missing declaration is a type error.
export type RuleSetRegistry = { [Id in RuleSetId]: RuleSetDefinition<Id> }

// OSE's entry keeps its own type, so OSE code reading its catalog sees the
// store's full items rather than only their ids and names.
export const oseRuleSet = {
  id: 'ose',
  label: 'Old-School Essentials',
  shortLabel: 'OSE',
  selectable: true,
  tabs: {
    order: ['character', 'maps', 'monsters', 'items', 'npcs', 'tables', 'notes', 'calendar', 'rules'],
    hiddenFromPlayers: ['items', 'monsters', 'tables'],
    labels: { rules: 'OSE SRD' },
  },
  sheet: { embeddable: true },
  skin: { theme: 'default', tokenColor: '#bf2f2a' },
  monsters: oseMonsterRuleset,
  approvals: ['create', 'sell', 'learn_spell', 'ability_reroll'],
  transfers: true,
  carrying: oseCarrying,
  shell: { campaignStrip: false },
  characters: { ...oseCharacterVersioning, summary: oseCharacterSummary, parser: oseCharacterParser },
  mapRules: { wanderingMonsters: true },
  // The store's list.
  catalog: OSE_STORE_ITEMS,
} satisfies RuleSetDefinition<'ose'>

export const ruleSets: RuleSetRegistry = {
  ose: oseRuleSet,
  // A lighter, mostly presentational rule set: fillable sheets, NPCs, the
  // monster reference and maps, with no items or store, no treasure tables
  // and no rules link.
  vtm: {
    id: 'vtm',
    label: 'Vampire: the Masquerade',
    shortLabel: 'VTM',
    selectable: true,
    tabs: {
      order: ['character', 'maps', 'monsters', 'npcs', 'notes', 'calendar'],
      hiddenFromPlayers: [],
    },
    sheet: { embeddable: false },
    skin: { theme: 'vtm', tokenColor: '#7a1a1f' },
    monsters: oseMonsterRuleset,
    approvals: [],
    transfers: false,
    carrying: null,
    shell: { campaignStrip: false },
    characters: { ...vtmCharacterVersioning, summary: vtmCharacterSummary, parser: vtmCharacterParser },
    // The OSE wandering-monster check never belonged in VtM.
    mapRules: { wanderingMonsters: false },
  },
  // Lubec 1977, still hidden: no GM can pick it yet, and its character tab is
  // a placeholder until Spec B builds the sheet. It has the table tools VtM
  // has, without monsters.
  lubec: {
    id: 'lubec',
    label: 'Lubec 1977',
    shortLabel: 'LUBEC',
    selectable: false,
    tabs: {
      order: ['character', 'maps', 'npcs', 'notes', 'calendar'],
      hiddenFromPlayers: [],
    },
    sheet: { embeddable: false },
    skin: { theme: 'lubec', tokenColor: '#c08a2e' },
    monsters: null,
    approvals: [],
    transfers: false,
    carrying: null,
    shell: { campaignStrip: false },
    characters: { ...lubecCharacterVersioning, summary: lubecCharacterSummary, parser: lubecCharacterParser },
    mapRules: { wanderingMonsters: false },
  },
}

const isRuleSetId = (value: string): value is RuleSetId => Object.hasOwn(ruleSets, value)

// A registered id resolves to its own rule set. Anything else, including a
// missing or empty `system`, resolves to OSE, which is what campaigns created
// before rule sets existed are.
export const resolveRuleSet = (system: string | null | undefined): RuleSetDefinition =>
  system && isRuleSetId(system) ? ruleSets[system] : ruleSets.ose

// The rule sets a GM can pick for a new campaign, in registry order.
export const selectableRuleSets = (): RuleSetDefinition[] =>
  Object.values(ruleSets).filter((ruleSet) => ruleSet.selectable)
