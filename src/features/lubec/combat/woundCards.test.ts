import { describe, expect, it } from 'vitest'
import { planSheetIntention } from '../../character/characterStore/sheetIntention'
import { parseLubecCharacter } from '../../ruleSets/lubec/characterParser'
import type { LubecCharacterSheet } from '../../ruleSets/lubec/characterRecord'
import { lubecCheckTarget } from '../../ruleSets/lubec/checkRoll'
import { lubecCurrentValue, lubecEffectiveHandle } from '../../ruleSets/lubec/derivations'
import { stepDownLubecEffect } from '../../ruleSets/lubec/effects'
import { lubecSheetModifiers } from '../../ruleSets/lubec/modifiers'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { lubecEffectWound } from '../../ruleSets/lubec/woundCards'
import { readTableRow } from './engine/attackTableRow'
import { combatEntropy } from './engine/commandEntropy'
import { combatInputModifiers } from './engine/inputModifiers'
import { publicCombatant } from './engine/inputs'
import type { CombatAttack, CombatCommand, CombatFight, CombatSheet } from './engine/types'
import { combatWoundIntention, combatWoundOperationId } from './woundIntention'
import type { CombatWound } from './woundTypes'

// The forearm tracer: a final Blunt Force forearm row at Impact 4 lands as a
// real -20 Handle card through the same planner the sheet transaction uses,
// both Core and combat read it, and Step down takes it off without touching
// Trauma.

const HERO = 'character:hero'
const ROY = 'npc:roy'
const sheet = (kind: 'character' | 'npc', sheetId: string, name: string): CombatSheet =>
  ({ kind, sheetId, name, ownerUserId: kind === 'npc' ? 'gm' : 'player', portraitPath: '', sheet: lubecCharacterSheet() })
const command: CombatCommand = {
  envelope: { id: 'c', groupId: 'g', campaignId: 'x', fightId: 'fight', round: 2, phase: 'attack', stageInstanceId: 's', actorKey: HERO, interactionSequence: 0 },
  seed: 'seed', payload: { type: 'strength' },
}

function fight(): CombatFight {
  const combatants = [publicCombatant(sheet('character', 'hero', 'Wayne')), publicCombatant(sheet('npc', 'roy', 'Roy'))]
  return { status: 'live', participantUserIds: ['player'], state: { round: 2, phase: 'attack', stageInstanceId: 's', combatants, floor: [], attack: null, woundOutbox: [], woundAcknowledgements: [] } }
}

const swing = (part: string, total: number): CombatAttack => ({
  id: 'a', grantId: null, attackerKey: HERO, step: 'strength', detached: [], closed: false,
  aim: { targetKey: ROY } as CombatAttack['aim'], frozen: { choice: { name: 'Club' } } as CombatAttack['frozen'],
  landing: { table: 'melee', startRoll: 1, sideRoll: 4, start: part, part, moved: 0 },
  impact: { quality: total, base: 0, strength: null, moved: 0, armor: 0, total, table: 'blunt' },
})

const landed = (): CombatWound => readTableRow(fight(), swing('forearm-L', 4), combatEntropy(command)).state.woundOutbox[0]

async function delivered(stored: Record<string, unknown> = { lubec: lubecCharacterSheet(), sheetRevision: 3 }) {
  const wound = landed()
  const operationId = await combatWoundOperationId('fight', wound.id)
  const intention = combatWoundIntention(stored, wound, 'fight', operationId)
  const planned = planSheetIntention(stored, intention)
  return { operationId, intention, planned, lubec: parseLubecCharacter('roy', planned.mutation!.sheet as never).lubec }
}

