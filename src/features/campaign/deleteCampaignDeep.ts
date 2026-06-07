import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'

// The Firestore web SDK cannot enumerate a document's subcollections, so the
// campaign schema is declared here. Deleting a campaign document does NOT remove
// its subcollections automatically; this spec drives a recursive cleanup. Keep
// it in sync with firestore.rules under groups/{groupId}/campaigns/{campaignId}.
export type SubcollectionSpec = {
  name: string
  children?: SubcollectionSpec[]
}

export const CAMPAIGN_SUBCOLLECTIONS: SubcollectionSpec[] = [
  { name: 'userState' },
  { name: 'characters' },
  {
    name: 'maps',
    children: [{ name: 'tokens' }, { name: 'annotations' }, { name: 'fogChunks' }],
  },
  { name: 'tokenAssets' },
  { name: 'monsters' },
  { name: 'npcs' },
  { name: 'npcPrivate' },
  { name: 'itemApprovals' },
  { name: 'items' },
  { name: 'tables', children: [{ name: 'history' }] },
  { name: 'pendingTransfers' },
  { name: 'images' },
  { name: 'referenceDocs' },
  { name: 'sessionSummaries' },
  { name: 'sharedNotes' },
]

async function deleteSubtree(db: Firestore, baseSegments: string[], specs: SubcollectionSpec[]) {
  for (const spec of specs) {
    const snap = await getDocs(collection(db, [...baseSegments, spec.name].join('/')))
    // Clear each doc's own subcollections before the doc itself, so nothing is
    // left orphaned if the parent doc disappears first.
    if (spec.children?.length) {
      for (const docSnap of snap.docs) {
        await deleteSubtree(db, [...baseSegments, spec.name, docSnap.id], spec.children)
      }
    }
    await Promise.all(snap.docs.map((docSnap) => deleteDoc(docSnap.ref)))
  }
}

// Recursively deletes every known subcollection under a campaign and then the
// campaign document itself.
export async function deleteCampaignDeep(db: Firestore, groupId: string, campaignId: string) {
  const base = ['groups', groupId, 'campaigns', campaignId]
  await deleteSubtree(db, base, CAMPAIGN_SUBCOLLECTIONS)
  await deleteDoc(doc(db, base.join('/')))
}
