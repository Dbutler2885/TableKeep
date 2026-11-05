/**
 * A Sneak Attack played through the engine with scripted dice: the GM grants it,
 * the attacker picks, splits and aims, the GM declares a range, and one Roll
 * spends, rolls and persists the next step.
 */
import { describe, expect, it } from 'vitest'
import { parseLubecGear } from '../../../ruleSets/lubec/gear/gearRecord'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { combatAttackReading, combatAttackSkill } from './attackMath'
import { combatEntropy } from './commandEntropy'
import { planCombatCommand } from './lifecycle'
import type { CombatAuthority, CombatCommand, CombatPlan, CombatRecords, CombatSheet, CombatState } from './types'

const gm: CombatAuthority = { userId: 'gm', isGm: true }
const player: CombatAuthority = { userId: 'player', isGm: false }
const inHand = (id: string, name: string, slot: number, extra: Record<string, unknown> = {}) =>
  ({ id, kind: 'weapon', carrier: 'hands', slot, name, size: 1, qty: 1, weight: 'normal', note: '', ...extra })
const ball = inHand('ball', 'Dodgeball', 0, { mode: 'thrown', impact: 0, wounds: ['blunt'], table: 'dodgeball', catchChance: 50, qty: 2 })
const revolver = inHand('gun', 'Revolver', 1, { mode: 'firearm', impact: 2, capacity: 6, loaded: 1, ranges: [{ band: 'short', modifier: 10, distance: 'across the room' }] })
// A Working Kid's class adds 5 Handle, so a base of 45 reads as 50.
const heroSheet = (items: Record<string, unknown>[] = [ball]) => lubecCharacterSheet({ base: { ...lubecCharacterSheet().base, Handle: 45 }, skills: { free: 'Athletics', picked: ['Throwing Arm'] }, gear: parseLubecGear({ items }) })
const sheet = (overrides: Partial<CombatSheet> = {}): CombatSheet => ({ kind: 'character', sheetId: 'hero', name: 'Wayne', ownerUserId: 'player', portraitPath: '', sheet: heroSheet(), revision: 4, ...overrides })
const rival = () => sheet({ sheetId: 'rival', name: 'Dottie', ownerUserId: 'other' })
const roy = () => sheet({ kind: 'npc', sheetId: 'roy', name: 'Roy', ownerUserId: 'gm', sheet: lubecCharacterSheet() })
const HERO = 'character:hero'
const ROY = 'npc:roy'

function envelope(state: CombatState | null, actorKey: string | null, id: string) {
  return {
    id, groupId: 'group', campaignId: 'campaign', fightId: 'fight', round: state?.round ?? 0, phase: state?.phase ?? 'setup',
    stageInstanceId: state?.stageInstanceId ?? 'setup', actorKey, interactionSequence: state?.combatants.find((entry) => entry.key === actorKey)?.interactionSequence ?? 0,
  }
}

/** A fight with Wayne, Dottie and Roy, Before initiative. */
function fight(): CombatRecords {
  const sheets = [sheet(), rival(), roy()]
  const start: CombatCommand = { envelope: envelope(null, null, 'start'), seed: 'seed', payload: { type: 'start', combatants: sheets.map(({ kind, sheetId }) => ({ kind, sheetId })), floor: [], dodgeball: true } }
  const plan = planCombatCommand(start, { activeFightId: null, fight: null, sheets, items: new Map() }, gm)
  return { activeFightId: 'fight', fight: plan.fight, sheets, items: new Map() }
}

/** Command-bound dice, with the attack die scripted. */
function dice(command: CombatCommand, value: number) {
  const entropy = combatEntropy(command)
  return { ...entropy, die: (purpose: string, sides: number) => { entropy.rolls.push({ purpose, ordinal: 0, value }); return value + 0 * sides } }
}

type Step = { type: string; actor?: string | null; by?: CombatAuthority; die?: number; [key: string]: unknown }

function act(records: CombatRecords, { type, actor = null, by = gm, die = 50, ...payload }: Step): { plan: CombatPlan; records: CombatRecords; rolls: unknown[] } {
  const command: CombatCommand = { envelope: envelope(records.fight!.state, actor, `${type}-${Math.random()}`), seed: 'seed', payload: { type, ...payload } }
  const entropy = dice(command, die)
  const plan = planCombatCommand(command, records, by, undefined, entropy)
  return { plan, records: { ...records, fight: plan.fight }, rolls: entropy.rolls }
}

