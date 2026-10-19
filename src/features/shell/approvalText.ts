import type { CharacterInventoryItem, ItemApprovalAction } from '../../types/app'

export function approvalTitle(action: ItemApprovalAction): string {
  if (action === 'sell') return 'Sell Approval Request'
  if (action === 'learn_spell') return 'Spell Transcription Request'
  if (action === 'ability_reroll') return 'Ability Re-roll Request'
  return 'Item Approval Request'
}

export const itemDisplayName = (item: CharacterInventoryItem) =>
  item.name ? `${item.typeName} "${item.name}"` : item.typeName

// Item stat fields are strings from a form, so "0" and "" both mean unset.
export const numericSuffix = (value: string, text: string) => (Number(value) ? text : '')

export const flagSuffix = (flag: boolean, text: string) => (flag ? text : '')
