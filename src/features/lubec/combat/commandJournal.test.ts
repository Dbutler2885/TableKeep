import { expect, it } from 'vitest'
import { combatCommandJournal, createCombatCommand, type CombatJournalStorage } from './commandJournal'

export function memoryStorage(): CombatJournalStorage {
  const entries = new Map<string, string>()
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value) },
    removeItem: (key) => { entries.delete(key) },
    key: (index) => [...entries.keys()][index] ?? null,
    get length() { return entries.size },
  }
}

export const testEnvelope = () => ({ id: 'start', groupId: 'group', campaignId: 'campaign', fightId: 'fight', round: 0, phase: 'setup', stageInstanceId: 'local', actorKey: null, interactionSequence: 0 })

it('samples once and snapshots the interaction before a caller can edit its setup', () => {
  const envelope = testEnvelope()
  const payload = { type: 'start', selected: ['hero'] }
  let samples = 0
  const command = createCombatCommand(envelope, payload, () => { samples++; return 'seed' })
  envelope.fightId = 'edited'
  payload.selected.push('npc')
  expect(samples).toBe(1)
  expect(command).toMatchObject({ seed: 'seed', envelope: { fightId: 'fight' }, payload: { selected: ['hero'] } })
  expect(createCombatCommand(testEnvelope(), { type: 'end' }).seed).toEqual(expect.any(String))
})

it('recovers pending interactions after reload, refuses changed reuse, and scopes records to their user and fight', () => {
  const storage = memoryStorage()
  storage.setItem('unrelated', 'not-json')
  const journal = combatCommandJournal(storage, 'player')
  const command = createCombatCommand(testEnvelope(), { type: 'end' }, () => 'seed')
  journal.save(command)
  journal.save(command)
  expect(combatCommandJournal(storage, 'player').pending()).toEqual([command])
  expect(combatCommandJournal(storage, 'other').pending()).toEqual([])
  expect(() => journal.save({ ...command, seed: 'changed' })).toThrow('different payload')
  const otherFight = { ...command, envelope: { ...command.envelope, fightId: 'other-fight' } }
  journal.save(otherFight)
  expect(journal.pending()).toEqual([command, otherFight])
  journal.remove(command)
  expect(journal.pending()).toEqual([otherFight])
  journal.remove(otherFight)
  expect(journal.pending()).toEqual([])
  expect(storage.getItem('unrelated')).toBe('not-json')
})
