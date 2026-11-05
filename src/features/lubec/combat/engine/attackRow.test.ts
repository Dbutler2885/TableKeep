/**
 * Dodgeball rows after a hit, played through the engine with scripted dice: the
 * row each location and Impact reaches, the target's own Check or Save, the
 * row's catch alternatives, and the identified wound queued for the GM.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear } from '../../../ruleSets/lubec/gear/gearRecord'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { combatEntropy } from './commandEntropy'
import { planCombatCommand } from './lifecycle'
import type { CombatAuthority, CombatCommand, CombatPlan, CombatRecords, CombatSheet, CombatState } from './types'

const gm: CombatAuthority = { userId: 'gm', isGm: true }
const player: CombatAuthority = { userId: 'player', isGm: false }
const inHand = (id: string, name: string, slot: number, extra: Record<string, unknown> = {}) =>
  ({ id, kind: 'weapon', carrier: 'hands', slot, name, size: 1, qty: 1, weight: 'normal', note: '', ...extra })
const ball = (extra: Record<string, unknown> = {}) => inHand('ball', 'Dodgeball', 0, { mode: 'thrown', impact: 0, wounds: ['blunt'], table: 'dodgeball', catchChance: 50, catchPutsThrowerOut: true, qty: 2, ...extra })
const knife = inHand('knife', 'Knife', 1, { mode: 'melee', impact: 1, wounds: ['cut'] })
// A Working Kid's class adds 5 to Handle and Strength: Handle 45 reads 50, Strength 24 reads 29.
const base = (extra = {}) => ({ ...lubecCharacterSheet().base, Handle: 45, ...extra })
const heroSheet = (items: Record<string, unknown>[] = [ball(), knife]) => lubecCharacterSheet({ base: base(), skills: { free: 'Athletics', picked: ['Throwing Arm'] }, gear: parseLubecGear({ items }) })
const roySheet = (items: Record<string, unknown>[] = [], extra = {}) => lubecCharacterSheet({ base: base(extra), gear: parseLubecGear({ items }) })
const hero = (items?: Record<string, unknown>[]): CombatSheet => ({ kind: 'character', sheetId: 'hero', name: 'Wayne', ownerUserId: 'player', portraitPath: '', sheet: heroSheet(items), revision: 1 })
const roy = (items?: Record<string, unknown>[], extra = {}): CombatSheet => ({ kind: 'npc', sheetId: 'roy', name: 'Roy', ownerUserId: 'gm', portraitPath: '', sheet: roySheet(items, extra), revision: 1 })
const HERO = 'character:hero'
const ROY = 'npc:roy'

function envelope(state: CombatState | null, actorKey: string | null, id: string) {
  return {
    id, groupId: 'g', campaignId: 'c', fightId: 'fight', round: state?.round ?? 0, phase: state?.phase ?? 'setup',
    stageInstanceId: state?.stageInstanceId ?? 'setup', actorKey, interactionSequence: state?.combatants.find((entry) => entry.key === actorKey)?.interactionSequence ?? 0,
  }
}

function fight(sheets: CombatSheet[] = [hero(), roy()], armor: { locs: string[]; armor: Record<string, number> }[] = []): CombatRecords {
  const start: CombatCommand = { envelope: envelope(null, null, 'start'), seed: 's', payload: { type: 'start', combatants: sheets.map(({ kind, sheetId }) => ({ kind, sheetId })), floor: [], dodgeball: true } }
  const plan = planCombatCommand(start, { activeFightId: null, fight: null, sheets, items: new Map() }, gm)
  plan.fight.state.combatants = plan.fight.state.combatants.map((entry) => (entry.key === ROY ? { ...entry, armor: armor as never } : entry))
  return { activeFightId: 'fight', fight: plan.fight, sheets, items: new Map() }
}

type Dice = Partial<Record<'attack' | 'defense' | 'catch' | 'landing' | 'side' | 'strength', number>> & { check?: number[] }

/** Command-bound dice with each purpose scripted; an unscripted purpose fails the test. */
function scripted(command: CombatCommand, values: Dice) {
  const entropy = combatEntropy(command)
  const checks = [...(values.check ?? [])]
  return { ...entropy, die: (purpose: string) => { const value = purpose === 'check' ? checks.shift() : values[purpose as Exclude<keyof Dice, 'check'>]; if (value === undefined) throw new Error(`Unscripted ${purpose} die`); entropy.rolls.push({ purpose, ordinal: 0, value }); return value } }
}