describe('a final Blunt Force forearm 4 wound', () => {
  it('lands as one Long Rest card of -20 Handle, with +1 Trauma and nothing resolved by hand', () => {
    const wound = landed()
    expect(wound).toMatchObject({ traumaDelta: 1, stressDelta: 0, originatingRound: 2, effectiveRound: 3 })
    expect(wound.effects).toHaveLength(1)
    expect(wound.effects![0]).toMatchObject({
      cardKey: 'injury', name: 'Forearm injury', part: 'Forearm',
      steps: [{ modifiers: [{ target: 'Handle', amount: -20 }], labels: [], until: 'long-rest' }],
    })
    expect(lubecEffectWound(wound.effects![0])).toMatchObject({
      table: 'blunt', tableName: 'Blunt Force', location: 'forearm', part: 'forearm-L', impact: 4, severity: 'Serious',
      row: 'Forearm injury', prose: '`-20 Handle` until 1 Long Rest.', branch: null, contentVersion: 'blunt-force.md@1119f060', trauma: 1, stress: 0,
    })
  })

  it('reaches the sheet once: one card, its wound snapshot under the delivery identity, and the Trauma', async () => {
    const { operationId, planned, lubec } = await delivered()
    expect(planned.outcome).toMatchObject({ status: 'committed', revision: 4 })
    expect(lubec.counters.trauma).toBe(1)
    expect(lubec.effects).toHaveLength(1)
    expect(lubec.effects[0]).toMatchObject({ id: `${operationId}_injury`, combatOrigin: { fightId: 'fight', effectiveRound: 3 } })
    expect(lubecEffectWound(lubec.effects[0])?.groupId).toBe(operationId)
  })

  it('never lands twice: replaying the same intention on the written sheet asks for repair rather than adding a copy or a second Trauma', async () => {
    const { intention, planned } = await delivered()
    const again = planSheetIntention(planned.mutation!.sheet, { ...intention, baseRevision: 4 })
    expect(again.outcome).toMatchObject({ status: 'repair', code: 'record-exists' })
    expect(again.mutation).toBeUndefined()
  })

  it('keeps a concurrent unrelated edit: a Stress change and another card made since the wound read the sheet', async () => {
    const own = { id: 'note', name: 'Owes Wayne', cause: '', steps: [] }
    const { lubec } = await delivered({ lubec: { ...lubecCharacterSheet(), counters: { stress: 5, minimumStress: 2, trauma: 1 }, effects: [own] }, sheetRevision: 9 })
    expect(lubec.counters).toEqual({ stress: 5, minimumStress: 2, trauma: 2 })
    expect(lubec.effects.map((effect) => effect.id)).toEqual(['note', expect.stringMatching(/_injury$/)])
  })

  it('lowers Handle by 20 in Core at once and in combat from the next round, and Step down restores it without touching Trauma', async () => {
    const { lubec } = await delivered()
    expect(lubecCurrentValue(lubec, 'Handle', lubecSheetModifiers(lubec))).toBe(35)
    expect(lubecCheckTarget(lubec, 'Handle', null)).toBe(35)
    expect(lubecEffectiveHandle(lubec, combatInputModifiers(lubec, { fightId: 'fight', round: 2 }))).toBe(55)
    expect(lubecEffectiveHandle(lubec, combatInputModifiers(lubec, { fightId: 'fight', round: 3 }))).toBe(35)
    const rested: LubecCharacterSheet = { ...lubec, effects: stepDownLubecEffect(lubec.effects, lubec.effects[0].id) }
    expect(rested.effects).toEqual([])
    expect(rested.counters.trauma).toBe(1)
    expect(lubecCurrentValue(rested, 'Handle', lubecSheetModifiers(rested))).toBe(55)
  })

  it('still lands an older provisional row as words resolved by hand', () => {
    const cut = { ...swing('forearm-L', 3), impact: { ...swing('forearm-L', 3).impact!, table: 'thrown' } }
    const wound = readTableRow(fight(), cut, combatEntropy(command)).state.woundOutbox[0]
    expect(wound.effects).toBeUndefined()
    expect(wound.effect).toMatchObject({ steps: [{ modifiers: [] }] })
  })
})

