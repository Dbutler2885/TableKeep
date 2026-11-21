// Dropping a thing from a sheet (Rule M8, spec 8.3): one transaction that
// takes the thing off the sheet and makes it a dropped item in the GM's Items
// tab, with who dropped it and where from. The sheet's store is sent its
// waiting save first and is quiet while the move runs.

import type { Firestore } from 'firebase/firestore'
import type { CampaignScope } from '../../campaign/firestorePaths'
import type { LubecRecordRef } from '../../ruleSets/lubec/gear/containers'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecMoveBetween, type LubecMoveResult, type LubecMoveStore } from './lubecMoveTransaction'

/** Drops a thing to the GM's Items tab; null for a viewer who may only look. */
export type LubecGearDrop = ((item: LubecItem) => Promise<LubecMoveResult>) | null

/** Where a sheet's records are: the database, the campaign, and the sheet's own record. */
export type LubecGearRecords = { db: Firestore; scope: CampaignScope; sheet: LubecRecordRef }

/** The shared store's saving, as the move needs it. */
export type LubecGearDropStore = {
  /** Sends the character's waiting save now, and resolves once every save of it has settled. */
  settleSaves: (characterId: string) => Promise<void>
}

/** Who drops it: the sheet, by id and name, and the person at the keyboard. */
export type LubecGearDropper = { characterId: string; characterName: string; userId: string }

/** The shared store as a move needs it. */
export const lubecMoveStoreOf = (store: LubecGearDropStore): LubecMoveStore => ({ settleSaves: store.settleSaves })

/** The drop for a sheet's records, made by `dropper`. */
export function lubecGearDrop(records: LubecGearRecords, store: LubecGearDropStore, dropper: LubecGearDropper): Exclude<LubecGearDrop, null> {
  return (item) => lubecMoveBetween(records.db, {
    scope: records.scope,
    from: records.sheet,
    to: { kind: 'gm-items' },
    store: lubecMoveStoreOf(store),
    move: { itemId: item.id, seen: { carrier: item.carrier, pocket: item.pocket, slot: item.slot }, droppedBy: dropper },
  })
}
