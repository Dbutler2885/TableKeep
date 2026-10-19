import { createContext, useContext } from 'react'
import type { RuleSetDefinition } from '../ruleSets/registry'

// The rule set of the campaign whose maps are open. The Maps panel provides it
// around MapsTab, so map hooks and components read it here instead of having
// it threaded through MapsTab's props.
export const MapRuleSetContext = createContext<RuleSetDefinition | null>(null)

export function useMapRuleSet(): RuleSetDefinition {
  const ruleSet = useContext(MapRuleSetContext)
  if (!ruleSet) throw new Error('useMapRuleSet must be used inside the Maps panel')
  return ruleSet
}
