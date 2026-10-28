import type { ComponentType } from 'react'
import type { RuleSetId } from './registry'
import {
  LubecItems, LubecNpcSheet, LubecSheet, OseItems, OseSheet, VtmSheet, type RuleSetItemsProps, type RuleSetNpcSheetProps, type RuleSetSheetProps,
} from './RuleSetSheets'

// The page each rule set's character tab shows. It sits beside the registry
// rather than in it, so the registry stays plain data and the shell's routing
// and selection helpers do not load every sheet. One entry per id, so a
// missing sheet is a type error.
export const ruleSetSheets: { [Id in RuleSetId]: ComponentType<RuleSetSheetProps> } = {
  ose: OseSheet,
  vtm: VtmSheet,
  lubec: LubecSheet,
}

// The sheet the GM keeps for an NPC, for each rule set whose registry entry
// declares `sheet.npcSheet`; null for the rest.
export const ruleSetNpcSheets: { [Id in RuleSetId]: ComponentType<RuleSetNpcSheetProps> | null } = {
  ose: null,
  vtm: null,
  lubec: LubecNpcSheet,
}

// The GM's Items tab for each rule set that has one: OSE's items and store,
// or Lubec's dropped and campaign items; null for the rest.
export const ruleSetItemsTabs: { [Id in RuleSetId]: ComponentType<RuleSetItemsProps> | null } = {
  ose: OseItems,
  vtm: null,
  lubec: LubecItems,
}
