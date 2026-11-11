// The clock writes. Anyone in the campaign may make, edit, fill, empty and
// delete a clock; the rules hold only the shape. A piece is filled or emptied
// on its own, as an array union or removal of its index, so the press shows at
// once on this screen, and two people pressing different pieces of the same
// clock at the same moment both count.

import { arrayRemove, arrayUnion, deleteDoc, doc, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore'
import { campaignClockRef, campaignClocksRef, type CampaignScope } from '../../campaign/firestorePaths'
import { lubecFilledWithin, type LubecClock, type LubecClockFields } from './lubecClock'

/** Where a campaign's clocks are. */
export type LubecClockRecords = { db: Firestore; scope: CampaignScope }

/** Makes a clock, empty, at the end of the list. Resolves with its id. */
export async function createLubecClock({ db, scope }: LubecClockRecords, fields: LubecClockFields): Promise<string> {
  const ref = doc(campaignClocksRef(db, scope))
  await setDoc(ref, { ...fields, filled: [], started: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return ref.id
}

// The filled pieces are written only when the clock is cut to fewer pieces than
// one of them, so a save does not undo a piece someone filled while the form was open.
function piecesThatFit(clock: LubecClock, pieces: number) {
  const kept = lubecFilledWithin(clock.filled, pieces)
  return kept.length < clock.filled.length ? { filled: kept } : {}
}

/** Saves the form's fields; filled pieces past the clock's new size go with them. */
export const saveLubecClock = ({ db, scope }: LubecClockRecords, clock: LubecClock, fields: LubecClockFields) =>
  updateDoc(campaignClockRef(db, scope, clock.id), { ...fields, ...piecesThatFit(clock, fields.pieces), updatedAt: serverTimestamp() })

/** Fills one piece, or empties it. */
export const setLubecClockPiece = ({ db, scope }: LubecClockRecords, clock: LubecClock, index: number, filled: boolean) =>
  updateDoc(campaignClockRef(db, scope, clock.id), filled
    ? { filled: arrayUnion(index), started: true, updatedAt: serverTimestamp() }
    : { filled: arrayRemove(index), updatedAt: serverTimestamp() })

export const deleteLubecClock = ({ db, scope }: LubecClockRecords, clock: LubecClock) => deleteDoc(campaignClockRef(db, scope, clock.id))
