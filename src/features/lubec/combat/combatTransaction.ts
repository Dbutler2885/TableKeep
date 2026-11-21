import { runTransaction, type Firestore, type Transaction } from 'firebase/firestore'
import { withSheetRevisionRetries, type AttemptedSheetRevision } from '../../character/characterStore/sheetIntentionRetry'
import { sheetPayload } from '../../character/characterStore/sheetIntentionEdits'
import { combatEntropy } from './engine/commandEntropy'
import { requireLiveContext } from './engine/context'
import { combatLifecycleHandlers, planCombatCommand } from './engine/lifecycle'
import type { CombatCommand, CombatHandler, CombatOutcome, CombatPlan } from './engine/types'
import type { CombatJournal } from './commandJournal'
import { combatRef, readCombatAuthority, readCombatRecords } from './combatReads'
import { writeCombatPlan } from './combatWrites'
import { prepareCombatSheets, writeCombatSheets } from './combatSheetWrites'
import { drainEndWounds } from './endWoundDrain'

export type CombatTransactionOptions = {
  userId: string
  journal: CombatJournal
  /** Shared seam for later engine actions; only built-in lifecycle commands ship in this slice. */
  handlers?: Readonly<Record<string, CombatHandler>>
  transact?: (callback: (tx: Transaction) => Promise<CombatOutcome>) => Promise<CombatOutcome>
  /** Optional override for tests; End otherwise uses the real atomic wound delivery service. */
  drainWounds?: (fightId: string) => Promise<void>
}

function replay(command: CombatCommand, receipt: { command: unknown; outcome: CombatOutcome }): CombatOutcome {
  if (sheetPayload(receipt.command) !== sheetPayload(command)) return { ok: false, reason: 'Command id reused with different payload.' }
  return receipt.outcome
}

function refusal(error: unknown): CombatOutcome {
  if (!(error instanceof Error)) throw error
  return { ok: false, reason: error.message }
}

async function applyCommand(db: Firestore, tx: Transaction, command: CombatCommand, options: CombatTransactionOptions, attempted: AttemptedSheetRevision[]): Promise<CombatOutcome> {
  const receipt = await tx.get(combatRef(db, command, 'combats', command.envelope.fightId, 'commands', command.envelope.id))
  if (receipt.exists()) {
    return replay(command, receipt.data() as { command: unknown; outcome: CombatOutcome })
  }
  const authority = await readCombatAuthority(db, tx, command, options.userId)
  const records = await readCombatRecords(db, tx, command, authority)
  const entropy = combatEntropy(command)
  let plan: CombatPlan
  try {
    if (command.payload.type !== 'start') requireLiveContext(command, records, authority)
    plan = planCombatCommand(command, records, authority, options.handlers ?? combatLifecycleHandlers, entropy)
  } catch (error) {
    return refusal(error)
  }
  const sheets = await prepareCombatSheets(db, command, plan, records.raws)
  attempted.push(...sheets.flatMap((entry) => entry.mutation ? [{ ref: entry.sheetRef, nextRevision: entry.mutation.receipt.outcome.revision }] : []))
  writeCombatSheets(tx, sheets)
  return writeCombatPlan(db, tx, command, plan, entropy)
}

const dueWounds = (outcome: CombatOutcome) => !outcome.ok && outcome.reason === 'Wounds must be delivered before combat can end.'

/** End's own closing step, derived from it so a resent End closes once: same envelope, its own receipt. */
const closingOf = (command: CombatCommand): CombatCommand => ({ ...command, envelope: { ...command.envelope, id: `${command.envelope.id}.close` }, payload: { type: 'close' } })

async function sendCommand(db: Firestore, command: CombatCommand, options: CombatTransactionOptions): Promise<CombatOutcome> {
  const transact = options.transact ?? ((callback) => runTransaction(db, callback))
  const commit = (next: CombatCommand) => {
    let attempted: AttemptedSheetRevision[] = []
    return withSheetRevisionRetries(() => transact((tx) => {
      attempted = []
      return applyCommand(db, tx, next, options, attempted)
    }), () => attempted)
  }
  if (command.payload.type === 'end') {
    // Closing first queues every combatant's closing change; End then drains them before it ends the fight.
    const closed = await commit(closingOf(command))
    if (!closed.ok) return closed
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const outcome = await commit(command)
    if (!dueWounds(outcome)) return outcome
    const failure = await drainEndWounds(db, command, options.userId, options.drainWounds)
    if (failure) return failure
  }
  return { ok: false, reason: 'Wound delivery is still pending. Combat remains live; retry End.' }
}

/** Journal before the first network request. An uncertain acknowledgement deliberately retains it. */
export async function commitCombatCommand(db: Firestore, command: CombatCommand, options: CombatTransactionOptions): Promise<CombatOutcome> {
  const snapshot = JSON.parse(sheetPayload(command)) as CombatCommand
  options.journal.save(snapshot)
  const outcome = await sendCommand(db, snapshot, options)
  options.journal.remove(snapshot)
  return outcome
}
