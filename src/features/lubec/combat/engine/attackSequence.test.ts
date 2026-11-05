/**
 * The result sequence after a Sneak Attack hits, played through the engine with
 * scripted dice per purpose: the defender's grant-local Defense, the catch, the
 * landing and its move, Strength, and Impact with armor.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear } from '../../../ruleSets/lubec/gear/gearRecord'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { combatEntropy } from './commandEntropy'
import { armorAtPart, combatImpact } from './attackFlow'
import { lubecLandingPart, lubecPartDistances, lubecStartRegion, LUBEC_START_TABLES } from './hitLocation'
import { planCombatCommand } from './lifecycle'
import type { CombatAuthority, CombatCommand, CombatPlan, CombatRecords, CombatSheet, CombatState } from './types'

const gm: CombatAuthority = { userId: 'gm', isGm: true }
const player: CombatAuthority = { userId: 'player', isGm: false }
const inHand = (id: string, name: string, slot: number, extra: Record<string, unknown> = {}) =>
  ({ id, kind: 'weapon', carrier: 'hands', slot, name, size: 1, qty: 1, weight: 'normal', note: '', ...extra })
const ball = (extra: Record<string, unknown> = {}) => inHand('ball', 'Dodgeball', 0, { mode: 'thrown', impact: 0, wounds: ['blunt'], table: 'dodgeball', catchChance: 50, catchPutsThrowerOut: true, qty: 2, ...extra })
const knife = inHand('knife', 'Knife', 1, { mode: 'melee', impact: 1, wounds: ['cut'] })
const revolver = inHand('gun', 'Revolver', 1, { mode: 'firearm', impact: 2, capacity: 6, loaded: 1 })
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

type Dice = Partial<Record<'attack' | 'defense' | 'catch' | 'landing' | 'side' | 'strength', number>>

/** Command-bound dice with each purpose scripted; an unscripted purpose fails the test. */
function scripted(command: CombatCommand, values: Dice) {
  const entropy = combatEntropy(command)
  return { ...entropy, die: (purpose: string) => { const value = values[purpose as keyof Dice]; if (value === undefined) throw new Error(`Unscripted ${purpose} die`); entropy.rolls.push({ purpose, ordinal: 0, value }); return value } }
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

describe('the defender\'s grant-local Defense', () => {
  it('asks the target for Defense only after a hit, and spends nothing for round 1', () => {
    const { plan } = thrown(27)
    expect(plan.fight.state.attack).toMatchObject({ step: 'defense', roll: { quality: 2 } })
    expect(plan.fight.state.pendingActions).toEqual([{ combatantKey: ROY, action: 'defense' }])
    expect(plan.fight.state).toMatchObject({ round: 0, phase: 'before-initiative' })
  })

  it('takes off nothing on a failure, so the hit lands with its quality as reach', () => {
    const { plan } = defend(thrown(27).records, { amount: 20 }, { defense: 61, landing: 30, side: 4 })
    expect(plan.fight.state.attack).toMatchObject({ step: 'location', net: 2, defense: { amount: 20, value: 20, roll: 61, success: false, removes: 0 } })
    expect(plan.fight.state.attack!.landing).toEqual({ table: 'thrown', startRoll: 30, sideRoll: null, start: 'waist', part: null, moved: 0 })
    expect(plan.fight.state.pendingActions).toEqual([{ combatantKey: HERO, action: 'location' }])
    expect(plan.logs[0].roll).toMatchObject({ who: 'Roy', what: 'Defense roll', roll: '61', target: 'under 20', tone: 'ok', result: 'Fails · takes off nothing', extra: 'Quality 2 − 0 = 2' })
  })

  it('takes off its tens digit plus 1 on a success, and a hit with quality left still lands', () => {
    const { plan } = defend(thrown(37).records, { amount: 30 }, { defense: 9, landing: 52, side: 7 })
    expect(plan.fight.state.attack).toMatchObject({ step: 'location', net: 2, defense: { success: true, removes: 1 } })
    expect(plan.fight.state.attack!.landing).toMatchObject({ startRoll: 52, sideRoll: 7, start: 'upperarm-L' })
  })

  it('lets voluntary Full Defense put the whole pool on its +10, capped at 100', () => {
    const full = defend(thrown(27).records, { full: true }, { defense: 59, landing: 30 }).plan.fight.state.attack!.defense
    expect(full).toMatchObject({ amount: 50, full: true, value: 60, success: true, removes: 6 })
    const capped = fight([hero(), roy([], { Handle: 98 })])
    expect(defend(thrown(27, capped).records, { full: true }, { defense: 99 }).plan.fight.state.attack!.defense).toMatchObject({ amount: 100, value: 100, success: true })
  })

  it('rolls nothing for a Defense of 0, and refuses a split outside tens or over the pool', () => {
    const { plan, rolls } = defend(thrown(27).records, { amount: 0 }, { landing: 30 })
    expect(rolls.map((roll) => (roll as { purpose: string }).purpose)).toEqual(['landing'])
    expect(plan.fight.state.attack).toMatchObject({ step: 'location', net: 2, defense: null })
    expect(() => defend(thrown(27).records, { amount: 25 }, {})).toThrow('in tens')
    expect(() => defend(thrown(27).records, { amount: 60 }, {})).toThrow('within your Handle')
  })

  it('is the target\'s to roll, and keeps the step for a missing sheet', () => {
    const records = thrown(27).records
    expect(() => act(records, { type: 'defend', actor: HERO, by: player, split: { amount: 0 } })).toThrow('belongs to someone else')
    const { plan, rolls } = defend({ ...records, sheets: [hero()] }, { amount: 20 }, {})
    expect(rolls).toEqual([])
    expect(plan.fight.state.attack).toMatchObject({ step: 'defense', repair: expect.stringContaining("Roy's sheet") })
    expect(plan.fight.state.pendingActions).toEqual([{ combatantKey: ROY, action: 'defense' }])
  })
})

describe('the catch', () => {
  it('drops a ball Defense took to 0 when the catch fails: still a dodge, the ball on the Floor', () => {
    const stopped = defend(thrown(14).records, { amount: 20 }, { defense: 5 }).records
    expect(state(stopped).attack).toMatchObject({ step: 'catch', net: 0, catchChance: 50 })
    expect(state(stopped).pendingActions).toEqual([{ combatantKey: ROY, action: 'catch' }])
    const { plan } = act(stopped, { type: 'catch', actor: ROY, dice: { catch: 71 } })
    expect(plan.fight.state.attack).toMatchObject({ step: 'done', closed: true, outcome: 'dropped', catch: { chance: 50, roll: 71, success: false } })
    expect(plan.fight.state.floor.map((record) => record.item.name)).toEqual(['Dodgeball'])
    expect(plan.logs[0].roll).toMatchObject({ what: 'Catch roll', target: 'under 50%', tone: 'neutral', result: 'Dropped: still a dodge', extra: '50% + 10 × 0 below 0' })
  })

  it('catches a ball taken below 0: it goes to the catcher\'s free hand and the thrower is Out', () => {
    const stopped = defend(thrown(14).records, { amount: 20 }, { defense: 15 }).records
    expect(state(stopped).attack).toMatchObject({ net: -1, catchChance: 60 })
    const { plan } = act(stopped, { type: 'catch', actor: ROY, dice: { catch: 44 } })
    expect(plan.fight.state.attack).toMatchObject({ outcome: 'caught', detached: [], closed: true })
    expect(plan.fight.state.floor).toEqual([])
    expect(plan.fight.state.combatants.find((entry) => entry.key === HERO)!.outReason).toBe('caught')
    expect(plan.sheets).toEqual([{ selection: { kind: 'npc', sheetId: 'roy' }, gear: expect.objectContaining({ items: [expect.objectContaining({ name: 'Dodgeball', qty: 1, carrier: 'hands' })] }) }])
    expect(plan.logs[0].roll).toMatchObject({ result: 'Caught', tone: 'bad' })
  })

  it('caps the chance at 100 and leaves the thrower in when the item says nothing', () => {
    const records = fight([hero([ball({ catchChance: 90, catchPutsThrowerOut: false }), knife]), roy()])
    const stopped = defend(thrown(14, records).records, { amount: 50 }, { defense: 49 }).records
    expect(state(stopped).attack!.catchChance).toBe(100)
    const { plan } = act(stopped, { type: 'catch', actor: ROY, dice: { catch: 99 } })
    expect(plan.fight.state.combatants.find((entry) => entry.key === HERO)!.outReason).toBeNull()
  })

  it('offers no catch for an item at 0%, for a defender with no free hand, or for a blow up close', () => {
    const plain = fight([hero([ball({ catchChance: 0 }), knife]), roy()])
    expect(defend(thrown(14, plain).records, { amount: 20 }, { defense: 5 }).plan.fight.state.attack).toMatchObject({ outcome: 'dodged', closed: true })
    const busy = fight([hero(), roy([inHand('a', 'Radio', 0, { kind: 'thing' }), inHand('b', 'Radio', 1, { kind: 'thing' })])])
    expect(defend(thrown(14, busy).records, { amount: 20 }, { defense: 5 }).plan.fight.state.attack!.outcome).toBe('dodged')
    const slash = { targetKey: ROY, weaponItemId: 'knife', attackId: 'slash', defense: null }
    expect(defend(thrown(14, fight(), slash, false).records, { amount: 20 }, { defense: 5 }).plan.fight.state.attack!.outcome).toBe('dodged')
  })

  it('drops the ball without a roll when the catcher\'s hands filled after Defense', () => {
    const stopped = defend(thrown(14).records, { amount: 20 }, { defense: 5 }).records
    const full = { ...stopped, sheets: [hero(), roy([inHand('a', 'Radio', 0, { kind: 'thing' }), inHand('b', 'Radio', 1, { kind: 'thing' })])] }
    const { plan, rolls } = act(full, { type: 'catch', actor: ROY })
    expect(rolls).toEqual([])
    expect(plan.fight.state.attack!.outcome).toBe('dropped')
    expect(plan.fight.state.floor).toHaveLength(1)
  })

  it('keeps the catch step for a missing sheet, and the shared settlement clears it when the thrower goes Out', () => {
    const stopped = defend(thrown(14).records, { amount: 20 }, { defense: 5 }).records
    expect(act({ ...stopped, sheets: [hero()] }, { type: 'catch', actor: ROY }).plan.fight.state.attack).toMatchObject({ step: 'catch', repair: expect.any(String) })
    stopped.fight!.state.combatants = stopped.fight!.state.combatants.map((entry) => (entry.key === HERO ? { ...entry, outReason: 'gm' } : entry))
    const { plan } = act(stopped, { type: 'interrupt' })
    expect(plan.fight.state.attack).toMatchObject({ closed: true, detached: [] })
    expect(plan.fight.state.floor).toHaveLength(1)
  })
})

describe('the landing, Strength and Impact', () => {
  const landed = (die = 27, records = fight(), aim: object = throwAt, landing = 30) =>
    defend(thrown(die, records, aim).records, { amount: 0 }, { landing, side: 4 }).records

  it('moves the hit up to its reach, one step a quality, and refuses beyond it', () => {
    const records = landed()
    expect(() => act(records, { type: 'land', actor: HERO, by: player, part: 'head' })).toThrow('out of reach')
    const { plan } = act(records, { type: 'land', actor: HERO, by: player, part: 'thigh-L' })
    expect(plan.fight.state.attack).toMatchObject({ step: 'strength', landing: { start: 'waist', part: 'thigh-L', moved: 1 } })
    expect(plan.fight.state.pendingActions).toEqual([{ combatantKey: HERO, action: 'strength' }])
    expect(plan.logs).toEqual([{ event: "It hits Roy's left thigh, moved 1.", actor: HERO }])
  })

  it('adds a successful Strength roll\'s tens digit at or under Strength, and nothing over it', () => {
    const placed = act(landed(), { type: 'land', actor: HERO, by: player, part: 'waist' }).records
    const at = act(placed, { type: 'strength', actor: HERO, by: player, dice: { strength: 29 } }).plan
    expect(at.fight.state.attack!.strength).toEqual({ roll: 29, strength: 29, success: true, bonus: 2 })
    expect(at.logs[0].roll).toMatchObject({ what: 'Strength roll', target: 'under 29', tone: 'ok', result: 'Adds +2 Impact' })
    const over = act(placed, { type: 'strength', actor: HERO, by: player, dice: { strength: 30 } }).plan
    expect(over.fight.state.attack!.strength).toMatchObject({ success: false, bonus: 0 })
    expect(over.logs[0].roll!.result).toBe('Adds nothing')
  })

  it('leaves a positive Dodgeball Impact pending its table, with the ball still in flight', () => {
    const placed = act(landed(), { type: 'land', actor: HERO, by: player, part: 'waist' }).records
    const { plan } = act(placed, { type: 'strength', actor: HERO, by: player, dice: { strength: 24 } })
    expect(plan.fight.state.attack).toMatchObject({ step: 'wound', outcome: 'pending-wound', closed: false, impact: { quality: 2, base: 0, strength: 2, moved: 0, armor: 0, total: 4, table: 'dodgeball' } })
    expect(plan.fight.state.attack!.detached).toHaveLength(1)
    expect(plan.logs.at(-1)!.event).toBe('Impact 4 = quality 2 +0 base +2 Strength − 0 moved − 0 armor.')
  })

  it('takes moved steps and armor off, and an Impact of 0 or less is no wound', () => {
    const armored = fight([hero(), roy()], [{ locs: ['thigh-L'], armor: { blunt: 2, cut: 0, pierce: 0, gun: 0 } }])
    const placed = act(landed(27, armored), { type: 'land', actor: HERO, by: player, part: 'thigh-L' }).records
    const { plan } = act(placed, { type: 'strength', actor: HERO, by: player, dice: { strength: 90 } })
    expect(plan.fight.state.attack).toMatchObject({ outcome: 'no-wound', closed: true, impact: { moved: 1, armor: 2, total: -1 } })
    expect(plan.fight.state.floor).toHaveLength(1)
  })

  it('records a table not wired yet for the GM, changing no sheet', () => {
    const slash = { targetKey: ROY, weaponItemId: 'knife', attackId: 'slash', defense: null }
    // A slash's d100 of 30 lands on the torso.
    const placed = act(defend(thrown(27, fight(), slash, false).records, { amount: 0 }, { landing: 30 }).records, { type: 'land', actor: HERO, by: player, part: 'torso' }).records
    const { plan } = act(placed, { type: 'strength', actor: HERO, by: player, dice: { strength: 10 } })
    expect(plan.fight.state.attack).toMatchObject({ outcome: 'manual', closed: true, impact: { total: 4, table: 'cutting' } })
    expect(plan.sheets).toBeUndefined()
  })

  it('lands a firearm hit at once, skips Defense and Strength, and goes to the table', () => {
    const shoot = { targetKey: ROY, weaponItemId: 'gun', attackId: 'shoot', defense: null }
    const records = fight([hero([ball(), revolver]), roy()])
    const { plan } = thrown(13, records, shoot)
    expect(plan.fight.state.attack).toMatchObject({ step: 'location', net: 1, landing: { table: 'firearm', startRoll: 40, start: 'waist' } })
    const { plan: hit } = act({ ...records, fight: plan.fight }, { type: 'land', actor: HERO, by: player, part: 'waist' })
    expect(hit.fight.state.attack).toMatchObject({ outcome: 'manual', impact: { strength: null, total: 3, table: 'gunshot' } })
  })

  it('lands a quality 0 hit with no Defense, with no reach to move it', () => {
    const records = landed(9)
    expect(state(records).attack).toMatchObject({ net: 0, landing: { start: 'waist' } })
    expect(() => act(records, { type: 'land', actor: HERO, by: player, part: 'torso' })).toThrow('out of reach')
  })

  it('keeps the Strength step for a missing Strength, rolling nothing', () => {
    const placed = act(landed(), { type: 'land', actor: HERO, by: player, part: 'waist' }).records
    const holed = { ...placed, sheets: [{ ...hero(), sheet: { ...heroSheet(), base: { ...heroSheet().base, Strength: null } } }, roy()] }
    const { plan, rolls } = act(holed, { type: 'strength', actor: HERO, by: player })
    expect(rolls).toEqual([])
    expect(plan.fight.state.attack).toMatchObject({ step: 'strength', repair: expect.stringContaining('missing Strength') })
  })
})

describe('hit location data', () => {
  it('maps every d100 on every start table to a region, the tables summing to 100', () => {
    for (const [table, { w }] of Object.entries(LUBEC_START_TABLES)) {
      expect(w.reduce((sum, weight) => sum + weight, 0)).toBe(100)
      expect(Array.from({ length: 100 }, (_, roll) => lubecStartRegion(table, roll + 1)).every(Boolean)).toBe(true)
    }
    expect([lubecStartRegion('punch', 40), lubecStartRegion('punch', 41), lubecStartRegion('thrown', 100)]).toEqual(['head', 'neck', 'feet'])
  })

  it('takes an odd side as left and an even one as right, only for paired parts', () => {
    expect([lubecLandingPart('hand', 1), lubecLandingPart('hand', 10), lubecLandingPart('torso', 3)]).toEqual(['hand-L', 'hand-R', 'torso'])
  })

  it('walks the body tree from where a hit lands', () => {
    expect(lubecPartDistances('torso')).toMatchObject({ torso: 0, neck: 1, head: 2, 'upperarm-L': 1, 'hand-R': 3, waist: 1, 'feet-L': 4 })
    expect(Object.keys(lubecPartDistances('head'))).toHaveLength(17)
  })

  it('reads armor on a part from the public summary, and Impact from its parts', () => {
    expect(armorAtPart([{ locs: ['torso'], armor: { blunt: 2, cut: 1, pierce: 0, gun: 0 } }], 'torso', 'cut')).toBe(1)
    expect(armorAtPart([], 'torso', 'cut')).toBe(0)
  })
})

describe('impact maths', () => {
  it('builds Impact from quality left, base, Strength, moved steps and armor', () => {
    const attack = { frozen: { choice: { impact: 1, armor: 'blunt', wound: 'thrown' } }, net: 3, landing: { part: 'torso', moved: 1 } } as never
    expect(combatImpact(attack, [{ locs: ['torso'], armor: { blunt: 1, cut: 0, pierce: 0, gun: 0 } }], 2)).toEqual({ quality: 3, base: 1, strength: 2, moved: 1, armor: 1, total: 4, table: 'thrown' })
  })
})
