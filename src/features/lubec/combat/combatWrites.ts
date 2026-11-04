import { serverTimestamp, type Firestore, type Transaction } from 'firebase/firestore'
import type { CombatEntropy } from './engine/commandEntropy'
import type { CombatCommand, CombatOutcome, CombatPlan } from './engine/types'
import { combatRef } from './combatReads'

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value))

/** No reads below this boundary. State is always written whole; receipts and logs are immutable. */
export function writeCombatPlan(db: Firestore, tx: Transaction, command: CombatCommand, plan: CombatPlan, entropy: CombatEntropy): CombatOutcome {
  const fight = combatRef(db, command, 'combats', command.envelope.fightId)
  // Start creates the document; later commands replace `state` whole, so no stale nested key survives a merge.
  if (command.payload.type === 'start') tx.set(fight, { ...json(plan.fight), updatedAt: serverTimestamp() })
  else tx.update(fight, { state: json(plan.fight.state), status: plan.fight.status, updatedAt: serverTimestamp() })
  if (plan.control !== undefined) tx.set(combatRef(db, command, 'combatControl', 'current'), { activeFightId: plan.control })
  plan.items.forEach(({ id, value }) => {
    const ref = combatRef(db, command, 'gmItems', id)
    if (value === null) tx.delete(ref)
    else tx.set(ref, { ...json(value), updatedAt: serverTimestamp() })
  })
  plan.logs.forEach((log, ordinal) => {
    tx.set(combatRef(db, command, 'combats', command.envelope.fightId, 'log', entropy.id('log', ordinal)), { ...log, at: serverTimestamp() })
  })
  const generatedIds = [...new Set([...entropy.generatedIds, command.envelope.fightId, plan.fight.state.stageInstanceId, ...plan.fight.state.floor.map((record) => record.item.id), ...plan.items.map((item) => item.id)])]
  const outcome: CombatOutcome = { ok: true, fightId: command.envelope.fightId, generatedIds, rolls: entropy.rolls }
  tx.set(combatRef(db, command, 'combats', command.envelope.fightId, 'commands', command.envelope.id), { command: json(command), outcome, at: serverTimestamp() })
  return outcome
}
