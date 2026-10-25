// An item in the GM's Items tab, stored as its own document under
// `gmItems/{itemId}` (spec 4.5). A library item is the GM's own, offered to
// every member in the picker. A dropped item came off a player's sheet (Rule
// M8) and only the GM sees it. Its place fields are cleared when it is
// written, and its `id` is its document id.

import { parseLubecItem, type LubecItem } from './gearRecord'

export type LubecGmItemStatus = 'library' | 'dropped'

export type LubecGmItem = LubecItem & {
  /** 'library': the GM's own list, offered in every picker. 'dropped': a player dropped it; only the GM sees it. */
  status: LubecGmItemStatus
  droppedByCharacterId?: string
  droppedByCharacterName?: string
  droppedByUserId?: string
  /** Where it was dropped from, in words: "backpack", "hands", "Stephen's skiff". */
  droppedFrom?: string
}

/** The fields a GM item has that an item on a sheet does not. */
export const LUBEC_GM_ITEM_FIELDS = [
  'status',
  'droppedByCharacterId',
  'droppedByCharacterName',
  'droppedByUserId',
  'droppedFrom',
] as const

const DROP_FIELDS: readonly string[] = LUBEC_GM_ITEM_FIELDS.slice(1)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// A drop field that is not text reads as missing.
const readableDropFields = (stored: Record<string, unknown>) =>
  Object.fromEntries(DROP_FIELDS.flatMap((key) => (typeof stored[key] === 'string' ? [[key, stored[key]]] : [])))

/**
 * A stored GM item as the GM Items tab reads it, by the item parser. An
 * unreadable status reads as dropped, which only the GM sees.
 */
export function parseLubecGmItem(raw: unknown, docId: string): LubecGmItem {
  const stored = isRecord(raw) ? raw : {}
  const item = Object.fromEntries(Object.entries(parseLubecItem(stored, docId)).filter(([key]) => !DROP_FIELDS.includes(key)))
  return {
    ...item as LubecItem,
    ...readableDropFields(stored),
    id: docId,
    status: stored.status === 'library' ? 'library' : 'dropped',
  }
}