describe('a final Fisticuffs knock-out', () => {
  it('reaches the sheet with its Trauma and its rolled Minimum Stress once, and a replay adds neither again', async () => {
    const punch = { ...swing('head', 9), impact: { ...swing('head', 9).impact!, table: 'fisticuffs' } }
    const wound = readTableRow(fight(), punch, combatEntropy(command)).state.woundOutbox[0]
    const rolled = wound.minimumStressDelta!
    expect(rolled).toBeGreaterThanOrEqual(1)
    expect(rolled).toBeLessThanOrEqual(5)
    const stored = { lubec: { ...lubecCharacterSheet(), counters: { stress: 2, minimumStress: 1, trauma: 0 } }, sheetRevision: 0 }
    const operationId = await combatWoundOperationId('fight', wound.id)
    const intention = combatWoundIntention(stored, wound, 'fight', operationId)
    const planned = planSheetIntention(stored, intention)
    expect((planned.mutation!.sheet.lubec as LubecCharacterSheet).counters).toEqual({ stress: 2, minimumStress: 1 + rolled, trauma: 2 })
    expect(planSheetIntention(planned.mutation!.sheet, { ...intention, baseRevision: 1 }).outcome).toMatchObject({ status: 'repair', code: 'record-exists' })
  })
})

describe('final Blunt Force recovery schedules', () => {
  async function onSheet(part: string, impact: number) {
    const wound = readTableRow(fight(), swing(part, impact), combatEntropy(command)).state.woundOutbox[0]
    const stored = { lubec: lubecCharacterSheet(), sheetRevision: 0 }
    const planned = planSheetIntention(stored, combatWoundIntention(stored, wound, 'fight', await combatWoundOperationId('fight', wound.id)))
    return parseLubecCharacter('roy', planned.mutation!.sheet as never).lubec
  }
  const keyed = (sheet: LubecCharacterSheet, key: string) => sheet.effects.find((effect) => effect.cardKey === key)!

  it('splits a shattered forearm into a slow bleed First Aid clears and an arm a Long Rest steps to lasting -10 Handle', async () => {
    const hurt = await onSheet('forearm-R', 6)
    expect(hurt.counters.trauma).toBe(2)
    expect(hurt.effects.map((effect) => effect.cardKey)).toEqual(['slow-bleed', 'arm'])
    expect(keyed(hurt, 'slow-bleed').steps).toEqual([{ modifiers: [], labels: ['+1 Trauma every 30 minutes until Basic First Aid; add it with the Trauma counter'], until: 'treated' }])
    expect(keyed(hurt, 'arm').steps[0]).toMatchObject({ until: 'long-rest', restrictions: [{ kind: 'arm-unusable', side: 'R' }] })
    const aided: LubecCharacterSheet = { ...hurt, effects: stepDownLubecEffect(hurt.effects, keyed(hurt, 'slow-bleed').id) }
    expect(aided.effects.map((effect) => effect.cardKey)).toEqual(['arm'])
    expect(aided.counters.trauma).toBe(2)
    const rested: LubecCharacterSheet = { ...hurt, effects: stepDownLubecEffect(hurt.effects, keyed(hurt, 'arm').id) }
    expect(rested.effects.map((effect) => effect.cardKey)).toEqual(['slow-bleed', 'arm'])
    expect(lubecCurrentValue(rested, 'Handle', lubecSheetModifiers(rested))).toBe(45)
  })

  it('sets a crushed hand\'s Handle to 10 with skill bonuses on top, then -40 after one rest and lasting -10 after two', async () => {
    const hurt = await onSheet('hand-L', 6)
    const hand = keyed(hurt, 'hand')
    expect(hand.steps.map((step) => step.until)).toEqual(['long-rest', 'long-rest', 'lasting'])
    expect(lubecCurrentValue(hurt, 'Handle', lubecSheetModifiers(hurt))).toBe(10)
    expect(lubecCheckTarget(hurt, 'Handle', 'Diving')).toBe(25)
    const once: LubecCharacterSheet = { ...hurt, effects: stepDownLubecEffect(hurt.effects, hand.id) }
    expect(lubecCurrentValue(once, 'Handle', lubecSheetModifiers(once))).toBe(15)
    const twice: LubecCharacterSheet = { ...once, effects: stepDownLubecEffect(once.effects, hand.id) }
    expect(lubecCurrentValue(twice, 'Handle', lubecSheetModifiers(twice))).toBe(45)
  })

  it('rolls a Catastrophic wound\'s 1d4 Dazed once and saves it, and holds its +4 Minimum Stress for the last step', async () => {
    const hurt = await onSheet('head', 6)
    expect(hurt.counters).toMatchObject({ trauma: 4, minimumStress: 2 })
    const dazed = keyed(hurt, 'dazed')
    expect(lubecEffectWound(dazed)!.dice['Dazed 1d4']).toHaveLength(1)
    expect(keyed(hurt, 'body').steps[2]).toMatchObject({ until: 'lasting', minimumStress: 4, modifiers: [{ target: 'Body', amount: -20 }, { target: 'Intellect', amount: -10 }] })
  })
})

