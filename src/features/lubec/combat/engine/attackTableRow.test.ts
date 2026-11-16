import { describe, expect, it } from 'vitest'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { lubecEffectWound } from '../../../ruleSets/lubec/woundCards'
import { readTableRow, tableChecked } from './attackTableRow'
import { combatEntropy, type CombatEntropy } from './commandEntropy'
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

/** Command-bound entropy with each die scripted by what it is for; an unscripted die rolls as ever. */
function dice(script: Record<string, number[]>): CombatEntropy {
  const real = combatEntropy(command)
  const queues = Object.fromEntries(Object.entries(script).map(([key, values]) => [key, [...values]]))
  return { ...real, die: (purpose: string, sides: number) => queues[purpose]?.shift() ?? real.die(purpose, sides) }
}

/** Roy's Body is 31 and Handle 55: 10 passes either, 99 fails either. */
const landed = (table: string, part: string, impact: number, script: Record<string, number[]> = {}) => {
  const asked = readTableRow(fight(), hit(table, part, impact), dice(script))
  if (asked.state.attack?.step !== 'check') return { fight: asked, logs: [] }
  const plan = tableChecked(asked, asked.state.attack, roy, command, dice(script))
  return { fight: plan.fight, logs: plan.logs }
}
const outboxOf = (done: { fight: CombatFight }) => done.fight.state.woundOutbox[0]
const attackOf = (done: { fight: CombatFight }) => done.fight.state.attack!

describe('a final Fisticuffs concussion', () => {
  it('waits on the target to roll Body before anything lands', () => {
    const waiting = readTableRow(fight(), hit('fisticuffs', 'head', 7), combatEntropy(command))
    expect(waiting.state.attack).toMatchObject({ step: 'check', row: { table: 'fisticuffs', name: 'Minor Concussion', final: true, check: { kind: 'save', against: 'Body', advantage: 'normal' } } })
    expect(waiting.state.pendingActions).toEqual([{ combatantKey: ROY, action: 'save' }])
    expect(waiting.state.woundOutbox).toEqual([])
  })

  it('Minor success: Dazed only, Trauma 0, no Stress', () => {
    const done = landed('fisticuffs', 'head', 7, { check: [10] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 0, stressDelta: 0 })
    expect(outboxOf(done).effects!.map((card) => card.cardKey)).toEqual(['dazed'])
    expect(attackOf(done)).toMatchObject({ outcome: 'wounded', rowTrauma: 0, checks: [{ purpose: 'concussion', success: true, stress: 0 }] })
    expect(done.logs[0].event).toBe('Roy rolled a Body Save.')
  })

  it('Minor failure: Dazed and -10 Handle until one Long Rest, +1 Trauma and the Save\'s +1 Stress once', () => {
    const done = landed('fisticuffs', 'head', 7, { check: [99] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 1, stressDelta: 1 })
    expect(outboxOf(done).effects!.map((card) => [card.cardKey, card.steps])).toEqual([
      ['dazed', [expect.objectContaining({ until: 'rounds' })]],
      ['concussion', [{ modifiers: [{ target: 'Handle', amount: -10 }], labels: [], until: 'long-rest' }]],
    ])
  })

  it('Severe success: a Minor Concussion with -10 Handle and +1 Trauma', () => {
    const done = landed('fisticuffs', 'head', 8, { check: [10] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 1, stressDelta: 0 })
    expect(outboxOf(done).effects!.find((card) => card.cardKey === 'concussion')!.steps).toEqual([{ modifiers: [{ target: 'Handle', amount: -10 }], labels: [], until: 'long-rest' }])
  })

  it('Severe failure: -30 Handle, then -10 after one rest, then lasting -10 Intellect after the second, +2 Trauma', () => {
    const done = landed('fisticuffs', 'head', 8, { check: [99] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 2, stressDelta: 1 })
    const concussion = outboxOf(done).effects!.find((card) => card.cardKey === 'concussion')!
    expect(concussion.steps.map((step) => [step.until, step.modifiers])).toEqual([
      ['long-rest', [{ target: 'Handle', amount: -30 }]],
      ['long-rest', [{ target: 'Handle', amount: -10 }]],
      ['lasting', [{ target: 'Intellect', amount: -10 }]],
    ])
    expect(attackOf(done).rowSections).toEqual([
      { label: 'Now', items: ['Dazed: Lose the next Movement and Action Stages, counts down by round (resolved by hand)'] },
      { label: 'Recovery', items: ['Concussion: Handle -30, step down after 1 Long Rest', 'then Concussion: Handle -10, step down after 1 Long Rest'] },
      { label: 'Lasting', items: ['then Concussion: Intellect -10, Persistent concussion'] },
    ])
  })
})

