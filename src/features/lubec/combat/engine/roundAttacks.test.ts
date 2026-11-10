/**
 * Round attacks played through the engine with scripted dice: declared attacks
 * fastest first on the same result sequence as a Sneak Attack, Defense from the
 * declared line, choosing again when the target or weapon has gone, the next
 * round beginning by itself, and the GM taking people out and returning them.
 */
import { describe, expect, it } from 'vitest'
import { lubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import { parseLubecGear, type LubecItem } from '../../../ruleSets/lubec/gear/gearRecord'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { combatEntropy } from './commandEntropy'
import { planCombatCommand } from './lifecycle'
import type { CombatAuthority, CombatCommand, Combatant, CombatPlan, CombatRecords, CombatSheet, CombatState } from './types'

const gm: CombatAuthority = { userId: 'gm', isGm: true }
const player: CombatAuthority = { userId: 'player', isGm: false }
const HERO = 'character:hero'
const ROY = 'npc:roy'
const DALE = 'npc:dale'

const inHand = (id: string, name: string, slot: number, extra: Record<string, unknown> = {}) =>
  ({ id, kind: 'weapon', carrier: 'hands', slot, name, size: 1, qty: 1, weight: 'normal', note: '', ...extra })
const ball = (id = 'ball', slot = 0, extra: Record<string, unknown> = {}) =>
  inHand(id, 'Dodgeball', slot, { mode: 'thrown', impact: 0, wounds: ['blunt'], table: 'dodgeball', catchChance: 50, catchPutsThrowerOut: true, ...extra })
const knife = inHand('knife', 'Knife', 1, { mode: 'melee', impact: 1, wounds: ['cut'] })
// A Working Kid's class adds 5: Handle 45 reads 50, Speed 51 reads 56.
const base = { ...lubecCharacterSheet().base, Handle: 45, Speed: 51 }
const sheetOf = (sheetId: string, name: string, kind: 'character' | 'npc', items: Record<string, unknown>[] = [], revision = 1): CombatSheet => ({
  kind, sheetId, name, ownerUserId: kind === 'npc' ? 'gm' : 'player', portraitPath: '', revision,
  sheet: lubecCharacterSheet({ base, skills: { free: 'Athletics', picked: ['Throwing Arm'] }, gear: parseLubecGear({ items }) }),
})
const hero = (items: Record<string, unknown>[] = [ball('hero-ball'), knife]) => sheetOf('hero', 'Wayne', 'character', items)
const roy = (items: Record<string, unknown>[] = [ball('roy-ball')], revision = 1) => sheetOf('roy', 'Roy', 'npc', items, revision)
const dale = (items: Record<string, unknown>[] = []) => sheetOf('dale', 'Dale', 'npc', items)

/** One unplaced Floor record of `qty` dodgeballs. */
const floorBall = (id: string, qty = 1) => lubecDetachedItem(parseLubecGear({ items: [ball(id, 0, { qty })] }).items[0] as LubecItem, [])

function envelope(state: CombatState | null, actorKey: string | null, id: string) {
  return {
    id, groupId: 'g', campaignId: 'c', fightId: 'fight', round: state?.round ?? 0, phase: state?.phase ?? 'setup',
    stageInstanceId: state?.stageInstanceId ?? 'setup', actorKey, interactionSequence: state?.combatants.find((entry) => entry.key === actorKey)?.interactionSequence ?? 0,
  }
}

type Step = { type: string; actor?: string | null; by?: CombatAuthority; dice?: number[]; stage?: string; [key: string]: unknown }
let counter = 0

function act(records: CombatRecords, { type, actor = null, by = gm, dice = [], stage, ...payload }: Step): { plan: CombatPlan; records: CombatRecords } {
  const at = envelope(records.fight!.state, actor, `${type}-${counter++}`)
  const command: CombatCommand = { envelope: stage ? { ...at, stageInstanceId: stage } : at, seed: 's', payload: { type, ...payload } }
  const entropy = combatEntropy(command)
  const queue = [...dice]
  const scripted = { ...entropy, die: (purpose: string) => { const value = queue.shift(); if (value === undefined) throw new Error(`Unscripted ${purpose}`); return value } }
  const plan = planCombatCommand(command, records, by, undefined, scripted)
  return { plan, records: { ...records, fight: plan.fight } }
}

const state = (records: CombatRecords) => records.fight!.state
const who = (records: CombatRecords, key: string): Combatant => state(records).combatants.find((entry) => entry.key === key)!

/** Start, roll initiative (Dale 30, Roy 20, Wayne 10: fastest first Dale, Roy, Wayne) and arrive at round 1's Movement. */
function movement(sheets: CombatSheet[] = [hero(), roy(), dale()], floor = [floorBall('floor-ball')]): CombatRecords {
  const start: CombatCommand = { envelope: envelope(null, null, 'start'), seed: 's', payload: { type: 'start', combatants: sheets.map(({ kind, sheetId }) => ({ kind, sheetId })), floor: [], dodgeball: true } }
  let records: CombatRecords = { activeFightId: 'fight', fight: planCombatCommand(start, { activeFightId: null, fight: null, sheets, items: new Map() }, gm).fight, sheets, items: new Map() }
  records.fight!.state.floor = floor
  records = act(records, { type: 'begin' }).records
  records = act(records, { type: 'npcInitiative', dice: [20, 30] }).records
  return act(records, { type: 'initiative', actor: HERO, by: player, dice: [10] }).records
}

const stay = { choice: 'stay', pickup: null }
const everyone = (records = movement()) => {
  const moved = act(records, { type: 'move', actor: HERO, by: player, ...stay }).records
  return act(act(moved, { type: 'npcMovement', choices: { [ROY]: stay, [DALE]: stay } }).records, { type: 'settleMovement' }).records
}
const heroThrow = { targetKey: ROY, weaponItemId: 'hero-ball', attackId: 'throw', defense: { against: ROY, amount: 20 } }
const royThrow = { targetKey: HERO, weaponItemId: 'roy-ball', attackId: 'throw', defense: { against: HERO, amount: 20 } }
/** Wayne throws at Roy guarding Roy, Roy throws at Wayne guarding Wayne, Dale takes Full Defense against Wayne: Roy attacks first, then Wayne. */
function attacking(records = movement(), wayne: object = { aim: heroThrow }, roy: object = { aim: royThrow }) {
  let current = act(everyone(records), { type: 'declare', actor: HERO, by: player, ...wayne }).records
  current = act(current, { type: 'answerDeclaration', combatantKey: HERO, approve: true }).records
  current = act(current, { type: 'declare', actor: ROY, ...roy }).records
  return act(current, { type: 'declare', actor: DALE, full: true, against: HERO }).records
}
const ranged = (records: CombatRecords) => act(records, { type: 'range', band: 'medium', modifier: 0 }).records
/** The GM moves on from the Results of the attack just finished. */
const onward = (records: CombatRecords) => act(records, { type: 'continue' }).records
const roll = (records: CombatRecords, actor: string, aim: object, dice: number[], by = actor === HERO ? player : gm) => act(records, { type: 'roll', actor, by, aim, dice })

describe('declared attacks, fastest first', () => {
  it('opens the fastest attacker with the declared aim and frozen split, and asks the GM for this round\'s range', () => {
    const records = attacking()
    expect(state(records)).toMatchObject({ phase: 'attack', attacked: [ROY], attack: { attackerKey: ROY, grantId: null, step: 'aim', aim: royThrow, range: null, frozen: { attack: 45, total: 65 } } })
    expect(state(records).pendingActions).toEqual([{ combatantKey: ROY, action: 'attack' }, { combatantKey: ROY, action: 'range' }])
    expect(() => roll(records, ROY, royThrow, [10])).toThrow('Waiting for the GM to declare the range.')
    expect(() => roll(ranged(records), HERO, heroThrow, [10])).toThrow('That attack step belongs to someone else.')
  })

  it('holds a finished attack\'s Results until the GM moves on, then opens the next attacker with that result in view', () => {
    const first = ranged(attacking())
    const missed = roll(first, ROY, royThrow, [99])
    expect(state(missed.records)).toMatchObject({ attack: { attackerKey: ROY, outcome: 'miss', closed: true }, attacked: [ROY], pendingActions: [] })
    expect(() => act(missed.records, { type: 'continue', by: player })).toThrow('Only the GM can do that.')
    const moved = act(missed.records, { type: 'continue' })
    const next = state(moved.records)
    expect(next.attack).toMatchObject({ attackerKey: HERO, step: 'aim', aim: heroThrow })
    expect(next.attack!.id).not.toBe(state(first).attack!.id)
    expect(next.lastAttack).toMatchObject({ attackerKey: ROY, outcome: 'miss', closed: true, continued: true })
    expect(next.attacked).toEqual([ROY, HERO])
    expect(moved.plan.logs.at(-1)!.event).toBe("Wayne's turn to attack.")
    expect(() => act(moved.records, { type: 'continue' })).toThrow('There is no result waiting.')
    expect(() => act(first, { type: 'continue' })).toThrow('There is no result waiting.')
    expect(() => act(moved.records, { type: 'range', band: 'medium', modifier: 0, stage: 'the-first-attack' })).toThrow('That fight stage is stale.')
  })

  it('rolls Defense with the declared line naming the attacker, whatever split is sent', () => {
    const hit = roll(ranged(attacking()), ROY, royThrow, [10]).records
    expect(state(hit).attack).toMatchObject({ attackerKey: ROY, step: 'defense' })
    const { plan } = act(hit, { type: 'defend', actor: HERO, by: player, split: { amount: 0 }, dice: [5, 50] })
    expect(plan.fight.state.attack!.defense).toMatchObject({ amount: 20, full: false, value: 20, roll: 5, success: true })
  })

  it('lands a hit at once on a target whose line guards someone else, or who ran', () => {
    const elsewhere = attacking(movement(), { aim: heroThrow }, { aim: { ...royThrow, defense: null } })
    const hit = roll(ranged(onward(roll(ranged(elsewhere), ROY, { ...royThrow, defense: null }, [99]).records)), HERO, heroThrow, [10, 40, 3])
    expect(hit.plan.fight.state.attack).toMatchObject({ attackerKey: HERO, step: 'location' })
  })

  it('begins the next round at Movement once the GM moves on from the last attack', () => {
    const roy = onward(roll(ranged(attacking()), ROY, royThrow, [99]).records)
    const last = roll(ranged(roy), HERO, heroThrow, [99]).records
    expect(state(last)).toMatchObject({ phase: 'attack', round: 1, attack: { attackerKey: HERO, outcome: 'miss' } })
    const { plan } = act(last, { type: 'continue' })
    expect(plan.fight.state).toMatchObject({ phase: 'movement', round: 2, attack: null, attacked: [], lastAttack: { attackerKey: HERO, outcome: 'miss' } })
    expect(plan.fight.state.pendingActions!.map((entry) => entry.action)).toEqual(['movement', 'movement', 'movement'])
    expect(plan.logs.at(-1)!.event).toBe('Round 2, Movement.')
    expect(state(settled(confirmedAll(plan.fight))).lastAttack).toBeNull()
  })
})

const confirmedAll = (fight: CombatPlan['fight']) => {
  const records = { activeFightId: 'fight', fight, sheets: [hero(), roy(), dale()], items: new Map() } as CombatRecords
  return act(act(records, { type: 'move', actor: HERO, by: player, ...stay }).records, { type: 'npcMovement', choices: { [ROY]: stay, [DALE]: stay } }).records
}
const settled = (records: CombatRecords) => act(records, { type: 'settleMovement' }).records

describe('choosing again before the Roll', () => {
  const heroTurn = () => onward(roll(ranged(attacking()), ROY, royThrow, [99]).records)
  const knifeAt = (targetKey: string) => ({ targetKey, weaponItemId: 'knife', attackId: 'slash', defense: null })

  it('keeps the declaration locked while the target and weapon stand', () => {
    const turn = heroTurn()
    expect(() => act(turn, { type: 'aim', actor: HERO, by: player, aim: { ...heroThrow, targetKey: DALE } })).toThrow('Your declared target is still in the fight.')
    expect(() => act(turn, { type: 'aim', actor: HERO, by: player, aim: knifeAt(ROY) })).toThrow('Your declared weapon is still in hand.')
    expect(() => act(turn, { type: 'pass', actor: HERO, by: player })).toThrow('Pass is only for a target or a weapon that has gone.')
    expect(() => act(turn, { type: 'floorPickup', actor: HERO, by: player, itemId: 'floor-ball' })).toThrow('Your declared weapon is still in hand.')
  })

  it('reopens the target when it has gone, with the declared split kept', () => {
    const turn = act(heroTurn(), { type: 'takeOut', combatantKey: ROY }).records
    const { plan } = act(turn, { type: 'aim', actor: HERO, by: player, aim: { ...heroThrow, targetKey: DALE } })
    expect(plan.fight.state.attack).toMatchObject({ aim: { targetKey: DALE, defense: { against: ROY, amount: 20 } }, frozen: { attack: 45, total: 65 } })
    expect(act(turn, { type: 'pass', actor: HERO, by: player }).plan.fight.state.lastAttack).toMatchObject({ attackerKey: HERO, outcome: 'passed' })
  })

  it('offers what is still in hand, Fisticuffs or the Floor when the weapon has gone, with the declared split kept', () => {
    const turn = heroTurn()
    const unarmed = { ...turn, sheets: turn.sheets.map((sheet) => (sheet.sheetId === 'hero' ? hero([knife]) : sheet)) }
    const knifed = act(unarmed, { type: 'aim', actor: HERO, by: player, aim: { ...knifeAt(ROY), defense: heroThrow.defense } })
    expect(knifed.plan.fight.state.attack).toMatchObject({ aim: { weaponItemId: 'knife' }, frozen: { attack: 45, weaponName: 'Knife' } })
    const picked = act(unarmed, { type: 'floorPickup', actor: HERO, by: player, itemId: 'floor-ball' })
    expect(picked.plan.sheets![0].gear.items.map((item) => item.id)).toEqual(['knife', 'floor-ball'])
    expect(picked.plan.fight.state).toMatchObject({ phase: 'movement', lastAttack: { outcome: 'picked-up' } })
    expect(picked.plan.fight.state.floor.map((record) => record.item.id)).toEqual(['roy-ball'])
    expect(picked.plan.fight.state.combatants.find((entry) => entry.key === HERO)!.interactionSequence).toBe(1)
    expect(picked.plan.logs[0].event).toBe('Wayne picked up the Dodgeball, using the action.')
    const full = { ...turn, sheets: turn.sheets.map((sheet) => (sheet.sheetId === 'hero' ? hero([knife, { ...knife, id: 'knife-2', slot: 0 }]) : sheet)) }
    expect(() => act(full, { type: 'floorPickup', actor: HERO, by: player, itemId: 'floor-ball' })).toThrow('Wayne has no free hand for the Dodgeball.')
    expect(() => act({ ...turn, sheets: turn.sheets.filter((sheet) => sheet.sheetId !== 'hero') }, { type: 'pass', actor: HERO, by: player })).toThrow("Wayne's sheet is missing or unreadable")
  })

  it('is only for a declared attack', () => {
    let records = movement([hero(), roy()])
    records.fight!.state = { ...records.fight!.state, phase: 'before-initiative', round: 0 }
    records = act(records, { type: 'grant', combatantKey: HERO }).records
    expect(() => act(records, { type: 'pass', actor: HERO, by: player })).toThrow('Choosing again is for a declared attack.')
  })
})

describe('Out and Return', () => {
  it('is the GM\'s, refuses someone already Out or not Out, and names the sheet to repair', () => {
    const records = movement()
    expect(() => act(records, { type: 'takeOut', combatantKey: ROY, by: player })).toThrow('Only the GM')
    const out = act(records, { type: 'takeOut', combatantKey: ROY }).records
    expect(() => act(out, { type: 'takeOut', combatantKey: ROY })).toThrow('Roy is already Out.')
    expect(() => act(records, { type: 'return', combatantKey: ROY })).toThrow('Roy is not Out.')
    expect(() => act({ ...out, sheets: out.sheets.filter((sheet) => sheet.sheetId !== 'roy') }, { type: 'return', combatantKey: ROY })).toThrow("Roy's sheet is missing or unreadable")
  })

  it('stops a pending attack at once when its attacker goes Out, settling the thrown ball, and moves on', () => {
    const hit = roll(ranged(attacking()), ROY, royThrow, [10]).records
    const { plan } = act(hit, { type: 'takeOut', combatantKey: ROY })
    expect(plan.fight.state.lastAttack).toMatchObject({ attackerKey: ROY, outcome: 'interrupted', closed: true, detached: [] })
    expect(plan.fight.state.floor.map((record) => record.item.id)).toEqual(['floor-ball', 'roy-ball'])
    expect(plan.fight.state.attack).toMatchObject({ attackerKey: HERO, step: 'aim' })
    expect(plan.fight.state.combatants.find((entry) => entry.key === ROY)).toMatchObject({ outReason: 'gm', declaration: { stopped: true } })
    expect(plan.logs[0].event).toBe('The GM took Roy out of the fight.')
  })

  it('lands the hit when the defender goes Out at Defense, and drops the ball at the catch', () => {
    const hit = roll(ranged(attacking(movement([hero([ball('hero-ball')]), roy(), dale()]))), ROY, royThrow, [10]).records
    expect(act(hit, { type: 'takeOut', combatantKey: HERO, dice: [40, 3] }).plan.fight.state.lastAttack ?? null).toBeNull()
    const atDefense = act(hit, { type: 'takeOut', combatantKey: HERO, dice: [40, 3] }).plan.fight.state.attack
    expect(atDefense).toMatchObject({ attackerKey: ROY, step: 'location', defense: null })
    const caughtStep = act(hit, { type: 'defend', actor: HERO, by: player, dice: [15] }).records
    expect(state(caughtStep).attack!.step).toBe('catch')
    expect(act(caughtStep, { type: 'takeOut', combatantKey: HERO }).plan.fight.state.attack).toMatchObject({ attackerKey: ROY, outcome: 'dropped' })
    const location = act(hit, { type: 'defend', actor: HERO, by: player, dice: [99, 40, 3] }).records
    expect(act(location, { type: 'takeOut', combatantKey: HERO }).plan.fight.state.attack).toMatchObject({ attackerKey: ROY, step: 'location' })
  })

  it('skips anyone Out in every stage: Movement, Declare, initiative and the attack order', () => {
    const moving = act(movement(), { type: 'takeOut', combatantKey: HERO }).records
    expect(state(moving).pendingActions!.map((entry) => entry.combatantKey)).toEqual([ROY, DALE])
    const declaring = act(everyone(), { type: 'takeOut', combatantKey: HERO }).records
    expect(state(declaring).pendingActions).toEqual([{ combatantKey: ROY, action: 'declare' }])
    let rolling = movement()
    rolling.fight!.state = { ...rolling.fight!.state, phase: 'before-initiative', round: 0, order: undefined, combatants: rolling.fight!.state.combatants.map((entry) => ({ ...entry, initiative: null })) }
    rolling = act(rolling, { type: 'begin' }).records
    rolling = act(rolling, { type: 'npcInitiative', dice: [20, 30] }).records
    expect(act(rolling, { type: 'takeOut', combatantKey: HERO }).plan.fight.state).toMatchObject({ phase: 'movement', round: 1, order: [DALE, ROY] })
    const queued = act(ranged(attacking()), { type: 'takeOut', combatantKey: HERO }).records
    const afterRoy = act(queued, { type: 'pass', actor: ROY })
    expect(afterRoy.plan.fight.state).toMatchObject({ phase: 'movement', round: 2 })
  })

  it('rests at Movement with everyone Out until the GM ends it', () => {
    let records = movement()
    for (const key of [HERO, ROY, DALE]) records = act(records, { type: 'takeOut', combatantKey: key }).records
    expect(state(records)).toMatchObject({ phase: 'movement', movementComplete: false, pendingActions: [] })
    expect(() => act(records, { type: 'settleMovement' })).toThrow('Movement is not ready to settle.')
  })

  it('returns someone at the next stage: sitting out this Movement, with no attack once Declare has begun', () => {
    const moving = act(act(movement(), { type: 'takeOut', combatantKey: HERO }).records, { type: 'return', combatantKey: HERO })
    expect(moving.plan.fight.state.combatants[0]).toMatchObject({ outReason: null, movement: { choice: 'stay' } })
    expect(moving.plan.logs[0].event).toBe('The GM returned Wayne to the fight.')
    const declaring = act(act(everyone(), { type: 'takeOut', combatantKey: HERO }).records, { type: 'return', combatantKey: HERO }).records
    expect(who(declaring, HERO).declaration).toMatchObject({ stopped: true, aim: null })
    expect(state(declaring).pendingActions).toEqual([{ combatantKey: ROY, action: 'declare' }])
    const attacked = act(act(ranged(attacking()), { type: 'takeOut', combatantKey: HERO }).records, { type: 'return', combatantKey: HERO }).records
    expect(who(attacked, HERO).declaration).toMatchObject({ stopped: true, aim: heroThrow })
    expect(state(onward(roll(attacked, ROY, royThrow, [99]).records))).toMatchObject({ phase: 'movement', round: 2 })
  })

  it('waits for every wound due on the returning combatant to reach the sheet', () => {
    const out = act(movement(), { type: 'takeOut', combatantKey: HERO }).records
    out.fight!.state.woundOutbox = [{ id: 'w', target: { kind: 'character', sheetId: 'hero' }, originatingRound: 0, effectiveRound: 1, traumaDelta: 1, stressDelta: 0, effect: { id: 'e', name: 'Bonk', cause: 'row', steps: [] } }]
    expect(() => act(out, { type: 'return', combatantKey: HERO })).toThrow('Waiting for wounds to reach the sheet')
  })

  it('takes no Defense from a target whose declaration was stopped by going Out and coming back', () => {
    const turn = onward(roll(ranged(attacking()), ROY, royThrow, [99]).records)
    const back = act(act(turn, { type: 'takeOut', combatantKey: ROY }).records, { type: 'return', combatantKey: ROY }).records
    expect(roll(ranged(back), HERO, heroThrow, [10, 40, 3]).plan.fight.state.attack).toMatchObject({ attackerKey: HERO, step: 'location' })
  })

  it('leaves a granted attack still being aimed alone when someone else goes Out', () => {
    let records = movement([hero(), roy()])
    records.fight!.state = { ...records.fight!.state, phase: 'before-initiative', round: 0 }
    records = act(records, { type: 'grant', combatantKey: HERO }).records
    expect(act(records, { type: 'takeOut', combatantKey: ROY }).plan.fight.state.attack).toMatchObject({ attackerKey: HERO, step: 'aim', aim: null })
  })

  it('returns someone before initiative or during it as they are', () => {
    let records = movement([hero(), roy()])
    records.fight!.state = { ...records.fight!.state, phase: 'before-initiative', round: 0 }
    records = act(act(records, { type: 'takeOut', combatantKey: ROY }).records, { type: 'return', combatantKey: ROY }).records
    expect(who(records, ROY).outReason).toBeNull()
  })
})
