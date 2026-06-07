import type { ItemKind, StackPolicy } from '../../types/app'

export const DEFAULT_STACK_POLICY: Record<ItemKind, StackPolicy> = {
  weapon: { stackable: false },
  armour: { stackable: false },
  ammunition: { stackable: true, maxStack: 40 },
  consumable: { stackable: true, maxStack: 20 },
  general: { stackable: false },
  gold: { stackable: true, maxStack: 100 },
  treasure: { stackable: false },
}
