// A viewer's seat at the campaign's shared carriers (spec 3.5): every member
// sees them, anyone who may change a sheet moves things between it and them,
// and only the owning character's player and the GM change a carrier itself.

import { makeId } from '../../character/characterFactories'
import { canEditCharacterStoreCharacter } from '../../character/characterStore/characterStoreActions'
import type { LubecCharacterRecord } from '../../ruleSets/lubec/characterRecord'
import type { LubecCarrierDraft } from '../../ruleSets/lubec/gear/carriers'
import type { LubecRecordRef } from '../../ruleSets/lubec/gear/containers'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecNewSharedCarrier, type LubecSharedAdded, type LubecSharedCarrier } from '../../ruleSets/lubec/gear/sharedCarrier'
import { lubecCharacterName } from '../lubecNames'
import { lubecMoveStoreOf, type LubecGearDropper, type LubecGearDropStore, type LubecGearRecords } from './lubecGearDrop'
import { lubecMoveBetween, type LubecMoveResult } from './lubecMoveTransaction'
import { lubecAddSharedCarrier, lubecChangeSharedCarrier, lubecDeleteSharedCarrier, lubecEditSharedItems } from './lubecSharedCarrierWrites'
import { LUBEC_SHARED_NO_OWNER } from './sharedCarrierLabels'
import type { LubecViewer } from '../lubecSheetWiring'

/** What a viewer who may change the open sheet does with the shared carriers. */
export type LubecSharedActs = {
  /** The open sheet's own record. */
  sheet: LubecRecordRef
  move: (item: LubecItem, from: LubecRecordRef, to: LubecRecordRef, dest: string) => Promise<LubecMoveResult>
  drop: (item: LubecItem, carrierId: string) => Promise<LubecMoveResult>
  editItems: (seen: LubecSharedCarrier, items: readonly LubecItem[]) => Promise<LubecMoveResult>
  add: (draft: LubecCarrierDraft, ownerCharacterId: string) => Promise<LubecSharedAdded>
  change: (carrierId: string, draft: LubecCarrierDraft) => Promise<LubecMoveResult>
  remove: (carrier: LubecSharedCarrier) => Promise<void>
}

/** A character a shared carrier can be named for. */
export type LubecCarrierOwner = { id: string; name: string }

export type LubecSharedSeat = {
  carriers: readonly LubecSharedCarrier[]
  /** The owning character's name, or the line for one this viewer cannot see. */
  ownerOf: (carrier: LubecSharedCarrier) => string
  /** The characters this viewer may name as a new carrier's owner, the open sheet's first. */
  owners: readonly LubecCarrierOwner[]
  /** Whether this viewer may rename, change or delete the carrier. */
  mayChange: (carrier: LubecSharedCarrier) => boolean
  /** Null for a viewer who may only look at the open sheet. */
  acts: LubecSharedActs | null
}

const seenOf = ({ carrier, pocket, slot }: LubecItem) => ({ carrier, pocket, slot })

/** The shared carriers' writes for the open sheet, moved through the safe move and the store's quiet. */
export function lubecSharedActs(records: LubecGearRecords, store: LubecGearDropStore, dropper: LubecGearDropper): LubecSharedActs {
  const { db, scope, sheet } = records
  const moveStore = lubecMoveStoreOf(store)
  const between = (item: LubecItem, from: LubecRecordRef, to: LubecRecordRef, rest: object) =>
    lubecMoveBetween(db, { scope, from, to, store: moveStore, move: { itemId: item.id, seen: seenOf(item), ...rest } })
  return {
    sheet,
    move: (item, from, to, dest) => between(item, from, to, { dest }),
    drop: (item, carrierId) => between(item, { kind: 'shared', carrierId }, { kind: 'gm-items' }, { droppedBy: dropper }),
    editItems: (seen, items) => lubecEditSharedItems(records, seen, items),
    add: async (draft, ownerCharacterId) => {
      const added = lubecNewSharedCarrier(draft, makeId(), ownerCharacterId)
      if (added.ok) await lubecAddSharedCarrier(records, added.carrier)
      return added
    },
    change: (carrierId, draft) => lubecChangeSharedCarrier(records, carrierId, draft),
    remove: (carrier) => lubecDeleteSharedCarrier(records, carrier.id, dropper),
  }
}

export type LubecSharedSeatOptions = {
  carriers: readonly LubecSharedCarrier[]
  characters: readonly LubecCharacterRecord[]
  /** The open sheet. */
  character: LubecCharacterRecord
  viewer: LubecViewer
  store: LubecGearDropStore
  records: LubecGearRecords | null
}

const ownersFor = ({ characters, character, viewer }: LubecSharedSeatOptions): LubecCarrierOwner[] =>
  characters
    .filter((c) => viewer.role === 'gm' || c.ownerUserId === viewer.userId)
    .sort((a, b) => Number(b.id === character.id) - Number(a.id === character.id))
    .map((c) => ({ id: c.id, name: lubecCharacterName(c) }))

function actsFor({ character, viewer, store, records }: LubecSharedSeatOptions): LubecSharedActs | null {
  if (!records || !canEditCharacterStoreCharacter(character, viewer.role, viewer.userId)) return null
  return lubecSharedActs(records, store, { characterId: character.id, characterName: lubecCharacterName(character), userId: viewer.userId })
}

/** A viewer's seat at the shared carriers, on the open sheet. */
export function lubecSharedSeat(options: LubecSharedSeatOptions): LubecSharedSeat {
  const { carriers, characters, viewer } = options
  const ownerRecord = (carrier: LubecSharedCarrier) => characters.find((c) => c.id === carrier.ownerCharacterId)
  const acts = actsFor(options)
  return {
    carriers,
    acts,
    owners: ownersFor(options),
    ownerOf: (carrier) => {
      const owner = ownerRecord(carrier)
      return owner ? lubecCharacterName(owner) : LUBEC_SHARED_NO_OWNER
    },
    mayChange: (carrier) => acts !== null && (viewer.role === 'gm' || ownerRecord(carrier)?.ownerUserId === viewer.userId),
  }
}
