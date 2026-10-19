import type { AppTab, ItemApprovalAction } from '../../types/app'
import { OSE_STORE_ITEMS } from '../character/storeCatalog'
import { oseMonsterRuleset, type MonsterRulesetDef } from '../monsters/rulesets'
import { oseCharacterVersioning, vtmCharacterVersioning, type CharacterVersioning } from './characterMigrations'

// Every rule set the app knows. A campaign stores its rule set's id in its
// `system` field.
export type RuleSetId = 'ose' | 'vtm'

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
export type ShellTheme = 'default' | 'vtm'

export type RuleSetSkin = {
  theme: ShellTheme
}

// The shell's fixed places that a rule set switches on.
export type RuleSetShell = {
  // The strip across the top of the content area, for one line of live
  // campaign information.
  campaignStrip: boolean
}

export type RuleSetDefinition<Id extends RuleSetId = RuleSetId> = {
  id: Id
  label: string
  shortLabel: string
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
  shell: RuleSetShell
  // The version its characters are written at, and the steps that bring an
  // older stored character up to it.
  characters: CharacterVersioning
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
  tabs: {
    order: ['character', 'maps', 'monsters', 'items', 'npcs', 'tables', 'notes', 'calendar', 'rules'],
    hiddenFromPlayers: ['items', 'monsters', 'tables'],
    labels: { rules: 'OSE SRD' },
  },
  sheet: { embeddable: true },
  skin: { theme: 'default' },
  monsters: oseMonsterRuleset,
  approvals: ['create', 'sell', 'learn_spell', 'ability_reroll'],
  transfers: true,
  shell: { campaignStrip: false },
  characters: oseCharacterVersioning,
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
    tabs: {
      order: ['character', 'maps', 'monsters', 'npcs', 'notes', 'calendar'],
      hiddenFromPlayers: [],
    },
    sheet: { embeddable: false },
    skin: { theme: 'vtm' },
    monsters: oseMonsterRuleset,
    approvals: [],
    transfers: false,
    shell: { campaignStrip: false },
    characters: vtmCharacterVersioning,
  },
}

const isRuleSetId = (value: string): value is RuleSetId => Object.hasOwn(ruleSets, value)

// A registered id resolves to its own rule set. Anything else, including a
// missing or empty `system`, resolves to OSE, which is what campaigns created
// before rule sets existed are.
export const resolveRuleSet = (system: string | null | undefined): RuleSetDefinition =>
  system && isRuleSetId(system) ? ruleSets[system] : ruleSets.ose
