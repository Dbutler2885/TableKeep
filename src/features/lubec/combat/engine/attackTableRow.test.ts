import { describe, expect, it } from 'vitest'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { readTableRow, tableChecked } from './attackTableRow'
import { combatEntropy } from './commandEntropy'
import { publicCombatant } from './inputs'
import type { CombatAttack, CombatCommand, CombatFight, CombatSheet } from './types'

const HERO = 'character:hero'
const ROY = 'npc:roy'
const sheet = (kind: 'character' | 'npc', sheetId: string, name: string): CombatSheet =>
  ({ kind, sheetId, name, ownerUserId: kind === 'npc' ? 'gm' : 'player', portraitPath: '', sheet: lubecCharacterSheet() })
const roy = sheet('npc', 'roy', 'Roy')
const command: CombatCommand = {
  envelope: { id: 'c', groupId: 'g', campaignId: 'x', fightId: 'fight', round: 1, phase: 'attack', stageInstanceId: 's', actorKey: ROY, interactionSequence: 0 },
  seed: 'seed', payload: { type: 'check' },
}

function fight(): CombatFight {
  const combatants = [publicCombatant(sheet('character', 'hero', 'Wayne')), publicCombatant(roy)]
  return { status: 'live', participantUserIds: ['player'], state: { round: 1, phase: 'attack', stageInstanceId: 's', combatants, floor: [], attack: null, woundOutbox: [], woundAcknowledgements: [] } }
}

/** A punch or swing that has its Impact at `part`, ready for its table. */
const hit = (table: string, part: string, total: number): CombatAttack => ({
  id: 'a', grantId: null, attackerKey: HERO, step: 'strength', detached: [], closed: false,
  aim: { targetKey: ROY } as CombatAttack['aim'], frozen: { choice: { name: 'Punch' } } as CombatAttack['frozen'],
  landing: { table: 'punch', startRoll: 1, sideRoll: null, start: part, part, moved: 0 },
  impact: { quality: total, base: 0, strength: null, moved: 0, armor: 0, total, table },
})

/** Command-bound entropy with the check die fixed. */
const dice = (check: number) => ({ ...combatEntropy(command), die: () => check })

describe('a located row with a Body Save', () => {
  const asked = () => readTableRow(fight(), hit('fisticuffs', 'head', 5), combatEntropy(command))

  it('waits on the target to roll Body before anything lands', () => {
    const waiting = asked()
    expect(waiting.state.attack).toMatchObject({ step: 'check', row: { table: 'fisticuffs', name: 'Minor Concussion', check: { kind: 'save', against: 'Body', advantage: 'normal' } } })
    expect(waiting.state.pendingActions).toEqual([{ combatantKey: ROY, action: 'save' }])
    expect(waiting.state.woundOutbox).toEqual([])
  })

  it('takes the success version, with its lower Trauma, when the Save passes', () => {
    const waiting = asked()
    const { fight: done, logs } = tableChecked(waiting, waiting.state.attack!, roy, command, dice(1))
    expect(done.state.attack).toMatchObject({ outcome: 'wounded', closed: true, rowTrauma: 0, rowOutcome: 'Only Dazed, and 0 Trauma instead of +1.', check: { success: true } })
    expect(done.state.woundOutbox[0]).toMatchObject({ traumaDelta: 0, stressDelta: 0 })
    expect(logs[0].event).toBe('Roy rolled a Body Save.')
  })

  it('takes the row as printed, and the Save\'s Stress, when it fails', () => {
    const waiting = asked()
    const { fight: done } = tableChecked(waiting, waiting.state.attack!, roy, command, dice(99))
    expect(done.state.attack).toMatchObject({ rowTrauma: 1, rowOutcome: 'Minor Concussion, which is Dazed and -10 Handle until a Long Rest.' })
    expect(done.state.woundOutbox[0]).toMatchObject({ traumaDelta: 1, stressDelta: 1 })
  })
})

describe('a located row that lands at once', () => {
  it('puts a knocked-out target Out and still queues the wound', () => {
    const done = readTableRow(fight(), hit('fisticuffs', 'neck', 8), combatEntropy(command))
    expect(done.state.combatants.find((entry) => entry.key === ROY)!.outReason).toBe('wound')
    expect(done.state.attack).toMatchObject({ outcome: 'wounded', row: { name: 'Blow to the side of the neck', severity: 'Severe', out: true }, rowTrauma: 2 })
    expect(done.state.woundOutbox[0].effect).toMatchObject({ name: 'Blow to the side of the neck', steps: [{ modifiers: [], labels: ['Knocked unconscious.'] }] })
  })

  it('names the wound when the row has no other words, and keeps a paired part\'s side', () => {
    const done = readTableRow(fight(), hit('fisticuffs', 'thigh-L', 4), combatEntropy(command))
    expect(done.state.attack!.row).toMatchObject({ name: 'Legs kicked out', text: 'Knocked down.', group: 'thigh' })
    expect(done.state.woundOutbox[0].effect).toMatchObject({ cause: 'Fisticuffs, left thigh, Impact 4: Serious Legs kicked out', struckLocation: 'thigh-L' })
  })
})