const state = (records: CombatRecords) => records.fight!.state
const throwAtRoy = { targetKey: ROY, weaponItemId: 'ball', attackId: 'throw', defense: { against: ROY, amount: 20 } }
const granted = (records = fight()) => act(records, { type: 'grant', combatantKey: HERO }).records
const aimed = (aim: object = throwAtRoy, records = granted()) => act(records, { type: 'aim', actor: HERO, by: player, aim }).records
const ranged = (records = aimed(), extra: object = { band: 'medium', modifier: -10 }) => act(records, { type: 'range', ...extra }).records
const rolled = (records: CombatRecords, die: number, aim: object = throwAtRoy) => act(records, { type: 'roll', actor: HERO, by: player, die, aim })

describe('granting a Sneak Attack', () => {
  it('opens one persisted attack for the granted person and asks them to attack', () => {
    const { plan } = act(fight(), { type: 'grant', combatantKey: HERO })
    expect(plan.fight.state.attack).toMatchObject({ attackerKey: HERO, step: 'aim', closed: false, detached: [], aim: null, range: null, roll: null })
    expect(plan.fight.state.attack!.id).not.toBe(plan.fight.state.attack!.grantId)
    expect(plan.fight.state.pendingActions).toEqual([{ combatantKey: HERO, action: 'attack' }])
    expect(plan.fight.state).toMatchObject({ round: 0, phase: 'before-initiative' })
    expect(plan.logs).toEqual([{ event: 'The GM granted Wayne a Sneak Attack.', actor: null }])
  })

  it('refuses a second grant while one is unresolved, a player granting, and a grant to someone Out', () => {
    expect(() => act(granted(), { type: 'grant', combatantKey: ROY })).toThrow('Finish the granted attack first.')
    expect(() => act(fight(), { type: 'grant', combatantKey: HERO, by: player })).toThrow('Only the GM')
    const out = fight()
    out.fight!.state.combatants[2].outReason = 'gm'
    expect(() => act(out, { type: 'grant', combatantKey: ROY })).toThrow('Roy is Out.')
  })

  it('refuses a grant once initiative has begun', () => {
    const later = fight()
    later.fight!.state.phase = 'initiative'
    expect(() => act(later, { type: 'grant', combatantKey: HERO })).toThrow('only before initiative')
  })
})

describe('aiming the granted attack', () => {
  it('freezes the attack Handle with Throwing Arm, the named Defense line and the sheet revision', () => {
    const attack = state(aimed()).attack!
    expect(attack.aim).toEqual(throwAtRoy)
    expect(attack.frozen).toMatchObject({ handle: 50, skill: { name: 'Throwing Arm', bonus: 15 }, total: 65, attack: 45, sourceRevision: 4, weaponName: 'Dodgeball' })
    expect(attack.frozen!.choice).toMatchObject({ id: 'throw', ranged: true })
    expect(state(aimed()).pendingActions).toEqual([{ combatantKey: HERO, action: 'attack' }, { combatantKey: HERO, action: 'range' }])
  })

  it('never lets a player aim at or defend against another player', () => {
    expect(() => aimed({ ...throwAtRoy, targetKey: 'character:rival' })).toThrow('Wayne cannot aim at Dottie.')
    expect(() => aimed({ ...throwAtRoy, defense: { against: 'character:rival', amount: 20 } })).toThrow('cannot aim at Dottie')
  })

  it('splits Handle in tens and leaves some for the attack', () => {
    expect(() => aimed({ ...throwAtRoy, defense: { against: ROY, amount: 15 } })).toThrow('in tens')
    expect(() => aimed({ ...throwAtRoy, defense: { against: ROY, amount: 70 } })).toThrow('Leave some of your Handle')
    expect(state(aimed({ ...throwAtRoy, defense: null })).attack!.frozen!.attack).toBe(65)
  })

  it('refuses a weapon that cannot make that attack, someone else answering, and an incomplete aim', () => {
    expect(() => aimed({ ...throwAtRoy, weaponItemId: 'gone' })).toThrow('cannot make that attack now')
    expect(() => act(granted(), { type: 'aim', actor: HERO, by: { userId: 'other', isGm: false }, aim: throwAtRoy })).toThrow('belongs to someone else')
    expect(() => aimed({ targetKey: ROY })).toThrow('Pick a target, a weapon and an attack.')
  })

  it('keeps the declared range when only the split changes, and clears it when the use changes', () => {
    const declared = ranged()
    expect(state(aimed({ ...throwAtRoy, defense: null }, declared)).attack!.range).toEqual({ band: 'medium', modifier: -10 })
    const punch = { targetKey: ROY, weaponItemId: 'fisticuffs', attackId: 'punch', defense: null }
    expect(state(aimed(punch, declared)).attack!.range).toBeNull()
  })
})

