import { serverTimestamp, setDoc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import type { CampaignItem } from '../../types/app'
import { campaignDocRef } from '../campaign/firestorePaths'
import { toFirestoreItem } from '../items/useItems'
import { makeDroppedGoldCampaignItem } from './inventoryOverflow'

// Kept apart from the pure spill in `inventoryOverflow.ts`, because
// `toFirestoreItem` comes from a module that builds the Firebase singleton and
// the rule-set registry reaches that spill through OSE's carrying rule.
export async function writeDroppedOverflow(
  db: Firestore,
  campaignId: string,
  groupId: string,
  droppedItems: CampaignItem[],
  droppedGoldAmount: number,
  characterId: string,
  characterName: string,
): Promise<void> {
  const writes: Promise<void>[] = []
  for (const item of droppedItems) {
    const { id, ...rest } = item
    writes.push(
      setDoc(
        campaignDocRef(db, { campaignId, groupId }, 'items', id),
        { ...toFirestoreItem({ ...rest, id } as typeof item), createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      ),
    )
  }
  if (droppedGoldAmount > 0) {
    const goldDoc = makeDroppedGoldCampaignItem(droppedGoldAmount, characterId, characterName)
    const { id, ...rest } = goldDoc
    writes.push(
      setDoc(
        campaignDocRef(db, { campaignId, groupId }, 'items', id),
        { ...toFirestoreItem({ ...rest, id } as typeof goldDoc), createdAt: serverTimestamp(), updatedAt: serverTimestamp() },
      ),
    )
  }
  await Promise.all(writes)
}