type Step = { type: string; actor?: string | null; by?: CombatAuthority; dice?: Dice; [key: string]: unknown }
let counter = 0

function act(records: CombatRecords, { type, actor = null, by = gm, dice = {}, ...payload }: Step): { plan: CombatPlan; records: CombatRecords; rolls: unknown[] } {
  const command: CombatCommand = { envelope: envelope(records.fight!.state, actor, `${type}-${counter++}`), seed: 's', payload: { type, ...payload } }
  const entropy = scripted(command, dice)
  const plan = planCombatCommand(command, records, by, undefined, entropy)
  return { plan, records: { ...records, fight: plan.fight }, rolls: entropy.rolls }
}

const state = (records: CombatRecords) => records.fight!.state
const throwAt = { targetKey: ROY, weaponItemId: 'ball', attackId: 'throw', defense: null }

/** Wayne throws at Roy with Handle 50 + Throwing Arm 15 = 65, range 0, and rolls `die`. */
function thrown(die: number, records = fight(), aim: object = throwAt, range = true) {
  let current = act(records, { type: 'grant', combatantKey: HERO }).records
  current = act(current, { type: 'aim', actor: HERO, by: player, aim }).records
  if (range) current = act(current, { type: 'range', band: 'medium', modifier: 0 }).records
  return act(current, { type: 'roll', actor: HERO, by: player, aim, dice: { attack: die, landing: 40, side: 3 } })
}
const defend = (records: CombatRecords, split: object, dice: Dice) => act(records, { type: 'defend', actor: ROY, split, dice })


/** Wayne's throw lands undefended on the part a thrown-object d100 of `landing` reaches, with Impact quality + Strength tens. */
function rowAt(die: number, landing: number, side: number, strength: number, records = fight()) {
  const defended = defend(thrown(die, records).records, { amount: 0 }, { landing, side })
  const part = state(defended.records).attack!.landing!.start
  const placed = act(defended.records, { type: 'land', actor: HERO, by: player, part }).records
  return act(placed, { type: 'strength', actor: HERO, by: player, dice: { strength } })
}
const check = (records: CombatRecords, dice: number[], by = gm, actor = ROY) => act(records, { type: 'check', actor, by, dice: { check: dice } })
const royOf = (plan: CombatPlan) => plan.fight.state.combatants.find((entry) => entry.key === ROY)!
const wayneOf = (plan: CombatPlan) => plan.fight.state.combatants.find((entry) => entry.key === HERO)!

describe('automatic Dodgeball rows', () => {
  it('puts Roy Out and queues a Serious hand injury that keeps the struck hand, with no Handle modifier', () => {
    const { plan } = rowAt(60, 62, 1, 99)
    expect(plan.fight.state.attack).toMatchObject({ outcome: 'wounded', row: { group: 'hand', impact: 6, name: 'Sprained wrist', severity: 'Serious', trauma: 1 } })
    expect(royOf(plan).outReason).toBe('wound')
    const [wound] = plan.fight.state.woundOutbox
    expect(wound).toMatchObject({ traumaDelta: 1, stressDelta: 0, effectiveRound: 1, effect: { name: 'Sprained wrist', struckLocation: 'hand-L', duration: 'After 1 Long Rest: healed.' } })
    expect(wound.effect.steps).toEqual([{ modifiers: [], labels: ['-20 Handle on actions with this hand if dominant; -10 if other'] }])
  })

  it('puts the thrower Out too on a Headshot, and adds row Stress', () => {
    const headshot = rowAt(30, 5, 4, 99)
    expect(headshot.plan.fight.state.attack!.row!.name).toBe('Headshot')
    expect([royOf(headshot.plan).outReason, wayneOf(headshot.plan).outReason]).toEqual(['wound', 'wound'])
    const flying = rowAt(20, 5, 4, 99)
    expect(flying.plan.fight.state.woundOutbox[0]).toMatchObject({ stressDelta: 1, effect: { name: 'Glasses or hat knocked flying', steps: [{ modifiers: [], labels: [] }] } })
  })

  it('clamps an Impact above 6 to the 6+ row', () => {
    const { plan } = rowAt(60, 70, 2, 29)
    expect(plan.fight.state.attack).toMatchObject({ impact: { total: 8 }, row: { group: 'legs', impact: 6, name: 'Dead leg' } })
  })
})