describe('the GM declaring the range', () => {
  it('takes a typed modifier for a band the weapon does not number, remembers the band, and logs it', () => {
    const { plan } = act(aimed(), { type: 'range', band: 'long', modifier: -20 })
    expect(plan.fight.state.attack!.range).toEqual({ band: 'long', modifier: -20 })
    expect(plan.fight.state.lastRanges).toEqual({ [HERO]: 'long' })
    expect(plan.fight.state.pendingActions).toEqual([{ combatantKey: HERO, action: 'attack' }])
    expect(plan.logs[0].event).toBe('The GM declared Long range for Wayne: −20 to the attack.')
  })

  it("uses the weapon's own number for a band it has", () => {
    const gunAim = { targetKey: ROY, weaponItemId: 'gun', attackId: 'shoot', defense: null }
    const records = aimed(gunAim, granted(withHeroItems([ball, revolver])))
    expect(state(ranged(records, { band: 'short', modifier: -50 })).attack!.range).toEqual({ band: 'short', modifier: 10 })
  })

  it('is the GM\'s alone, needs a band, a number and a ranged attack', () => {
    expect(() => act(aimed(), { type: 'range', band: 'medium', modifier: 0, by: player })).toThrow('Only the GM')
    expect(() => act(aimed(), { type: 'range', band: 'close', modifier: 0 })).toThrow('Short, Medium, Long or Extreme')
    expect(() => act(aimed(), { type: 'range', band: 'medium' })).toThrow('Type the Handle modifier')
    const punch = { targetKey: ROY, weaponItemId: 'fisticuffs', attackId: 'punch', defense: null }
    expect(() => act(aimed(punch), { type: 'range', band: 'medium', modifier: 0 })).toThrow('No ranged attack')
  })
})

function withHeroItems(items: Record<string, unknown>[]): CombatRecords {
  const records = fight()
  return { ...records, sheets: [sheet({ sheet: heroSheet(items) }), rival(), roy()] }
}

