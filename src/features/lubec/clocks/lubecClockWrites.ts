// The clock writes. The GM may make, edit, fill, empty and delete any clock,
// and alone chooses who sees one. A player may do the same with the clocks
// shown to them, without changing who sees them, and a clock a player makes is
// the whole table's. A piece is filled or emptied
// on its own, as an array union or removal of its index, so the press shows at
// once on this screen, and two people pressing different pieces of the same
// clock at the same moment both count.

import { arrayRemove, arrayUnion, deleteDoc, doc, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore'
import { campaignClockRef, campaignClocksRef, type CampaignScope } from '../../campaign/firestorePaths'
import { lubecFilledWithin, type LubecClock, type LubecClockFields, type LubecClockSharing } from './lubecClock'

/** Where a campaign's clocks are. */
export type LubecClockRecords = { db: Firestore; scope: CampaignScope }

/** Makes a clock, empty, at the end of the list, shown as `sharing` says. Resolves with its id. */
export async function createLubecClock({ db, scope }: LubecClockRecords, fields: LubecClockFields, sharing: LubecClockSharing): Promise<string> {
  const ref = doc(campaignClocksRef(db, scope))
  await setDoc(ref, { ...fields, ...sharing, filled: [], started: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return ref.id
}

// The filled pieces are written only when the clock is cut to fewer pieces than
// one of them, so a save does not undo a piece someone filled while the form was open.
function piecesThatFit(clock: LubecClock, pieces: number) {
  const kept = lubecFilledWithin(clock.filled, pieces)
  return kept.length < clock.filled.length ? { filled: kept } : {}
}

/**
 * Saves the form's fields, and who sees the clock when the GM passes it; a
 * player passes null and leaves it alone. Filled pieces past the clock's new
 * size go.
 */
export const saveLubecClock = ({ db, scope }: LubecClockRecords, clock: LubecClock, fields: LubecClockFields, sharing: LubecClockSharing | null) =>
  updateDoc(campaignClockRef(db, scope, clock.id), { ...fields, ...sharing, ...piecesThatFit(clock, fields.pieces), updatedAt: serverTimestamp() })

/** Fills one piece, or empties it. */
export const setLubecClockPiece = ({ db, scope }: LubecClockRecords, clock: LubecClock, index: number, filled: boolean) =>
  updateDoc(campaignClockRef(db, scope, clock.id), filled
    ? { filled: arrayUnion(index), started: true, updatedAt: serverTimestamp() }
    : { filled: arrayRemove(index), updatedAt: serverTimestamp() })

export const deleteLubecClock = ({ db, scope }: LubecClockRecords, clock: LubecClock) => deleteDoc(campaignClockRef(db, scope, clock.id))
