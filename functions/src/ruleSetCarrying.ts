import { resolveCharacterRuleSet, type CharacterRuleSet } from './characterSchemaVersions.js'
import { acceptLubecTransfer } from './lubecGearTransfer.js'
import { acceptOseTransfer } from './oseCarrying.js'

/** A pending transfer as a carrying rule reads it: which of the sender's items moves, and the offered copy. */
export type TransferOffer = { itemId: string; itemSnapshot: unknown }

/**
 * The fields to merge into each stored character, before the version stamp, or
 * why the offer cannot be accepted. A missing, changed or reduced item drops
 * the offer; a receiver with no room keeps it, and is told why.
 */
export type TransferOutcome =
  | { ok: true; sender: Record<string, unknown>; receiver: Record<string, unknown> }
  | { ok: false; reason: 'missing_item' | 'kind_mismatch' | 'qty_changed' }
  | { ok: false; reason: 'no_room'; message: string }

/** How a rule set moves an accepted item between two stored characters. */
export type TransferCarrying = (sender: unknown, receiver: unknown, offer: TransferOffer) => TransferOutcome

// The transfer callable's copy of the registry's `transfers`, which this
// package cannot import: the rule a transferred item is accepted under, or
// null for a rule set without transfers.
// `src/features/ruleSets/ruleSetCarrying.function.test.ts` pins it to the registry.
export const transferCarryingByRuleSet: Record<CharacterRuleSet, TransferCarrying | null> = {
  ose: acceptOseTransfer,
  vtm: null,
  lubec: acceptLubecTransfer,
}

export const NO_CARRYING_MESSAGE = 'Items cannot be handed to another character in this campaign.'

/** What the callable throws once its transaction has settled. */
export type TransferRejection = {
  code: 'not-found' | 'failed-precondition' | 'permission-denied'
  message: string
}

/** Why an offer that no longer matches the sender's item is dropped. */
export function droppedOffer(reason: Exclude<Extract<TransferOutcome, { ok: false }>['reason'], 'no_room'>): TransferRejection {
  return reason === 'qty_changed'
    ? { code: 'failed-precondition', message: 'Item quantity changed before transfer could be accepted.' }
    : { code: 'not-found', message: 'Item no longer available.' }
}

/** The carrying rule a campaign's transfers are accepted under, from its stored `system`. */
export function resolveTransferCarrying(system: unknown): TransferCarrying | null {
  return transferCarryingByRuleSet[resolveCharacterRuleSet(system)]
}