describe('rolling the granted attack', () => {
  it('waits for the range and refuses a Roll for choices that changed', () => {
    expect(() => rolled(aimed(), 10)).toThrow('Waiting for the GM to declare the range.')
    expect(() => rolled(ranged(), 10, { ...throwAtRoy, defense: null })).toThrow('Your choices changed.')
    expect(() => rolled(granted(), 10)).toThrow('Pick a target, a weapon and an attack first.')
  })

  it('misses: one ball leaves the hand at the Roll and lands on the Floor, and the attack completes', () => {
    const { plan, rolls } = rolled(ranged(), 40)
    const { attack, floor, combatants, pendingActions } = plan.fight.state
    expect(rolls).toEqual([{ purpose: 'attack', ordinal: 0, value: 40 }])
    expect(attack).toMatchObject({ step: 'done', closed: true, detached: [], roll: { roll: 40, attackNumber: 35, hit: false, critical: false, quality: null } })
    expect(floor.map((record) => [record.item.qty, record.item.name])).toEqual([[1, 'Dodgeball']])
    expect(floor[0].item.id).not.toBe('ball')
    expect(plan.sheets).toEqual([{ selection: { kind: 'character', sheetId: 'hero' }, gear: expect.objectContaining({ items: [expect.objectContaining({ id: 'ball', qty: 1, carrier: 'hands' })] }) }])
    expect(combatants.find((entry) => entry.key === HERO)!.interactionSequence).toBe(1)
    expect(pendingActions).toEqual([])
    expect(plan.fight.state).toMatchObject({ round: 0, phase: 'before-initiative' })
    expect(plan.logs).toEqual([{
      event: 'Wayne attacked Roy.', actor: HERO,
      roll: { who: 'Wayne', what: 'Attack roll (before initiative)', roll: '40', target: 'against 35', tone: 'bad', result: 'Miss', extra: "Dodgeball thrown at Roy; it has left Wayne's hand." },
    }])
  })

  it('hits: quality is the tens digit, the ball stays in flight, and Defense comes next for the target', () => {
    const { plan } = rolled(ranged(), 27)
    const { attack, floor, pendingActions } = plan.fight.state
    expect(attack).toMatchObject({ step: 'defense', closed: false, roll: { hit: true, critical: false, quality: 2 } })
    expect(attack!.detached.map((record) => record.item.qty)).toEqual([1])
    expect(floor).toEqual([])
    expect(pendingActions).toEqual([{ combatantKey: ROY, action: 'defense' }])
    expect(plan.logs[0].roll).toMatchObject({ tone: 'ok', result: 'Hit · Quality 2' })
  })

  it('takes the attack number\'s tens digit on a successful double', () => {
    const { plan } = rolled(ranged(), 22)
    expect(plan.fight.state.attack!.roll).toEqual({ roll: 22, attackNumber: 35, hit: true, critical: true, quality: 3 })
    expect(plan.logs[0].roll!.result).toBe('Hit · Quality 3 (critical)')
  })

  it('rolls an attack number at or below 0, and misses', () => {
    const { plan } = rolled(ranged(aimed(), { band: 'extreme', modifier: -60 }), 1)
    expect(plan.fight.state.attack!.roll).toMatchObject({ attackNumber: -15, hit: false })
  })

  it('needs no range and spends nothing for a blow up close', () => {
    const punch = { targetKey: ROY, weaponItemId: 'fisticuffs', attackId: 'punch', defense: null }
    const { plan } = rolled(aimed(punch), 30, punch)
    expect(plan.sheets).toEqual([])
    expect(plan.fight.state.attack).toMatchObject({ step: 'defense', detached: [], roll: { attackNumber: 50, quality: 3 } })
  })

  it('spends a firearm round and goes to the location, with no Defense', () => {
    const gunAim = { targetKey: ROY, weaponItemId: 'gun', attackId: 'shoot', defense: null }
    const records = ranged(aimed(gunAim, granted(withHeroItems([ball, revolver]))), { band: 'short' })
    const { plan } = rolled(records, 5, gunAim)
    expect(plan.sheets![0].gear.items.find((item) => item.id === 'gun')!.loaded).toBe(0)
    expect(plan.fight.state.attack!.step).toBe('location')
    expect(plan.fight.state.pendingActions).toEqual([{ combatantKey: HERO, action: 'location' }])
    const empty = { ...records, sheets: [sheet({ sheet: heroSheet([ball, { ...revolver, loaded: 0 }]) }), rival(), roy()] }
    expect(() => rolled(empty, 5, gunAim)).toThrow('No round is loaded.')
  })

  it('refuses when the weapon has left the hand or the target has gone Out', () => {
    const records = ranged()
    expect(() => rolled({ ...records, sheets: [sheet({ sheet: heroSheet([]) }), rival(), roy()] }, 10)).toThrow('no longer in hand')
    records.fight!.state.combatants[2].outReason = 'gm'
    expect(() => rolled(records, 10)).toThrow('cannot aim at Roy')
  })

  it('lets the GM grant again, to the same person, once the attack has completed', () => {
    const done = rolled(ranged(), 90).records
    expect(state(act(done, { type: 'grant', combatantKey: HERO }).records).attack).toMatchObject({ attackerKey: HERO, step: 'aim', closed: false })
  })
})

describe('a missing input at an owned step', () => {
  it('keeps the attack and step, rolls nothing, spends nothing, and names the repair', () => {
    const records = ranged()
    const { plan, rolls } = rolled({ ...records, sheets: [rival(), roy()] }, 10)
    expect(rolls).toEqual([])
    expect(plan.sheets).toBeUndefined()
    expect(plan.fight.state.attack).toMatchObject({ id: state(records).attack!.id, step: 'aim', range: { band: 'medium' }, repair: "Wayne's sheet is missing or unreadable; restore it, then try again." })
    expect(plan.logs).toHaveLength(1)
  })

  it('names a missing Handle, logs the same repair once, and resumes the same step once repaired', () => {
    const records = ranged()
    const holed = { ...records, sheets: [sheet({ sheet: { ...heroSheet(), base: { ...heroSheet().base, Handle: null } } }), rival(), roy()] }
    const first = rolled(holed, 10)
    expect(first.plan.fight.state.attack!.repair).toMatch(/^Wayne: missing attack\/Check Handle; repair/)
    expect(rolled({ ...first.records, sheets: holed.sheets }, 10).plan.logs).toEqual([])
    const resumed = rolled({ ...first.records, sheets: records.sheets }, 10).plan
    expect(resumed.fight.state.attack).toMatchObject({ id: state(records).attack!.id, step: 'defense', repair: null })
  })

  it('opens a repair while aiming too, without freezing anything', () => {
    const records = granted()
    const { plan } = act({ ...records, sheets: [rival(), roy()] }, { type: 'aim', actor: HERO, by: player, aim: throwAtRoy })
    expect(plan.fight.state.attack).toMatchObject({ aim: null, frozen: null, repair: expect.stringContaining('missing or unreadable') })
  })
})

