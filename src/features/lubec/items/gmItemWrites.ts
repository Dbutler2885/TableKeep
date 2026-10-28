// The GM's writes in the Items tab (spec 8.2). Adding, editing and keeping
// write the whole document, so a field the GM took off is gone. Giving is the
// two-record move from the tab to a character (`lubecMoveBetween`), so the
// item lands by the arrival rule: a dropped item leaves the tab, and a
// campaign item stays and the character gets a copy (Rule T2). Deleting is
// the only way an item leaves the game outright.

import { deleteDoc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore'
import { campaignGmItemRef, type CampaignScope } from '../../campaign/firestorePaths'
import { LUBEC_GM_ITEM_FIELDS, type LubecGmItem } from '../../ruleSets/lubec/gear/gmItem'
import { lubecMoveBetween, stored, type LubecMoveResult, type LubecMoveStore } from '../gear/lubecMoveTransaction'

/** Where the tab's items are. */
export type LubecItemsRecords = { db: Firestore; scope: CampaignScope }

// Read back by the item parser, an item carries an empty place and the times it was written; neither is the item.
const NOT_STORED = ['carrier', 'createdAt', 'updatedAt']

const itemFields = (item: LubecGmItem, drop: readonly string[]) =>
  Object.fromEntries(Object.entries(item).filter(([key]) => !NOT_STORED.includes(key) && !drop.includes(key)))

const createdAtOf = (item: LubecGmItem): unknown => (item as { createdAt?: unknown }).createdAt ?? serverTimestamp()

function writeGmItem({ db, scope }: LubecItemsRecords, item: LubecGmItem, drop: readonly string[] = []) {
  return setDoc(campaignGmItemRef(db, scope, item.id), { ...stored(itemFields(item, drop)), createdAt: createdAtOf(item), updatedAt: serverTimestamp() })
}

/** Adds or replaces a campaign item, keeping when it was first made. */
export const saveLubecLibraryItem = (records: LubecItemsRecords, item: LubecGmItem) => writeGmItem(records, { ...item, status: 'library' })

/** Keep as a campaign item: a dropped item joins the library, without who dropped it or where from. */
export const keepLubecGmItem = (records: LubecItemsRecords, item: LubecGmItem) =>
  writeGmItem(records, { ...item, status: 'library' }, LUBEC_GM_ITEM_FIELDS.slice(1))

export const deleteLubecGmItem = ({ db, scope }: LubecItemsRecords, item: LubecGmItem) => deleteDoc(campaignGmItemRef(db, scope, item.id))

/** Gives the item to a character, by the arrival rule. A campaign item is copied under `copyId`. */
export function giveLubecGmItem(records: LubecItemsRecords, item: LubecGmItem, characterId: string, store: LubecMoveStore, copyId: string): Promise<LubecMoveResult> {
  return lubecMoveBetween(records.db, {
    scope: records.scope,
    from: { kind: 'gm-items' },
    to: { kind: 'character', characterId },
    store,
    move: { itemId: item.id, ...(item.status === 'library' ? { copyId } : {}) },
  })
}
