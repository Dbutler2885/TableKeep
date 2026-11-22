import { sheetPayload } from '../../character/characterStore/sheetIntentionEdits'
import type { CombatCommand } from './engine/types'

export type CombatJournalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

/** Supply a user-specific namespace. Storage failures stop sending, rather than lose retry identity. */
export function combatCommandJournal(storage: CombatJournalStorage, userId: string) {
  const prefix = `lubec-combat:${encodeURIComponent(userId)}:`
  const key = (command: CombatCommand) => prefix + [command.envelope.groupId, command.envelope.campaignId, command.envelope.fightId, command.envelope.id].map(encodeURIComponent).join(':')
  const pending = (): CombatCommand[] => Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => key !== null && key.startsWith(prefix))
    .map((key) => JSON.parse(storage.getItem(key)!) as CombatCommand)
  const save = (command: CombatCommand) => {
    const existing = storage.getItem(key(command))
    if (existing !== null && sheetPayload(JSON.parse(existing)) !== sheetPayload(command)) throw new Error('Command id reused with different payload.')
    storage.setItem(key(command), JSON.stringify(command))
  }
  return { pending, save, remove: (command: CombatCommand) => storage.removeItem(key(command)) }
}

export type CombatJournal = ReturnType<typeof combatCommandJournal>

/** Call once per interaction and retain the returned value for every resend. */
export function createCombatCommand(envelope: CombatCommand['envelope'], payload: CombatCommand['payload'], entropy = () => crypto.randomUUID()): CombatCommand {
  return { envelope: structuredClone(envelope), payload: structuredClone(payload), seed: entropy() }
}
