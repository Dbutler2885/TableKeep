/**
 * Initiative after the grants, played through the engine with scripted dice:
 * Begin Combat waits on every grant and pre-initiative wound, each player and
 * the GM roll once, the order builds by the rules, ties reroll by themselves,
 * and round 1's Movement begins when the last roll is in.
 */
import { describe, expect, it } from 'vitest'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { combatEntropy } from './commandEntropy'
import { settleInitiative } from './initiative'
import { planCombatCommand } from './lifecycle'
import type { CombatAuthority, CombatCommand, Combatant, CombatPlan, CombatRecords, CombatSheet, CombatState } from './types'

const gm: CombatAuthority = { userId: 'gm', isGm: true }
const player: CombatAuthority = { userId: 'player', isGm: false }
// Speed 51 reads 56 for a Working Kid.
const sheetOf = (sheetId: string, kind: 'character' | 'npc', ownerUserId: string, speed = 51, extra: Partial<ReturnType<typeof lubecCharacterSheet>> = {}): CombatSheet =>
  ({ kind, sheetId, name: sheetId, ownerUserId, portraitPath: '', revision: 2, sheet: lubecCharacterSheet({ base: { ...lubecCharacterSheet().base, Speed: speed }, ...extra }) })
const HERO = 'character:hero'

function envelope(state: CombatState | null, actorKey: string | null, id: string) {
  return { id, groupId: 'g', campaignId: 'c', fightId: 'fight', round: state?.round ?? 0, phase: state?.phase ?? 'setup', stageInstanceId: state?.stageInstanceId ?? 'setup', actorKey, interactionSequence: 0 }
}

function fight(sheets: CombatSheet[] = [sheetOf('hero', 'character', 'player'), sheetOf('roy', 'npc', 'gm', 31), sheetOf('dale', 'npc', 'gm', 41)]): CombatRecords {
  const start: CombatCommand = { envelope: envelope(null, null, 'start'), seed: 's', payload: { type: 'start', combatants: sheets.map(({ kind, sheetId }) => ({ kind, sheetId })), floor: [], dodgeball: true } }
  return { activeFightId: 'fight', fight: planCombatCommand(start, { activeFightId: null, fight: null, sheets, items: new Map() }, gm).fight, sheets, items: new Map() }
}

let counter = 0
function act(records: CombatRecords, type: string, { actor = null, by = gm, dice = [] as number[] }: { actor?: string | null; by?: CombatAuthority; dice?: number[] } = {}) {
  const command: CombatCommand = { envelope: envelope(records.fight!.state, actor, `${type}-${counter++}`), seed: 's', payload: { type } }
  const entropy = combatEntropy(command)
  const queue = [...dice]
  const scripted = { ...entropy, die: (purpose: string) => { const value = queue.shift(); if (value === undefined) throw new Error(`Unscripted ${purpose}`); entropy.rolls.push({ purpose, ordinal: 0, value }); return value } }
  const plan: CombatPlan = planCombatCommand(command, records, by, undefined, scripted)
  return { plan, records: { ...records, fight: plan.fight }, rolls: entropy.rolls }
}
const begun = (records = fight()) => act(records, 'begin').records

