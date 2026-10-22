import { resolveCharacterRuleSet } from './characterSchemaVersions.js';
import { applyAcceptedTransfer, availablePackedSlots } from './oseCarrying.js';
export const transferCarryingByRuleSet = {
    ose: { packedSlots: availablePackedSlots, acceptTransfer: applyAcceptedTransfer },
    vtm: null,
    lubec: null,
};
export const NO_CARRYING_MESSAGE = 'Items cannot be handed to another character in this campaign.';
/** The carrying rule a campaign's transfers are accepted under, from its stored `system`. */
export function resolveTransferCarrying(system) {
    return transferCarryingByRuleSet[resolveCharacterRuleSet(system)];
}
