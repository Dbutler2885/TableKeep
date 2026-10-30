import { resolveCharacterRuleSet } from './characterSchemaVersions.js';
import { acceptLubecTransfer } from './lubecGearTransfer.js';
import { acceptOseTransfer } from './oseCarrying.js';
// The transfer callable's copy of the registry's `transfers`, which this
// package cannot import: the rule a transferred item is accepted under, or
// null for a rule set without transfers.
// `src/features/ruleSets/ruleSetCarrying.function.test.ts` pins it to the registry.
export const transferCarryingByRuleSet = {
    ose: acceptOseTransfer,
    vtm: null,
    lubec: acceptLubecTransfer,
};
export const NO_CARRYING_MESSAGE = 'Items cannot be handed to another character in this campaign.';
/** Why an offer that no longer matches the sender's item is dropped. */
export function droppedOffer(reason) {
    return reason === 'qty_changed'
        ? { code: 'failed-precondition', message: 'Item quantity changed before transfer could be accepted.' }
        : { code: 'not-found', message: 'Item no longer available.' };
}
/** The carrying rule a campaign's transfers are accepted under, from its stored `system`. */
export function resolveTransferCarrying(system) {
    return transferCarryingByRuleSet[resolveCharacterRuleSet(system)];
}