describe('Begin Combat - Roll Initiative', () => {
  it('asks everyone not Out to roll, once, on a new stage', () => {
    const records = fight()
    records.fight!.state.combatants[2].outReason = 'gm'
    const { plan } = act(records, 'begin')
    expect(plan.fight.state).toMatchObject({ phase: 'initiative', round: 0 })
    expect(plan.fight.state.stageInstanceId).not.toBe(records.fight!.state.stageInstanceId)
    expect(plan.fight.state.pendingActions).toEqual([{ combatantKey: HERO, action: 'initiative' }, { combatantKey: 'npc:roy', action: 'initiative' }])
    expect(plan.logs).toEqual([{ event: 'The GM pressed Roll Initiative.', actor: null }])
  })

  it('waits on an open grant and on any pre-initiative wound, and is the GM\'s alone', () => {
    const open = fight()
    open.fight!.state.attack = { id: 'a', grantId: 'g', attackerKey: HERO, step: 'aim', detached: [], closed: false }
    expect(() => act(open, 'begin')).toThrow('Finish the granted attack first.')
    const wounded = fight()
    wounded.fight!.state.woundOutbox = [{ id: 'w', target: { kind: 'npc', sheetId: 'roy' }, originatingRound: 0, effectiveRound: 1, traumaDelta: 1, stressDelta: 0, effect: { id: 'e', name: 'Bonk', cause: 'row', steps: [] } }]
    expect(() => act(wounded, 'begin')).toThrow('Wounds must reach the sheet before initiative.')
    expect(() => act(fight(), 'begin', { by: player })).toThrow('Only the GM')
    expect(() => act(begun(), 'begin')).toThrow('already been rolled')
  })

  it('blocks a further grant while a wound waits on its sheet', () => {
    const wounded = fight()
    wounded.fight!.state.woundOutbox = [{ id: 'w', target: { kind: 'npc', sheetId: 'roy' }, originatingRound: 0, effectiveRound: 1, traumaDelta: 1, stressDelta: 0, effect: { id: 'e', name: 'Bonk', cause: 'row', steps: [] } }]
    const grant: CombatCommand = { envelope: envelope(wounded.fight!.state, null, 'grant'), seed: 's', payload: { type: 'grant', combatantKey: HERO } }
    expect(() => planCombatCommand(grant, wounded, gm)).toThrow('Wounds must reach the sheet first.')
  })
})

