import type { LubecItem } from './gearRecord'
import { lubecCopyOf } from './stock'

/** One logical command retains this identity through transaction retries. */
export type LubecItemCommand = { commandId: string; role?: string; ordinal?: number }

export function lubecCommandItemId(command: LubecItemCommand, role: string): string {
  const ordinal = command.ordinal ?? 0
  if (!validCommand(command.commandId, ordinal)) throw new Error('Invalid item command identity.')
  return ['item', command.commandId, command.role ?? role, String(ordinal)].map(encodeURIComponent).join(':')
}

const validCommand = (commandId: string, ordinal: number) => commandId.length > 0 && Number.isSafeInteger(ordinal) && ordinal >= 0

export function assertLubecQuantity(qty: number, available: number): void {
  if (!Number.isSafeInteger(qty) || qty <= 0 || qty > available) throw new Error('That item quantity is no longer available.')
}

/** A whole stack keeps its id; a split keeps the original id only on its remainder. */
export function lubecSplitItem(item: LubecItem, qty: number, command: LubecItemCommand) {
  assertLubecQuantity(qty, item.qty)
  if (qty === item.qty) return { detached: item, remainder: null }
  const id = lubecCommandItemId(command, `split:${item.id}`)
  if (id === item.id) throw new Error('A detached item needs a distinct id.')
  return { detached: { ...item, id, qty }, remainder: { ...item, qty: item.qty - qty } }
}

/** Library copies introduce a new lineage, even when copying an entire stack. */
export function lubecLibraryCopy(item: LubecItem, qty: number, command: LubecItemCommand): LubecItem {
  assertLubecQuantity(qty, item.qty)
  const id = lubecCommandItemId(command, `copy:${item.id}`)
  if (id === item.id) throw new Error('A library copy needs a distinct id.')
  return { ...lubecCopyOf(item), id, qty } as LubecItem
}

/** Identity, never name or design, is the ownership key. */
export function assertLubecItemOwnership(items: readonly Pick<LubecItem, 'id'>[]): void {
  const ids = items.map((item) => item.id)
  if (new Set(ids).size !== ids.length) throw new Error('An item already has an owner.')
}