describe('Catch their fist', () => {
  it('a caught fist gives the printed Advantage card and nothing else', () => {
    const asked = readTableRow(fight(), hit('fisticuffs', 'hand-R', 1), combatEntropy(command))
    expect(asked.state.pendingActions).toEqual([{ combatantKey: ROY, action: 'check' }])
    const done = landed('fisticuffs', 'hand-R', 1, { check: [10] })
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 0, stressDelta: 0 })
    expect(outboxOf(done).effects).toMatchObject([{ cardKey: 'caught', steps: [{ until: 'next-round-end', rolls: [{ scope: 'attacks', mode: 'advantage' }] }] }])
  })

  it('a missed catch gives no wound and no Stress', () => {
    const done = landed('fisticuffs', 'hand-R', 1, { check: [99] })
    expect(done.fight.state.woundOutbox).toEqual([])
    expect(attackOf(done)).toMatchObject({ outcome: 'no-wound', closed: true, rowTrauma: 0, rowStress: 0, checks: [{ purpose: 'fist-catch', success: false, stress: 0 }] })
  })
})

describe('a knock-out', () => {
  it('rolls 2d10 minutes and 1d5 Minimum Stress once, keeps the dice, and never puts the target Out', () => {
    const done = landed('fisticuffs', 'head', 9, { unconscious: [4, 9], 'minimum-stress': [3] })
    expect(done.fight.state.combatants.find((entry) => entry.key === ROY)!.outReason).toBeNull()
    expect(outboxOf(done)).toMatchObject({ traumaDelta: 2, stressDelta: 0, minimumStressDelta: 3 })
    const card = outboxOf(done).effects![0]
    expect(card).toMatchObject({ cardKey: 'unconscious', steps: [{ until: 'by-hand', labels: ['Clear by hand: 2d10 = 4 + 9 = 13 minutes', 'On waking: Severe Concussion Body Save at Disadvantage'] }] })
    expect(lubecEffectWound(card)).toMatchObject({ dice: { 'Unconscious 2d10 minutes': [4, 9], 'Minimum Stress 1d5': [3] }, minimumStress: 3, trauma: 2 })
  })
})

describe('a final row that lands at once', () => {
  it('keeps separately recovering schedules on separate linked cards', () => {
    const done = landed('fisticuffs', 'shin-L', 8)
    expect(outboxOf(done).effects!.map((card) => [card.cardKey, card.part, card.steps.map((step) => step.until)])).toEqual([
      ['down', 'Knocked down', ['by-hand']],
      ['leg', 'Leg', ['long-rest', 'lasting']],
      ['evasive', 'No Evasive Movement', ['treated']],
    ])
  })

  it('makes discretionary Charm a reminder, never a Charm change', () => {
    const jaw = outboxOf(landed('fisticuffs', 'head', 5)).effects!.find((card) => card.cardKey === 'jaw')!
    expect(jaw.steps[1]).toEqual({ modifiers: [], labels: ['Missing teeth or visibly altered jaw'], until: 'lasting', charmReminder: true })
  })

  it('names the wound and keeps a paired part\'s side', () => {
    const done = landed('fisticuffs', 'thigh-L', 4)
    expect(attackOf(done).row).toMatchObject({ name: 'Legs kicked out', group: 'thigh', final: true })
    expect(outboxOf(done).effects![0]).toMatchObject({ cause: 'Fisticuffs, left thigh, Impact 4: Minor Legs kicked out', struckLocation: 'thigh-L' })
  })

  it('says a drop and an Immediate Death Save are the table\'s to resolve', () => {
    expect(attackOf(landed('fisticuffs', 'forearm-R', 6)).rowSections![0].items).toContain('Whatever the struck hand holds is dropped (resolved by hand)')
    expect(attackOf(landed('fisticuffs', 'head', 10))).toMatchObject({ rowTrauma: 4, rowSections: [{ label: 'Now', items: ['Immediate Death Save: the GM resolves it privately'] }] })
  })

  it('still reads a provisional row as words with its Body Save, until its table lands', () => {
    const asked = readTableRow(fight(), hit('thrown', 'head', 2), combatEntropy(command))
    expect(asked.state.attack!.row).toMatchObject({ name: 'Rock to the head, Minor Concussion', check: { kind: 'save' } })
    expect(asked.state.attack!.row!.final).toBeUndefined()
  })
})