describe('a row\'s Check or Save, rolled by the target', () => {
  it('asks Roy for the Body Save on Bell rung, and only he may roll it', () => {
    const { plan, records } = rowAt(60, 5, 4, 99)
    expect(plan.fight.state.attack).toMatchObject({ step: 'check', closed: false, row: { name: 'Bell rung', check: { kind: 'save', against: 'Body', advantage: 'normal' } } })
    expect(plan.fight.state.pendingActions).toEqual([{ combatantKey: ROY, action: 'save' }])
    expect(royOf(plan).outReason).toBeNull()
    expect(() => check(records, [1], player, HERO)).toThrow('belongs to someone else')
  })

  it('succeeds at or under the number and fails over it: only Dazed, or a Minor Concussion with Trauma', () => {
    const { records } = rowAt(60, 5, 4, 99)
    const target = check(records, [1]).plan.fight.state.attack!.check!.target
    const success = check(records, [target]).plan
    expect(success.fight.state.attack!.check).toMatchObject({ result: target, success: true, stress: 0 })
    expect(success.fight.state.woundOutbox[0]).toMatchObject({ traumaDelta: 0, stressDelta: 0, effect: { steps: [{ modifiers: [], labels: ['Dazed'] }] } })
    expect(royOf(success).outReason).toBe('wound')
    const failure = check(records, [target + 1]).plan
    expect(failure.fight.state.attack!.check).toMatchObject({ success: false, stress: 1 })
    expect(failure.fight.state.woundOutbox[0]).toMatchObject({ traumaDelta: 1, stressDelta: 1, effect: { steps: [{ modifiers: [{ target: 'Handle', amount: -10 }], labels: ['Dazed'] }] } })
    expect(failure.logs[0].roll).toMatchObject({ who: 'Roy', what: 'Body Save', target: `under ${target}`, tone: 'bad', result: 'Failure', extra: 'Bell rung' })
  })

  it('catches the ball on Trapped against the chest: it goes to Roy\'s hand and Wayne is Out instead', () => {
    const { plan, records } = rowAt(10, 30, 4, 99)
    expect(plan.fight.state.attack).toMatchObject({ step: 'check', row: { name: 'Trapped against the chest', check: { kind: 'stat-check', against: 'Handle' } } })
    expect(plan.fight.state.pendingActions).toEqual([{ combatantKey: ROY, action: 'check' }])
    const caught = check(records, [5]).plan
    expect(caught.fight.state.attack).toMatchObject({ outcome: 'row-caught', closed: true, detached: [] })
    expect([royOf(caught).outReason, wayneOf(caught).outReason]).toEqual([null, 'caught'])
    expect(caught.fight.state.floor).toEqual([])
    expect(caught.fight.state.woundOutbox).toEqual([])
    expect(caught.sheets).toEqual([{ selection: { kind: 'npc', sheetId: 'roy' }, gear: expect.objectContaining({ items: [expect.objectContaining({ name: 'Dodgeball', carrier: 'hands' })] }) }])
    const dropped = check(records, [99]).plan
    expect(royOf(dropped).outReason).toBe('wound')
    expect(dropped.fight.state.floor).toHaveLength(1)
    expect(dropped.fight.state.woundOutbox[0]).toMatchObject({ stressDelta: 1, traumaDelta: 0 })
  })

  it('keeps the worse of two dice on Fumbled catch\'s Disadvantage, and drops a row catch with no free hand', () => {
    const { records } = rowAt(20, 62, 1, 99)
    expect(state(records).attack!.row).toMatchObject({ name: 'Fumbled catch', check: { advantage: 'disadvantage' } })
    expect(check(records, [5, 90]).plan.fight.state.attack!.check).toMatchObject({ dice: [5, 90], result: 90, success: false })
    const busy = { ...records, sheets: [hero(), { ...roy(), sheet: roySheet([inHand('a', 'Radio', 0, { kind: 'thing' }), inHand('b', 'Radio', 1, { kind: 'thing' })]) }] }
    const held = check(busy, [5, 6]).plan
    expect(held.fight.state.attack!.outcome).toBe('row-caught')
    expect(held.sheets).toEqual([])
    expect(held.fight.state.floor).toHaveLength(1)
  })

  it('keeps the step and its rolls for a missing Body, rolling nothing', () => {
    const { records } = rowAt(60, 5, 4, 99)
    const holed = { ...records, sheets: [hero(), { ...roy(), sheet: roySheet([], { Body: null }) }] }
    const { plan, rolls } = check(holed, [])
    expect(rolls).toEqual([])
    expect(plan.fight.state.attack).toMatchObject({ step: 'check', repair: expect.stringContaining('Dodgeball Body') })
  })
})
