import type { ComponentType } from 'react'
import type { RuleSetId } from './registry'
import { LubecSheet, OseSheet, VtmSheet, type RuleSetSheetProps } from './RuleSetSheets'

// The page each rule set's character tab shows. It sits beside the registry
// rather than in it, so the registry stays plain data and the shell's routing
// and selection helpers do not load every sheet. One entry per id, so a
// missing sheet is a type error.
export const ruleSetSheets: { [Id in RuleSetId]: ComponentType<RuleSetSheetProps> } = {
  ose: OseSheet,
  vtm: VtmSheet,
  lubec: LubecSheet,
}
