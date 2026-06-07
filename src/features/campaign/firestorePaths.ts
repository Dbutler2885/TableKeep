import { collection, doc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'

export type CampaignScope = {
  campaignId: string
  groupId: string
}

function campaignBaseSegments(scope: CampaignScope): string[] {
  return ['groups', scope.groupId, 'campaigns', scope.campaignId]
}

export function campaignCollectionRef(db: Firestore, scope: CampaignScope, ...segments: string[]) {
  return collection(db, [...campaignBaseSegments(scope), ...segments].join('/'))
}

export function campaignDocRef(db: Firestore, scope: CampaignScope, ...segments: string[]) {
  return doc(db, [...campaignBaseSegments(scope), ...segments].join('/'))
}

// Per-user campaign UI state (currentCharacterId, lastSeenCliffhangerNoteId).
// Replaces the old campaign-level `members` collection.
export function campaignUserStateRef(db: Firestore, scope: CampaignScope, userId: string) {
  return campaignDocRef(db, scope, 'userState', userId)
}
