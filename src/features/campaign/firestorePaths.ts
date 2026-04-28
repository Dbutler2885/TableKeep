import { collection, doc } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'

export type CampaignScope = {
  campaignId: string
  groupId?: string | null
}

function campaignBaseSegments(scope: CampaignScope): string[] {
  return scope.groupId
    ? ['groups', scope.groupId, 'campaigns', scope.campaignId]
    : ['campaigns', scope.campaignId]
}

export function campaignCollectionRef(db: Firestore, scope: CampaignScope, ...segments: string[]) {
  return collection(db, [...campaignBaseSegments(scope), ...segments].join('/'))
}

export function campaignDocRef(db: Firestore, scope: CampaignScope, ...segments: string[]) {
  return doc(db, [...campaignBaseSegments(scope), ...segments].join('/'))
}
