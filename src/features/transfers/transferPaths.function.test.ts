import { describe, expect, it } from 'vitest'
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { campaignPath, groupMemberPath } from '../../../functions/src/firestorePaths'
import { campaignCollectionRef, campaignDocRef } from '../campaign/firestorePaths'

// A bare client app is enough to build references; nothing here talks to a
// backend. It only exists so the client path helpers can be exercised against
// the same inputs the Cloud Function receives.
const app = initializeApp({ projectId: 'transfer-path-tests' }, 'transfer-path-tests')
const db = getFirestore(app)

const groupId = 'group-1'
const campaignId = 'campaign-1'
const scope = { campaignId, groupId }

describe('acceptPendingTransfer path resolution', () => {
  it('resolves a pending transfer where the client wrote it', () => {
    expect(campaignPath(groupId, campaignId, 'pendingTransfers', 'transfer-1'))
      .toBe(campaignDocRef(db, scope, 'pendingTransfers', 'transfer-1').path)
  })

  it('resolves the pending transfers collection the client listens to', () => {
    expect(campaignPath(groupId, campaignId, 'pendingTransfers'))
      .toBe(campaignCollectionRef(db, scope, 'pendingTransfers').path)
  })

  it('resolves both character documents the transfer moves items between', () => {
    expect(campaignPath(groupId, campaignId, 'characters', 'sender-character'))
      .toBe(campaignDocRef(db, scope, 'characters', 'sender-character').path)
    expect(campaignPath(groupId, campaignId, 'characters', 'receiver-character'))
      .toBe(campaignDocRef(db, scope, 'characters', 'receiver-character').path)
  })

  it('never resolves to the pre-reorganisation flat campaign tree', () => {
    expect(campaignPath(groupId, campaignId, 'pendingTransfers', 'transfer-1'))
      .not.toBe(`campaigns/${campaignId}/pendingTransfers/transfer-1`)
    expect(campaignPath(groupId, campaignId)).toBe(`groups/${groupId}/campaigns/${campaignId}`)
  })

  it('resolves membership on the group, which is where the app records it', () => {
    // The campaign-level `members` collection is gone from the nested model;
    // `campaigns/{campaignId}/userState/{uid}` replaced it and holds UI scratch
    // only, so the function has to read group membership instead.
    expect(groupMemberPath(groupId, 'player-uid')).toBe(`groups/${groupId}/members/player-uid`)
  })
})