describe('rolling initiative', () => {
  it('rolls strictly under Speed, freezes Speed and its revision, and logs a card', () => {
    const { plan } = act(begun(), 'initiative', { actor: HERO, by: player, dice: [56] })
    const hero = plan.fight.state.combatants.find((entry) => entry.key === HERO)!
    expect(hero).toMatchObject({ speed: 56, initiative: { roll: 56, speed: 56, success: false, sourceRevision: 2, ties: [] } })
    expect(plan.fight.state.pendingActions).toEqual([{ combatantKey: 'npc:roy', action: 'initiative' }, { combatantKey: 'npc:dale', action: 'initiative' }])
    expect(plan.logs[0].roll).toEqual({ who: 'hero', what: 'Initiative', roll: '56', target: 'under Speed 56', tone: 'bad', result: 'Failure' })
    expect(act(begun(), 'initiative', { actor: HERO, by: player, dice: [55] }).plan.fight.state.combatants[0].initiative!.success).toBe(true)
  })

  it('lets a player roll only their own, once, and only during initiative', () => {
    const records = begun()
    expect(() => act(records, 'initiative', { actor: 'npc:roy', by: player, dice: [1] })).toThrow('belongs to someone else')
    const rolled = act(records, 'initiative', { actor: HERO, by: player, dice: [10] }).records
    expect(() => act(rolled, 'initiative', { actor: HERO, by: player, dice: [10] })).toThrow('hero has already rolled or is Out.')
    expect(() => act(fight(), 'initiative', { actor: HERO, by: player, dice: [10] })).toThrow('Initiative is not being rolled.')
  })

  it('rolls every NPC with one GM action, then sets the order and starts round 1 Movement', () => {
    const records = act(begun(), 'initiative', { actor: HERO, by: player, dice: [38] }).records
    const { plan } = act(records, 'npcInitiative', { dice: [12, 83] })
    expect(plan.logs.map((log) => log.roll?.what ?? log.event)).toEqual(['Initiative (GM)', 'Initiative (GM)', 'Initiative is set. Round 1, Movement.'])
    expect(plan.fight.state).toMatchObject({ phase: 'movement', round: 1, pendingActions: [], order: [HERO, 'npc:roy', 'npc:dale'] })
    expect(() => act({ ...records, fight: plan.fight }, 'npcInitiative', { dice: [] })).toThrow('No NPC is waiting')
    expect(() => act(records, 'npcInitiative', { by: player })).toThrow('Only the GM')
  })

  it('puts successes before failures, higher successes and lower failures first, then higher Speed', () => {
    const sheets = [sheetOf('a', 'npc', 'gm', 61), sheetOf('b', 'npc', 'gm', 41), sheetOf('c', 'npc', 'gm', 31), sheetOf('d', 'npc', 'gm', 51), sheetOf('e', 'npc', 'gm', 21)]
    // Speeds read 66, 46, 36, 56, 26: rolls 44 ok, 30 ok, 71 fail, 83 fail, 30 fail.
    const { plan } = act(begun(fight(sheets)), 'npcInitiative', { dice: [44, 30, 71, 83, 30] })
    expect(plan.fight.state.order).toEqual(['npc:a', 'npc:b', 'npc:e', 'npc:c', 'npc:d'])
  })

  it('breaks an equal roll by higher Speed, and rerolls a tie that still stands, logging it', () => {
    const bySpeed = act(begun(fight([sheetOf('a', 'npc', 'gm', 41), sheetOf('b', 'npc', 'gm', 51)])), 'npcInitiative', { dice: [20, 20] }).plan
    expect(bySpeed.fight.state.order).toEqual(['npc:b', 'npc:a'])
    const tied = act(begun(fight([sheetOf('a', 'npc', 'gm', 41), sheetOf('b', 'npc', 'gm', 41)])), 'npcInitiative', { dice: [20, 20, 7, 7, 9, 3] }).plan
    expect(tied.fight.state.order).toEqual(['npc:a', 'npc:b'])
    expect(tied.fight.state.combatants.map((entry) => entry.initiative!.ties)).toEqual([[7, 9], [7, 3]])
    expect(tied.logs.filter((log) => log.event.startsWith('Tie')).map((log) => log.event)).toEqual(['Tie rerolled: a 07, b 07.', 'Tie rerolled: a 09, b 03.'])
  })

  it('reads canonical Speed with this fight\'s pre-initiative wounds, once their delivery revision is on the sheet', () => {
    const wound = { id: 'w', name: 'Clipped', cause: 'row', steps: [{ modifiers: [{ target: 'Speed', amount: -10 }], labels: [] }], combatOrigin: { fightId: 'fight', woundId: 'w', originatingRound: 0, effectiveRound: 1 } }
    const records = fight([sheetOf('hero', 'character', 'player', 51, { effects: [wound] as never })])
    records.fight!.state.woundAcknowledgements = [{ id: 'w', target: { kind: 'character', sheetId: 'hero' }, targetRevision: 2, originatingRound: 0, effectiveRound: 1, operationId: 'op' }]
    expect(act(begun(records), 'initiative', { actor: HERO, by: player, dice: [10] }).plan.fight.state.combatants[0].initiative!.speed).toBe(46)
    records.fight!.state.woundAcknowledgements[0].targetRevision = 3
    expect(() => act(begun(records), 'initiative', { actor: HERO, by: player, dice: [10] })).toThrow('Waiting for wounds to reach the sheet')
  })

  it('names a missing Speed instead of rolling', () => {
    const records = begun()
    const holed = { ...records, sheets: [sheetOf('hero', 'character', 'player', null as never), ...records.sheets.slice(1)] }
    expect(() => act(holed, 'initiative', { actor: HERO, by: player, dice: [10] })).toThrow('hero: missing Speed')
  })
})

describe('settling the order', () => {
  it('stops rerolling after a bounded number of rounds and keeps the order it has', () => {
    const tied = (key: string): Combatant => ({ key, kind: 'npc', sheetId: key, name: key, ownerUserId: 'gm', portraitPath: '', speed: 40, armor: [], interactionSequence: 0, outReason: null, initiative: { roll: 10, speed: 40, success: true, sourceRevision: 0, ties: [] } })
    const entropy = { ...combatEntropy({ envelope: { id: 'x' }, seed: 's', payload: { type: 'x' } } as CombatCommand), die: () => 5 }
    const settled = settleInitiative([tied('a'), tied('b')], entropy)
    expect(settled.order).toEqual(['a', 'b'])
    expect(settled.logs).toHaveLength(20)
  })
})
