import type { PendingTransfer, TransferableInventoryItem } from '../../types/app'
const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const itemName = (item: TransferableInventoryItem) => item.name ?? item.typeName

export function parseTransfer(id: string, data: Record<string, unknown>): PendingTransfer | null {
  if (!data.itemSnapshot || typeof data.itemSnapshot !== 'object') return null
  const item = data.itemSnapshot as TransferableInventoryItem
  return {
    id, itemSnapshot: item, itemId: text(data.itemId, item.id), itemKind: item.kind, itemName: text(data.itemName, itemName(item)),
    fromCharacterId: text(data.fromCharacterId), fromCharacterName: text(data.fromCharacterName), fromUserId: text(data.fromUserId),
    toCharacterId: text(data.toCharacterId), toCharacterName: text(data.toCharacterName), toUserId: text(data.toUserId), createdAt: data.createdAt,
  }
}

const createdMs = (entry: PendingTransfer) => {
  const seconds = (entry.createdAt as { seconds?: unknown } | null)?.seconds
  return typeof seconds === 'number' ? seconds * 1000 : 0
}

export function readPendingTransfers(docs: { id: string; data: () => unknown }[]) {
  return docs.map((doc) => parseTransfer(doc.id, doc.data() as Record<string, unknown>))
    .filter((entry): entry is PendingTransfer => entry !== null)
    .sort((a, b) => createdMs(a) - createdMs(b))
}
