import { useCallback, useRef } from 'react'
import { db } from '../../../firebase'
import { commitCombatCommand } from './combatTransaction'
import { combatCommandJournal, type CombatJournalStorage } from './commandJournal'
import type { CombatCommand, CombatOutcome } from './engine/types'

export const COMBAT_UNCERTAIN = 'The table did not answer. Press again to retry the same action.'

export type CombatSend = (key: string, make: () => CombatCommand) => Promise<CombatOutcome>

export type CombatCommit = (command: CombatCommand) => Promise<CombatOutcome>

/**
 * Sends one logical action. An unanswered send keeps its command, so pressing
 * again resends the same id, seed and payload; an answer, ok or refused,
 * releases it.
 */
export function combatSender(commit: CombatCommit): CombatSend {
  const retained = new Map<string, CombatCommand>()
  return async (key, make) => {
    const command = retained.get(key) ?? make()
    retained.set(key, command)
    try {
      const outcome = await commit(command)
      retained.delete(key)
      return outcome
    } catch {
      return { ok: false, reason: COMBAT_UNCERTAIN }
    }
  }
}

const browserJournal = (): CombatJournalStorage => window.localStorage

/** The viewer's sender, journalling every command in this browser before it is sent. */
export function useLubecCombatSend(userId: string, storage: () => CombatJournalStorage = browserJournal): CombatSend {
  const sender = useRef<{ userId: string; send: CombatSend } | null>(null)
  return useCallback((key, make) => {
    if (sender.current?.userId !== userId) {
      // A browser that refuses storage refuses the send too, rather than lose the retry identity.
      const commit: CombatCommit = (command) => commitCombatCommand(db, command, { userId, journal: combatCommandJournal(storage(), userId) })
      sender.current = { userId, send: combatSender(commit) }
    }
    return sender.current.send(key, make)
  }, [userId, storage])
}
