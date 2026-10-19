import type { AppTab } from '../../types/app'
import { OSE_STORE_ITEMS } from '../character/storeCatalog'

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

export type RuleSetDefinition<Id extends RuleSetId = RuleSetId> = {
  id: Id
  label: string
  shortLabel: string
  tabs: RuleSetTabs
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
  },
}

const isRuleSetId = (value: string): value is RuleSetId => Object.hasOwn(ruleSets, value)

// A registered id resolves to its own rule set. Anything else, including a
// missing or empty `system`, resolves to OSE, which is what campaigns created
// before rule sets existed are.
export const resolveRuleSet = (system: string | null | undefined): RuleSetDefinition =>
  system && isRuleSetId(system) ? ruleSets[system] : ruleSets.ose
