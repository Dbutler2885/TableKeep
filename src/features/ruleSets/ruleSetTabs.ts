import { tabs } from '../navigation/tabs'
import type { AppTab } from '../../types/app'
import { ruleSets } from './registry'
import type { RuleSetId } from './registry'

export type RuleSetTab = { id: AppTab; label: string }

// A tab's label in a rule set: the rule set's own override, or the tab's usual
// label.
export const ruleSetTabLabel = (ruleSetId: RuleSetId, tab: AppTab): string =>
  ruleSets[ruleSetId].tabs.labels?.[tab] ?? tabs.find((item) => item.id === tab)?.label ?? tab

// Every tab the rule set has, in display order, labelled.
export const ruleSetTabs = (ruleSetId: RuleSetId): RuleSetTab[] =>
  ruleSets[ruleSetId].tabs.order.map((id) => ({ id, label: ruleSetTabLabel(ruleSetId, id) }))
