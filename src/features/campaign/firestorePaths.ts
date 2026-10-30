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

// The GM-only Lubec character sheet of one NPC, beside the NPC's own
// documents and keyed by the same id.
export function npcSheetRef(db: Firestore, scope: CampaignScope, npcId: string) {
  return campaignDocRef(db, scope, 'npcSheets', npcId)
}

// The GM's Items tab for a Lubec campaign: library items and dropped items,
// one document per item under the item's own id.
export function campaignGmItemsRef(db: Firestore, scope: CampaignScope) {
  return campaignCollectionRef(db, scope, 'gmItems')
}

export function campaignGmItemRef(db: Firestore, scope: CampaignScope, itemId: string) {
  return campaignDocRef(db, scope, 'gmItems', itemId)
}

// The Lubec carriers any member of the group may put things into.
export function campaignSharedCarriersRef(db: Firestore, scope: CampaignScope) {
  return campaignCollectionRef(db, scope, 'sharedCarriers')
}

export function campaignSharedCarrierRef(db: Firestore, scope: CampaignScope, carrierId: string) {
  return campaignDocRef(db, scope, 'sharedCarriers', carrierId)
}

// A Lubec carrier only its character's owner and the GM may see, kept under the character so it follows its id.
export function characterHiddenCarrierRef(db: Firestore, scope: CampaignScope, characterId: string, carrierId: string) {
  return campaignDocRef(db, scope, 'characters', characterId, 'hiddenCarriers', carrierId)
}