describe('reading an attack from a sheet', () => {
  const kickSheet = (picked: string[]) => lubecCharacterSheet({ skills: { free: 'Athletics', picked }, gear: parseLubecGear({ items: [inHand('a', 'Radio', 0, { kind: 'thing' }), inHand('b', 'Radio', 1, { kind: 'thing' })] }) })

  it('lets only a trained fighter Kick with both hands full, adding the fighting skill', () => {
    expect(combatAttackReading(kickSheet([]), [], 'fisticuffs', 'kick')).toBeNull()
    expect(combatAttackReading(kickSheet(['Scrapping']), [], 'fisticuffs', 'kick')).toMatchObject({ choice: { id: 'kick' }, skill: { name: 'Scrapping', bonus: 10 } })
    expect(combatAttackReading(kickSheet(['Scrapping']), [], 'fisticuffs', 'punch')).toBeNull()
  })

  it('reads nothing while the attack Handle is a hole, and adds no skill the sheet lacks', () => {
    const heavy = lubecCharacterSheet({ base: { ...lubecCharacterSheet().base, Strength: null }, gear: parseLubecGear({ items: [inHand('rock', 'Rock', 0, { mode: 'thrown', minStrength: 40 })] }) })
    expect(combatAttackReading(heavy, [], 'rock', 'throw')).toBeNull()
    expect(combatAttackSkill(lubecCharacterSheet(), 'shooting')).toBeNull()
  })
})

describe('refusing stale or misdirected acts', () => {
  it('refuses an act on no attack, an unknown person, and a missing aim', () => {
    expect(() => act(fight(), { type: 'aim', actor: HERO, by: player, aim: throwAtRoy })).toThrow('There is no attack waiting.')
    expect(() => act(fight(), { type: 'grant', combatantKey: 'npc:nobody' })).toThrow('That person is not in this fight.')
    expect(() => act(granted(), { type: 'aim', actor: HERO, by: player })).toThrow('Pick a target, a weapon and an attack.')
    expect(() => act(rolled(ranged(), 27).records, { type: 'roll', actor: HERO, by: player, aim: throwAtRoy })).toThrow('That attack step is stale.')
  })

  it("refuses the GM answering one combatant's attack as another", () => {
    expect(() => act(granted(), { type: 'aim', actor: ROY, aim: throwAtRoy })).toThrow('That attack step belongs to someone else.')
  })

  it('refuses an aim once the attack has completed, and a range with no attack aiming', () => {
    expect(() => act(rolled(ranged(), 90).records, { type: 'aim', actor: HERO, by: player, aim: throwAtRoy })).toThrow('There is no attack waiting.')
    expect(() => act(fight(), { type: 'range', band: 'short', modifier: 0 })).toThrow('No ranged attack')
  })

  it('reads a sheet with no stored revision as revision 0, and an attack stored before ranges as unranged', () => {
    const legacy = granted()
    legacy.sheets = [sheet({ revision: undefined }), rival(), roy()]
    const { range: _range, ...unranged } = legacy.fight!.state.attack!
    legacy.fight!.state.attack = { ...unranged, aim: throwAtRoy }
    const attack = state(aimed(throwAtRoy, legacy)).attack!
    expect(attack).toMatchObject({ frozen: { sourceRevision: 0 }, range: null })
  })

  it('calls an attack roll in a round by its plain name', () => {
    const later = ranged()
    later.fight!.state.round = 1
    expect(rolled(later, 90).plan.logs[0].roll!.what).toBe('Attack roll')
  })
})
