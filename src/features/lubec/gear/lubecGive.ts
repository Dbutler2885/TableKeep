// Giving a thing to another player's character (spec 11.4): who it can go to,
// and the offer itself, which is OSE's `pendingTransfers` document. The sheet's
// waiting save is sent first and waited for, because the callable that accepts
// the offer takes the item from the stored character, not from this page.

import type { CharacterRecord, PendingTransfer, TransferableInventoryItem } from '../../../types/app'
import { makeId } from '../../character/characterFactories'
import type { LubecCharacterRecord } from '../../ruleSets/lubec/characterRecord'
import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { lubecOfferSnapshot } from '../../ruleSets/lubec/gear/offer'
import { lubecCharacterName } from '../lubecNames'
import { lubecMoveStoreOf, type LubecGearDropStore } from './lubecGearDrop'
import { quietSheets, type LubecMoveResult } from './lubecMoveTransaction'

type GiveSide = Pick<CharacterRecord, 'id' | 'name' | 'ownerUserId'>

/** A character something can be given to, and how the picker lists them. */
export type LubecGiveTarget = GiveSide & { label: string }

/** An offer the character has out: which it is, and who to. */
export type LubecOfferOut = { id: string; toName: string }

/** What the Gear page needs to give things away; null for a viewer who may not. */
export type LubecGearGive = {
  targets: readonly LubecGiveTarget[]
  /** The offer out for a thing on the sheet, or null. */
  offerOf: (itemId: string) => LubecOfferOut | null
  offer: (item: LubecItem, target: LubecGiveTarget, qty: number) => Promise<LubecMoveResult>
  cancel: (offerId: string) => Promise<LubecMoveResult>
  /** The ids of the character's hidden carriers, for the note before offering what is in one. */
  hiddenCarriers: readonly string[]
}

/** The hook's snapshot type is OSE's; a stored offer is a map, and all it reads of one is `kind` and `name`. */
type CreateTransfer = (item: TransferableInventoryItem, sourceId: string, from: GiveSide, to: GiveSide) => Promise<void>

export type LubecGiveOptions = {
  from: LubecCharacterRecord
  characters: readonly LubecCharacterRecord[]
  outgoing: readonly PendingTransfer[]
  store: LubecGearDropStore
  createTransfer: CreateTransfer
  cancelTransfer: (transferId: string) => Promise<void>
}

const sideOf = (character: LubecCharacterRecord): GiveSide =>
  ({ id: character.id, name: lubecCharacterName(character), ownerUserId: character.ownerUserId })

const targetOf = (character: LubecCharacterRecord): LubecGiveTarget => {
  const side = sideOf(character)
  return { ...side, label: character.ownerUsername ? `${side.name} (${character.ownerUsername})` : side.name }
}

/** Other people's finalized characters, as far as the roster shows them to this viewer: a player's roster has no GM-owned ones. */
export const lubecGiveTargets = (characters: readonly LubecCharacterRecord[], from: LubecCharacterRecord): LubecGiveTarget[] =>
  characters
    .filter((c) => c.creationStatus === 'active' && c.ownerUserId !== '' && c.ownerUserId !== from.ownerUserId)
    .map(targetOf)

const refusedBy = (error: unknown): LubecMoveResult =>
  ({ ok: false, msg: error instanceof Error ? error.message : 'Could not make the offer. Nothing changed.' })

// Sends the sheet's waiting save and waits for it, then writes the offer.
async function makeOffer({ from, store, createTransfer }: LubecGiveOptions, item: LubecItem, target: LubecGiveTarget, qty: number): Promise<LubecMoveResult> {
  try {
    await quietSheets(lubecMoveStoreOf(store), [from.id])
    await createTransfer(lubecOfferSnapshot(item, qty, makeId) as unknown as TransferableInventoryItem, item.id, sideOf(from), target)
    return { ok: true }
  } catch (error) {
    return refusedBy(error)
  }
}

const offerFor = ({ from, outgoing }: LubecGiveOptions, itemId: string) =>
  outgoing.find((t) => t.fromCharacterId === from.id && t.itemId === itemId)

/** The character's way of giving things away, over the shared store and the campaign's offers. */
export function lubecGearGive(options: LubecGiveOptions): LubecGearGive {
  return {
    targets: lubecGiveTargets(options.characters, options.from),
    offerOf: (itemId) => {
      const out = offerFor(options, itemId)
      return out ? { id: out.id, toName: out.toCharacterName } : null
    },
    offer: (item, target, qty) => makeOffer(options, item, target, qty),
    cancel: (offerId) => options.cancelTransfer(offerId).then(() => ({ ok: true as const }), refusedBy),
    hiddenCarriers: [],
  }
}

/** The line shown before offering what is in a hidden carrier (spec 11.3), or null for anything else. */
export const lubecGiveNote = (item: Pick<LubecItem, 'carrier'>, hiddenCarriers: readonly string[]): string | null =>
  (hiddenCarriers.includes(item.carrier) ? 'This is in a hidden carrier. The offer names it, so they will learn it exists.' : null)
