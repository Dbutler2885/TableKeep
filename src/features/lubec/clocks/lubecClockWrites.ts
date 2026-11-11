// The clock writes. Anyone in the campaign may make, edit, fill, empty and
// delete a clock; the rules hold only the shape. Filling and emptying are
// plain updates, so the press shows at once on this screen and reaches the
// others' straight after. A one-piece step is an increment, so two people
// stepping the same clock at once both count, and the rules refuse the one
// that would run past full or below empty.

import { deleteDoc, doc, increment, serverTimestamp, setDoc, updateDoc, type Firestore } from 'firebase/firestore'
import { campaignClockRef, campaignClocksRef, type CampaignScope } from '../../campaign/firestorePaths'
import { lubecFillForPieces, type LubecClock, type LubecClockFields } from './lubecClock'

/** Where a campaign's clocks are. */
export type LubecClockRecords = { db: Firestore; scope: CampaignScope }

/** Makes a clock, empty, at the end of the list. Resolves with its id. */
export async function createLubecClock({ db, scope }: LubecClockRecords, fields: LubecClockFields): Promise<string> {
  const ref = doc(campaignClocksRef(db, scope))
  await setDoc(ref, { ...fields, filled: 0, started: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return ref.id
}

// The fill is written only when the clock is cut to fewer pieces than it has
// filled, so a save does not undo a fill someone made while the form was open.
const fillThatFits = (clock: LubecClock, pieces: number) => (clock.filled > pieces ? { filled: lubecFillForPieces(clock.filled, pieces) } : {})

/** Saves the form's fields; a clock cut to fewer pieces than it has filled keeps only as many as fit. */
export const saveLubecClock = ({ db, scope }: LubecClockRecords, clock: LubecClock, fields: LubecClockFields) =>
  updateDoc(campaignClockRef(db, scope, clock.id), { ...fields, ...fillThatFits(clock, fields.pieces), updatedAt: serverTimestamp() })

const startedOnce = (filled: number) => (filled > 0 ? { started: true } : {})

/** Fills the clock to exactly `filled` pieces. */
export const setLubecClockFill = ({ db, scope }: LubecClockRecords, clock: LubecClock, filled: number) =>
  updateDoc(campaignClockRef(db, scope, clock.id), { filled, ...startedOnce(filled), updatedAt: serverTimestamp() })

/** Fills or empties one piece. */
export const stepLubecClock = ({ db, scope }: LubecClockRecords, clock: LubecClock, step: 1 | -1) =>
  updateDoc(campaignClockRef(db, scope, clock.id), { filled: increment(step), ...startedOnce(step), updatedAt: serverTimestamp() })

export const deleteLubecClock = ({ db, scope }: LubecClockRecords, clock: LubecClock) => deleteDoc(campaignClockRef(db, scope, clock.id))