describe('final Cutting fractions', () => {
  async function cutOnSheet(part: string, impact: number) {
    const cut = { ...swing(part, impact), impact: { ...swing(part, impact).impact!, table: 'cutting' } }
    const wound = readTableRow(fight(), cut, combatEntropy(command)).state.woundOutbox[0]
    const stored = { lubec: lubecCharacterSheet(), sheetRevision: 0 }
    const planned = planSheetIntention(stored, combatWoundIntention(stored, wound, 'fight', await combatWoundOperationId('fight', wound.id)))
    return parseLubecCharacter('roy', planned.mutation!.sheet as never).lubec
  }

  it('halves Handle from the uninjured value, then takes flat losses, the same in Core and in combat', async () => {
    const hurt = await cutOnSheet('upperarm-L', 10)
    const core = lubecSheetModifiers(hurt)
    const combat = combatInputModifiers(hurt, { fightId: 'fight', round: 3 })
    for (const modifiers of [core, combat]) {
      expect(lubecCurrentValue(hurt, 'Handle', modifiers)).toBe(27)
      expect(lubecCurrentValue(hurt, 'Speed', modifiers)).toBe(46)
      expect(lubecCurrentValue(hurt, 'Charm', modifiers)).toBe(43)
    }
    expect(lubecCheckTarget(hurt, 'Handle', 'Diving')).toBe(42)
  })

  it('takes a missing leg\'s Speed to one quarter, rounded down', async () => {
    const hurt = await cutOnSheet('thigh-R', 10)
    expect(lubecCurrentValue(hurt, 'Speed', lubecSheetModifiers(hurt))).toBe(14)
    expect(lubecCurrentValue(hurt, 'Speed', combatInputModifiers(hurt, { fightId: 'fight', round: 3 }))).toBe(14)
  })
})

describe('a wound queued before cards', () => {
  it('still delivers its one text effect under the operation id', async () => {
    const old: CombatWound = { id: 'old', target: { kind: 'npc', sheetId: 'roy' }, originatingRound: 1, effectiveRound: 2, traumaDelta: 1, stressDelta: 0, effect: { id: 'e', name: 'Bell rung', cause: 'row', steps: [{ modifiers: [], labels: ['Dazed'] }] } }
    const planned = planSheetIntention({ lubec: lubecCharacterSheet() }, combatWoundIntention({}, old, 'fight', 'op'))
    expect((planned.mutation!.sheet.lubec as LubecCharacterSheet).effects).toMatchObject([{ id: 'op', name: 'Bell rung', steps: [{ labels: ['Dazed'] }] }])
  })

  it('refuses cards without distinct keys before writing anything', () => {
    const wound = landed()
    const twice = { ...wound, effects: [wound.effects![0], wound.effects![0]] }
    expect(() => combatWoundIntention({}, twice, 'fight', 'op')).toThrow('distinct keys')
  })
})
