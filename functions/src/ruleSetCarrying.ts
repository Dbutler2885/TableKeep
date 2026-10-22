import { resolveCharacterRuleSet, type CharacterRuleSet } from './characterSchemaVersions.js'
import { applyAcceptedTransfer, availablePackedSlots } from './oseCarrying.js'

// The transfer callable's copy of the registry's `carrying`, which this package
// cannot import: the rule a transferred item is accepted under, or null for a
// rule set without one. `src/features/ruleSets/ruleSetCarrying.function.test.ts`
// pins it to the registry.
export type TransferCarrying = {
  packedSlots: typeof availablePackedSlots
  acceptTransfer: typeof applyAcceptedTransfer
}

export const transferCarryingByRuleSet: Record<CharacterRuleSet, TransferCarrying | null> = {
  ose: { packedSlots: availablePackedSlots, acceptTransfer: applyAcceptedTransfer },
  vtm: null,
  lubec: null,
}

export const NO_CARRYING_MESSAGE = 'Items cannot be handed to another character in this campaign.'

/** The carrying rule a campaign's transfers are accepted under, from its stored `system`. */
export function resolveTransferCarrying(system: unknown): TransferCarrying | null {
  return transferCarryingByRuleSet[resolveCharacterRuleSet(system)]
}
