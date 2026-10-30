import { useEffect, useState } from 'react'
import { onSnapshot, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore'
import { characterHiddenCarriersRef } from '../../campaign/firestorePaths'
import { parseLubecCarrierRecord } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecHiddenCarrier } from '../../ruleSets/lubec/gear/hiddenCarrier'
import type { LubecGearHidden } from './lubecHiddenCarrierWrites'

type Listened = { key: string; carriers: LubecHiddenCarrier[] }

const NONE: readonly LubecHiddenCarrier[] = []

const readCarrier = (snap: QueryDocumentSnapshot<DocumentData>) => parseLubecCarrierRecord(snap.data({ serverTimestamps: 'estimate' }), snap.id)

const carriersOf = (docs: QueryDocumentSnapshot<DocumentData>[]) => docs.map(readCarrier).sort((a, b) => a.name.localeCompare(b.name))

const NOBODY = { db: null, groupId: '', campaignId: '', characterId: '' }

const targetOf = (hidden: LubecGearHidden | null) =>
  (hidden ? { db: hidden.db, groupId: hidden.scope.groupId, campaignId: hidden.scope.campaignId, characterId: hidden.characterId } : NOBODY)

/**
 * A character's hidden carriers, kept in step with Firestore. With no `hidden`,
 * for anyone but the character's owner and the GM, nothing subscribes at all.
 * A refused read is the viewer losing the character to another player, which
 * leaves them nothing to see, so it reads as none rather than an error.
 */
export function useLubecHiddenCarriers(hidden: LubecGearHidden | null): readonly LubecHiddenCarrier[] {
  const { db, groupId, campaignId, characterId } = targetOf(hidden)
  const key = `${groupId}/${campaignId}/${characterId}`
  const [listened, setListened] = useState<Listened | null>(null)
  useEffect(() => {
    if (!db) return undefined
    return onSnapshot(
      characterHiddenCarriersRef(db, { groupId, campaignId }, characterId),
      (snap) => setListened({ key, carriers: carriersOf(snap.docs) }),
      () => setListened({ key, carriers: [] }),
    )
  }, [db, key, groupId, campaignId, characterId])
  return listened?.key === key ? listened.carriers : NONE
}
