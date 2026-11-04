import { collection, deleteDoc, doc, getDocs } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'

// The Firestore web SDK cannot enumerate a document's subcollections, so the
// campaign schema is declared here. Deleting a campaign document does NOT remove
// its subcollections automatically; this spec drives a recursive cleanup. Keep
// it in sync with firestore.rules under groups/{groupId}/campaigns/{campaignId}.
//
// A sheet's `writeReceipts` and a fight's `log` and `commands` are part of it;
// the hosted sandbox sweep reaches the same ones through `recursiveDelete`.
//
// Recorded sessions (`sessions`, `sessionCounters`, and their audio) are absent
// on purpose: no client may write or delete them. A Cloud Function,
// `clearDeletedCampaignSessions`, removes them when the campaign document goes.
//
// A collection whose rules match only named documents cannot be listed, so its
// spec names them in `ids` and they are deleted without a listing.
export type SubcollectionSpec = {
  name: string
  children?: SubcollectionSpec[]
  ids?: string[]
}

export const CAMPAIGN_SUBCOLLECTIONS: SubcollectionSpec[] = [
  { name: 'userState' },
  { name: 'characters', children: [{ name: 'hiddenCarriers' }, { name: 'writeReceipts' }] },
  {
    name: 'maps',
    children: [{ name: 'tokens' }, { name: 'annotations' }, { name: 'fogChunks' }],
  },
  { name: 'tokenAssets' },
  { name: 'monsters' },
  { name: 'npcs' },
  { name: 'npcPrivate' },
  { name: 'npcSheets', children: [{ name: 'writeReceipts' }] },
  { name: 'itemApprovals' },
  { name: 'items' },
  { name: 'gmItems' },
  { name: 'sharedCarriers' },
  { name: 'tables', children: [{ name: 'history' }] },
  { name: 'pendingTransfers' },
  { name: 'images' },
  { name: 'referenceDocs' },
  { name: 'sessionSummaries' },
  { name: 'sharedNotes' },
  { name: 'combatControl', ids: ['current'] },
  { name: 'combats', children: [{ name: 'log' }, { name: 'commands' }] },
]

async function subcollectionIds(db: Firestore, baseSegments: string[], spec: SubcollectionSpec) {
  if (spec.ids) return spec.ids
  const snap = await getDocs(collection(db, [...baseSegments, spec.name].join('/')))
  return snap.docs.map((docSnap) => docSnap.id)
}

// Documents without subcollections are deleted together; one with them is
// cleared one at a time, as its subcollections must be listed first.
async function deleteDocs(db: Firestore, docsSegments: string[][], children: SubcollectionSpec[]) {
  if (!children.length) {
    await Promise.all(docsSegments.map((segments) => deleteDoc(doc(db, segments.join('/')))))
    return
  }
  for (const segments of docsSegments) await deleteDocTree(db, segments, children)
}

async function deleteSubtree(db: Firestore, baseSegments: string[], specs: SubcollectionSpec[]) {
  for (const spec of specs) {
    const ids = await subcollectionIds(db, baseSegments, spec)
    await deleteDocs(db, ids.map((id) => [...baseSegments, spec.name, id]), spec.children ?? [])
  }
}

// Clears a doc's own subcollections before the doc itself, so nothing is left
// orphaned if the doc disappears first. Then clears them once more: a
// save or combat command that landed in between wrote under a doc that is now
// gone, and a sheet or fight that is gone takes no further writes.
async function deleteDocTree(db: Firestore, segments: string[], children: SubcollectionSpec[]) {
  await deleteSubtree(db, segments, children)
  await deleteDoc(doc(db, segments.join('/')))
  await deleteSubtree(db, segments, children)
}

// Recursively deletes every known subcollection under a campaign and then the
// campaign document itself.
export async function deleteCampaignDeep(db: Firestore, groupId: string, campaignId: string) {
  const base = ['groups', groupId, 'campaigns', campaignId]
  await deleteSubtree(db, base, CAMPAIGN_SUBCOLLECTIONS)
  await deleteDoc(doc(db, base.join('/')))
}
