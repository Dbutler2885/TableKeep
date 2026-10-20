import type { CampaignItem, CharacterInventoryItem } from '../../types/app'

// How an item comes into a character's packs: added on the sheet or by an
// approved request, granted by the GM, or accepted from another character.
export type CarryingOperation = 'add' | 'grant' | 'transfer'

// The character whose packs change: what dropped items name, and the stored
// details the rule reads its capacity from.
export type CarryingCharacter = { id: string; name: string; details?: unknown }

// What spills when the packs overflow. The items that must leave are already
// Dropped Items; the dropped gold is only an amount, because which campaign
// document holds it is the caller's to decide. Regrouping gold can make
// everything fit, which keeps every item and leaves no message.
export type CarryingSpill = {
  keptInventory: CharacterInventoryItem[]
  droppedItems: CampaignItem[]
  droppedGoldAmount: number
  feedbackMessage: string | null
}

export type CarryingDecision =
  | { outcome: 'fits' }
  | { outcome: 'refused'; reason: string; message: string }
  | ({ outcome: 'overflow' } & CarryingSpill)

// A rule set's carrying rule. Both parts are pure: id allocation and campaign
// document writes stay with the callers.
export type CarryingRule = {
  // How many packed slots a character has, from its stored details.
  packedSlots(details: unknown): number
  // Whether `inventory`, the packs once the incoming items are in, can be kept.
  decide(character: CarryingCharacter, operation: CarryingOperation, inventory: CharacterInventoryItem[]): CarryingDecision
}

/** What a caller stores after a decision: the whole inventory when it fits, the kept part when it spills. A refusal throws its message. */
export function carriedAfter(decision: CarryingDecision, inventory: CharacterInventoryItem[]): CarryingSpill {
  if (decision.outcome === 'refused') throw new Error(decision.message)
  if (decision.outcome === 'fits') {
    return { keptInventory: inventory, droppedItems: [], droppedGoldAmount: 0, feedbackMessage: null }
  }
  const { outcome: _outcome, ...spill } = decision
  return spill
}
