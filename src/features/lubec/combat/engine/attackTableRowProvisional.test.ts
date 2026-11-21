import { describe, expect, it, vi } from 'vitest'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import type { LubecWoundTable } from '../../../ruleSets/lubec/woundTables'
import { readTableRow, tableChecked } from './attackTableRow'
import { combatEntropy, type CombatEntropy } from './commandEntropy'
import { publicCombatant } from './inputs'
import type { CombatAttack, CombatCommand, CombatFight, CombatSheet } from './types'

// Every table the app ships is final now, but the engine still reads a drafted (provisional) row: a Body Save that
// picks the row's version, or a d2 between two wounds. A stand-in draft table keeps that path honest.
const DRAFT: LubecWoundTable = {
  key: 'draft', name: 'Draft Blows',
  locations: [{
    parts: ['forearm'],
    rows: [
      { impact: 1, severity: 'Minor', trauma: 0, name: 'Jarred', text: 'Pins and needles.', save: { successTrauma: 0, success: 'It passes.', failure: 'The arm goes dead.' } },
      { impact: 2, severity: 'Serious', trauma: 1, name: 'Split', text: '', choices: [{ name: 'Split knuckle', text: 'Blood on the floor.', injury: 'Knotted knuckle' }, { name: 'Split nail', text: 'It throbs.' }] },
      { impact: 3, severity: 'Serious', trauma: 2, name: 'Cracked', text: 'Bone shows.', save: { successTrauma: 1, success: 'Splinted in time.', failure: 'Set badly.' }, orMore: true },
    ],
  }],
}

vi.mock('../../../ruleSets/lubec/woundTables', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../ruleSets/lubec/woundTables')>()
  return {
    ...real,
    lubecWoundTableRow: (key: string, part: string, impact: number) => {
      if (key !== 'draft') return real.lubecWoundTableRow(key, part, impact)
      const location = DRAFT.locations[0]
      return { table: DRAFT, location, row: location.rows[Math.min(impact, location.rows.length) - 1] }
    },
  }
})

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

const hit = (total: number): CombatAttack => ({
  id: 'a', grantId: null, attackerKey: HERO, step: 'strength', detached: [], closed: false,
  aim: { targetKey: ROY } as CombatAttack['aim'], frozen: { choice: { name: 'Punch' } } as CombatAttack['frozen'],
  landing: { table: 'punch', startRoll: 1, sideRoll: null, start: 'forearm-R', part: 'forearm-R', moved: 0 },
  impact: { quality: total, base: 0, strength: null, moved: 0, armor: 0, total, table: 'draft' },
})

function dice(script: Record<string, number[]>): CombatEntropy {
  const real = combatEntropy(command)
  const queues = Object.fromEntries(Object.entries(script).map(([key, values]) => [key, [...values]]))
  return { ...real, die: (purpose: string, sides: number) => queues[purpose]?.shift() ?? real.die(purpose, sides) }
}

/** Roy's Body is 31: 10 passes the Save, 99 fails it. */
function saved(impact: number, roll: number) {
  const asked = readTableRow(fight(), hit(impact), dice({}))
  expect(asked.state.attack).toMatchObject({ step: 'check', row: { check: { kind: 'save', against: 'Body' } } })
  return tableChecked(asked, asked.state.attack!, roy, command, dice({ check: [roll] })).fight
}

const cardOf = (done: CombatFight) => done.state.woundOutbox[0]

describe('a drafted wound row', () => {
  it('a passed Body Save lands the row with its success words and Trauma', () => {
    const done = saved(3, 10)
    expect(cardOf(done)).toMatchObject({ traumaDelta: 1 })
    expect(done.state.attack).toMatchObject({ outcome: 'wounded', rowOutcome: 'Bone shows. Splinted in time.' })
  })

  it('a failed Body Save lands the row as printed, with its failure words', () => {
    const done = saved(1, 99)
    expect(cardOf(done)).toMatchObject({ traumaDelta: 0 })
    expect(done.state.attack).toMatchObject({ rowOutcome: 'Pins and needles. The arm goes dead.' })
  })

  it('a d2 row keeps the wound it rolled, with that wound\'s words and lasting injury', () => {
    const first = readTableRow(fight(), hit(2), dice({ 'wound-choice': [1] }))
    expect(first.state.attack!.row).toMatchObject({ name: 'Split knuckle', text: 'Blood on the floor.', injury: 'Knotted knuckle', choice: 1, check: null })
    expect(cardOf(first).effect).toMatchObject({ name: 'Split knuckle', steps: [{ labels: ['Blood on the floor.', 'Lasting injury: Knotted knuckle'] }] })
    const second = readTableRow(fight(), hit(2), dice({ 'wound-choice': [2] }))
    expect(second.state.attack!.row).toMatchObject({ name: 'Split nail', injury: null, choice: 2 })
  })
})
