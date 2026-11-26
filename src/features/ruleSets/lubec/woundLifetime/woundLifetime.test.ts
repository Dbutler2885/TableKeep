import { describe, expect, it } from 'vitest'
import type { LubecEffect, LubecEffectStep } from '../effects'
import type { LubecWoundRolled } from '../woundCards'
import type { LubecWoundCardSpec, LubecWoundNow, LubecWoundOutcome } from '../woundTables/outcome'
import { closeWoundLifetimes, endWoundRound, landWoundLifetime, readWoundLifetime, tickWoundLifetimes, type LandingInput } from '.'

// A wound's lifetime through the module's own interface: the rounds it takes
// when it lands, the fight's watch on it, each round's end on the sheet, the
// fight's close, and how its cards read. Stored cards are written as a sheet
// holds them, including older and unusual ones, which must keep behaving as
// they always have.

const source = {
  table: 'blunt', tableName: 'Blunt Force', location: 'head', part: 'head', impact: 6, severity: 'Serious' as const,
  row: 'Rung bell', prose: 'Rung bell.', branch: null, contentVersion: 'test', dice: { 'Dazed 1d4': [2] }, checks: [], trauma: 1, stress: 0, minimumStress: 0,
}

type At = LandingInput['at']
const before = (round: number): At => ({ round, actionTaken: false })
const after = (round: number): At => ({ round, actionTaken: true })
const outcome = (now: LubecWoundNow[], cards: LubecWoundCardSpec[] = []): LubecWoundOutcome => ({ now, cards })
const land = (landed: LubecWoundOutcome, rolled: LubecWoundRolled = {}, at: At = null) =>
  landWoundLifetime({ outcome: landed, context: { source, cause: 'Blunt Force, head, Impact 6: Serious Rung bell', rolled }, at })
const labelsOf = (cards: readonly LubecEffect[]) => cards.map((card) => card.steps[0].labels[0])

const origin = (round: number, fightId = 'fight', effectiveRound = round) => ({ fightId, woundId: `w${round}`, originatingRound: round, effectiveRound })
const step = (until: string, extra: object = {}) => ({ modifiers: [], labels: [], until, ...extra })
const stored = <T extends object>(id: string, steps: object[], extra: T = {} as T) => ({ id, name: 'Wound', cause: 'Fight fight: Cutting', combatOrigin: origin(3), steps, ...extra })
const tick = (effects: unknown, round: number) => tickWoundLifetimes({ effects, fightId: 'fight', round })
const close = (effects: unknown, round: number) => closeWoundLifetimes({ effects, fightId: 'fight', round })
const view = (effect: object, at: { fightId: string; round: number } | null = null) => readWoundLifetime({ effect: effect as LubecEffect, at })

function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) frozen(child)
    Object.freeze(value)
  }
  return value
}

const NOTHING = { changes: [], traumaDelta: 0, bleeding: [], critical: [] }

describe('a wound landing outside a fight\'s rounds', () => {
  it.each([
    [{ kind: 'lose-movement' }, {}, 'Lose the next Movement Stage'],
    [{ kind: 'lose-action' }, {}, 'Lose the next Action Stage, Defense with it'],
    [{ kind: 'dazed', turns: 1 }, {}, 'Lose the next Movement and Action Stages'],
    [{ kind: 'dazed', turns: '1d4' }, { dazed: 3 }, 'Lose the next 3 Movement and 3 Action Stages (1d4 = 3)'],
    [{ kind: 'dazed', turns: '1d4' }, { dazed: 1 }, 'Lose the next Movement and Action Stages (1d4 = 1)'],
  ] as const)('names the Stages %o costs without rounds, and gives the fight nothing', (now, rolled, words) => {
    const plan = land(outcome([now as LubecWoundNow]), rolled)
    expect(labelsOf(plan.cards)).toEqual([words])
    expect(plan.cards[0].lost).toBeUndefined()
    expect(plan.public).toBeNull()
  })
})

describe('a wound landing in a fight\'s round', () => {
  it('gives a daze rolled before the target\'s Action the same rounds on its card and in the fight', () => {
    const plan = land(outcome([{ kind: 'dazed', turns: '1d4' }]), { dazed: 2 }, before(3))
    const lost = { movement: [4, 5], action: [3, 4] }
    expect(plan.cards).toHaveLength(1)
    expect(plan.cards[0]).toMatchObject({ cardKey: 'dazed', part: 'Dazed', lost, steps: [{ until: 'rounds', labels: ['Action + Defense lost in rounds 3, 4; Movement lost in rounds 4, 5 (1d4 = 2)'] }] })
    expect(plan.public).toEqual({ losses: [{ rounds: lost, reason: 'Dazed' }], unconscious: false, outOfReach: false, watchThrough: 5, countdowns: [] })
  })

  it('says only the rounds of a lost Movement Stage, as its card already says Movement lost', () => {
    expect(labelsOf(land(outcome([{ kind: 'lose-movement' }]), {}, before(1)).cards)).toEqual(['Round 2'])
  })

  it.each([
    ['a rolled daze of 1 before the Action', { kind: 'dazed', turns: '1d4' }, { dazed: 1 }, before(3), { movement: [4], action: [3] }],
    ['a rolled daze of 2 before the Action', { kind: 'dazed', turns: '1d4' }, { dazed: 2 }, before(3), { movement: [4, 5], action: [3, 4] }],
    ['a rolled daze of 2 after the Action', { kind: 'dazed', turns: '1d4' }, { dazed: 2 }, after(3), { movement: [4, 5], action: [4, 5] }],
    ['a one-turn daze, whatever was rolled', { kind: 'dazed', turns: 1 }, { dazed: 3 }, before(3), { movement: [4], action: [3] }],
    ['a lost Action before the Action', { kind: 'lose-action' }, {}, before(3), { movement: [], action: [3] }],
    ['a lost Action after the Action', { kind: 'lose-action' }, {}, after(3), { movement: [], action: [4] }],
    ['a lost Movement', { kind: 'lose-movement' }, {}, before(3), { movement: [4], action: [] }],
    ['a lost Action in round 0, before any Action', { kind: 'lose-action' }, {}, before(0), { movement: [], action: [1] }],
    ['a daze in round 0', { kind: 'dazed', turns: 1 }, {}, before(0), { movement: [1], action: [1] }],
  ] as const)('takes fixed rounds for %s', (_, now, rolled, at, rounds) => {
    const plan = land(outcome([now as LubecWoundNow]), rolled, at)
    expect(plan.cards[0].lost).toEqual(rounds)
    expect(plan.public!.losses.map((loss) => loss.rounds)).toEqual([rounds])
    expect(plan.public!.watchThrough).toBe(Math.max(...rounds.movement, ...rounds.action))
  })

  it('knocks down by taking this round\'s Action only while it is still to come, after the other losses', () => {
    const down = outcome([{ kind: 'lose-movement' }, { kind: 'knocked-down' }])
    expect(land(down, {}, before(3)).public!.losses).toEqual([
      { rounds: { movement: [4], action: [] }, reason: 'Movement lost' },
      { rounds: { movement: [], action: [3] }, reason: 'Knocked down' },
    ])
    expect(land(down, {}, after(3)).public!.losses.map((loss) => loss.reason)).toEqual(['Movement lost'])
    expect(land(down, {}, before(0)).public!.losses.map((loss) => loss.reason)).toEqual(['Movement lost'])
    const card = land(outcome([{ kind: 'knocked-down' }]), {}, before(3))
    expect(card.cards).toMatchObject([{ cardKey: 'down', steps: [{ until: 'combat-end', restrictions: [{ kind: 'down' }] }] }])
    expect(card.cards[0].lost).toBeUndefined()
    expect(card.public!.watchThrough).toBeNull()
  })

  it('keeps losses in consequence order, a repeated kind keeping its first place', () => {
    const plan = land(outcome([{ kind: 'lose-action' }, { kind: 'dazed', turns: 1 }, { kind: 'lose-action' }, { kind: 'knocked-down' }]), {}, before(2))
    expect(plan.public!.losses.map((loss) => loss.reason)).toEqual(['Action lost', 'Dazed', 'Knocked down'])
    expect(plan.cards.map((card) => card.cardKey)).toEqual(['action', 'dazed', 'action', 'down'])
  })

  it('tells the fight of unconsciousness and of reach, which leave the stages to the fight', () => {
    const plan = land(outcome([{ kind: 'unconscious' }, { kind: 'out-of-reach' }]), { minutes: [4, 9] }, before(2))
    expect(plan.public).toMatchObject({ losses: [], unconscious: true, outOfReach: true, watchThrough: null })
    expect(plan.cards).toMatchObject([{ cardKey: 'unconscious', steps: [{ until: 'by-hand', labels: ['Clear by hand: 2d10 = 4 + 9 = 13 minutes'] }] }])
  })

  it('starts each countdown the Save did not stop from the landing round, never using that round up', () => {
    const plan = land(outcome([]), { timers: [{ kind: 'bleed', rounds: 2 }, { kind: 'critical', rounds: 1 }] }, before(3))
    expect(plan.cards).toMatchObject([
      { cardKey: 'bleed', part: 'Bleeding', countdown: { kind: 'bleed', rounds: 2 }, steps: [{ until: 'rounds', labels: ['+1 Trauma in d4 = 2 rounds'] }] },
      { cardKey: 'critical', part: 'Critical', countdown: { kind: 'critical', rounds: 1 }, steps: [{ until: 'rounds', labels: ['Death Save in d4 = 1 round'] }] },
    ])
    expect(plan.public).toMatchObject({
      watchThrough: 5,
      countdowns: [{ wound: 'Rung bell', kind: 'bleed', dueRound: 5 }, { wound: 'Rung bell', kind: 'critical', dueRound: 4 }],
    })
  })

  it('watches a brief window through the next round, and the latest of a wound\'s ends', () => {
    const brief: LubecWoundCardSpec = { key: 'flinch', part: 'Flinch', steps: [{ until: 'next-round-end', rolls: [{ scope: 'attacks', mode: 'disadvantage' }] }] }
    expect(land(outcome([], [brief]), {}, before(0)).public!.watchThrough).toBe(1)
    expect(land(outcome([], [brief]), {}, after(4)).public!.watchThrough).toBe(5)
    expect(land(outcome([], [brief]), { timers: [{ kind: 'bleed', rounds: 3 }] }, before(4)).public!.watchThrough).toBe(7)
  })

  it('carries the wound\'s snapshot on every card, never changing it, and lands the same way twice', () => {
    const input: LandingInput = frozen({ outcome: outcome([{ kind: 'dazed', turns: '1d4' }], [{ key: 'arm', part: 'Arm', steps: [{ until: 'long-rest' }] }]), context: { source, cause: 'c', rolled: { dazed: 2 } }, at: before(3) })
    const plan = landWoundLifetime(input)
    expect(plan.cards.map((card) => card.wound)).toEqual([{ ...source, groupId: '' }, { ...source, groupId: '' }])
    expect(landWoundLifetime(input)).toEqual(plan)
  })

  it('refuses a landing round or a daze that cannot be', () => {
    expect(() => land(outcome([]), {}, before(-1))).toThrow('round -1')
    expect(() => land(outcome([]), {}, before(1.5))).toThrow('round 1.5')
    expect(() => land(outcome([{ kind: 'dazed', turns: '1d4' }]), { dazed: 0 })).toThrow('0 turns')
    expect(() => land(outcome([{ kind: 'dazed', turns: '1d4' }]), { dazed: 5 }, before(1))).toThrow('5 turns')
  })
})

describe('the end of a fight\'s round', () => {
  const combatants = [{ key: 'a', name: 'Ada' }, { key: 'b', name: 'Bo' }]

  it('ticks every watched combatant still in the fight, drops what is over, and announces what falls due now', () => {
    const plan = endWoundRound(frozen({
      round: 3, combatants,
      roundWatch: { b: 5, gone: 4, a: 3, old: 2 },
      countdowns: [{ key: 'a', wound: 'Cut', kind: 'bleed', dueRound: 3 }, { key: 'gone', wound: 'Stab', kind: 'critical', dueRound: 3 }, { key: 'b', wound: 'Gash', kind: 'bleed', dueRound: 5 }, { key: 'a', wound: 'Old', kind: 'bleed', dueRound: 2 }],
    }))
    expect(plan).toEqual({
      tickKeys: ['b', 'a'],
      roundWatch: { b: 5, gone: 4 },
      countdowns: [{ key: 'b', wound: 'Gash', kind: 'bleed', dueRound: 5 }],
      due: [{ key: 'a', name: 'Ada', wound: 'Cut', kind: 'bleed' }, { key: 'gone', name: 'Someone', wound: 'Stab', kind: 'critical' }],
    })
  })

  it('ticks a watched combatant in a round where nothing of theirs ends yet', () => {
    expect(endWoundRound({ round: 4, combatants, roundWatch: { a: 5 }, countdowns: undefined })).toEqual({ tickKeys: ['a'], roundWatch: { a: 5 }, countdowns: [], due: [] })
  })

  it('reads a fight with no watches or countdowns yet', () => {
    expect(endWoundRound({ round: 1, combatants, roundWatch: undefined, countdowns: undefined })).toEqual({ tickKeys: [], roundWatch: {}, countdowns: [], due: [] })
  })
})

describe('a round\'s end on the sheet', () => {
  const brief = (id: string, round: number, extra: object = {}) =>
    stored(id, [step('next-round-end', { rolls: [{ scope: 'attacks', mode: 'disadvantage' }] })], { combatOrigin: origin(round), keep: 'me', ...extra })

  it('ends a brief window from round R at the end of R+1, and not before, including a round-0 wound', () => {
    const card = brief('a', 2)
    expect(tick([card], 2)).toEqual(NOTHING)
    expect(tick([card], 3)).toEqual({ ...NOTHING, changes: [{ kind: 'remove', id: 'a', before: card }] })
    expect(tick([brief('z', 0)], 0)).toEqual(NOTHING)
    expect(tick([brief('z', 0)], 1).changes).toHaveLength(1)
  })

  it('steps a card down to its next step, keeping that step whole, and leaves hand-made cards and other fights alone', () => {
    const later = step('long-rest', { modifiers: [{ target: 'Handle', amount: -10 }], extra: 'kept' })
    const twoStep = brief('b', 1, { steps: [...brief('b', 1).steps, later] })
    const handMade = { id: 'note', name: 'Sunburn', cause: '', steps: [step('next-round-end')] }
    const plan = tick(frozen([twoStep, handMade, brief('other', 1, { combatOrigin: origin(1, 'elsewhere') })]), 2)
    expect(plan.changes).toEqual([{ kind: 'set', id: 'b', field: 'steps', before: { exists: true, value: twoStep.steps }, value: [later] }])
  })

  it('keeps Dazed until its last lost stage passes, then ends it', () => {
    const dazed = stored('dazed', [step('rounds')], { lost: { movement: [4, 5], action: [3, 4] } })
    expect(tick([dazed], 4)).toEqual(NOTHING)
    expect(tick([dazed], 5).changes).toEqual([{ kind: 'remove', id: 'dazed', before: dazed }])
  })

  it('fires a countdown once at the end of its due round, catching up on a late tick, with +1 Trauma for a bleed', () => {
    const bleed = stored('bleed', [step('rounds', { labels: ['+1 Trauma in d4 = 1 round'] })], { name: 'Long chest cut', countdown: { kind: 'bleed', rounds: 1, note: 'kept' } })
    expect(tick([bleed], 3)).toEqual(NOTHING)
    const fired = {
      changes: [
        { kind: 'set', id: 'bleed', field: 'countdown', before: { exists: true, value: bleed.countdown }, value: { kind: 'bleed', rounds: 1, note: 'kept', fired: true, firedRound: 4 } },
        { kind: 'set', id: 'bleed', field: 'steps', before: { exists: true, value: bleed.steps }, value: [{ modifiers: [], labels: ['+1 Trauma added at the end of round 4'], until: 'by-hand' }] },
      ],
      traumaDelta: 1, bleeding: [{ id: 'bleed', name: 'Long chest cut' }], critical: [],
    }
    expect(tick([bleed], 4)).toEqual(fired)
    expect(tick([bleed], 6).changes[0]).toMatchObject({ value: { fired: true, firedRound: 6 } })
    expect(tick([{ ...bleed, countdown: { kind: 'bleed', rounds: 1, fired: true, firedRound: 4 } }], 5)).toEqual(NOTHING)
  })

  it('keeps two countdowns from one Save apart, a Critical falling due as a reminder without Trauma', () => {
    const cards = [stored('b', [step('rounds')], { combatOrigin: origin(2), countdown: { kind: 'bleed', rounds: 2 } }), stored('c', [step('rounds')], { combatOrigin: origin(2), countdown: { kind: 'critical', rounds: 1 } })]
    expect(tick(cards, 3)).toMatchObject({ traumaDelta: 0, bleeding: [], critical: [{ id: 'c', name: 'Wound' }] })
    expect(tick(cards, 4)).toMatchObject({ traumaDelta: 1, bleeding: [{ id: 'b' }], critical: [{ id: 'c' }] })
  })

  it('names a due card without a name as a wound, and puts step-downs before countdowns', () => {
    const due = { ...stored('c', [step('rounds')], { countdown: { kind: 'critical', rounds: 1 } }), name: undefined }
    const plan = tick([due, brief('w', 3)], 4)
    expect(plan.critical).toEqual([{ id: 'c', name: 'A wound' }])
    expect(plan.changes.map((change) => [change.id, change.kind === 'set' ? change.field : 'remove'])).toEqual([['w', 'remove'], ['c', 'countdown'], ['c', 'steps']])
  })

  it('runs countdowns on an unconscious combatant and leaves the unconsciousness itself alone', () => {
    const sleep = stored('sleep', [step('by-hand', { restrictions: [{ kind: 'unconscious' }] })])
    expect(tick([sleep, stored('b', [step('rounds')], { countdown: { kind: 'bleed', rounds: 1 } })], 4)).toMatchObject({ traumaDelta: 1, changes: [{ id: 'b' }, { id: 'b' }] })
  })

  it('changes nothing on a sheet with no readable cards, or on cards it cannot name or run', () => {
    for (const effects of [undefined, null, 'cards', {}, []]) expect(tick(effects, 9)).toEqual(NOTHING)
    const unnamed = { ...brief('x', 1), id: undefined }
    const numbered = { ...brief('x', 1), id: 7 }
    const kindless = stored('k', [step('rounds')], { countdown: { rounds: 1 } })
    const dieWords = stored('d', [step('rounds')], { countdown: { kind: 'bleed', rounds: 'd4' } })
    const partLost = stored('p', [step('rounds')], { lost: { movement: [3] } })
    expect(tick([unnamed, numbered, 'card', kindless, dieWords, partLost], 9)).toEqual(NOTHING)
  })

  it('reads each kind of round metadata on its own, as older mixed cards always have', () => {
    const mixed = stored('m', [step('rounds')], { lost: { movement: [4], action: [4] }, countdown: { kind: 'bleed', rounds: 1 } })
    expect(tick([mixed], 4).changes.map((change) => change.kind === 'set' ? change.field : 'remove')).toEqual(['remove', 'countdown', 'steps'])
  })

  it('leaves converted lost stages alone but still ends a converted brief window of the same fight', () => {
    // Preserved as found: only the lost-stage reading asks about conversion. Whether a converted window
    // can reach a tick at all is to be reproduced before this is changed.
    expect(tick([stored('l', [step('by-hand')], { lost: { movement: [4], action: [4] }, afterCombat: null })], 5)).toEqual(NOTHING)
    expect(tick([{ ...brief('w', 3), afterCombat: { suggestedMinutes: 1, instruction: '' } }], 4).changes).toMatchObject([{ kind: 'remove', id: 'w' }])
  })
})

describe('closing a fight on the sheet', () => {
  it('ends rest-of-combat steps, stepping to an explicit next step, and leaves rest, treatment, minute and lasting cards alone', () => {
    const fightOnly = stored('fight', [step('combat-end', { rolls: [{ scope: 'speed', mode: 'disadvantage' }] })])
    const thenRest = stored('then', [step('combat-end'), step('long-rest')])
    const kept = ['long-rest', 'treated', 'by-hand', 'lasting', 'put-back'].map((until) => stored(until, [step(until)]))
    const handMade = { id: 'note', name: 'Sunburn', cause: '', steps: [step('combat-end')] }
    expect(close(frozen([fightOnly, thenRest, ...kept, handMade]), 4)).toEqual({
      ...NOTHING,
      changes: [
        { kind: 'remove', id: 'fight', before: fightOnly },
        { kind: 'set', id: 'then', field: 'steps', before: { exists: true, value: thenRest.steps }, value: [step('long-rest')] },
      ],
    })
  })

  it('turns a running window or countdown into an after-combat card suggesting the rounds left as minutes', () => {
    const window = stored('window', [step('next-round-end')], { combatOrigin: origin(4) })
    const bleed = stored('bleed', [step('rounds')], { countdown: { kind: 'bleed', rounds: 3 } })
    const critical = stored('critical', [step('rounds')], { countdown: { kind: 'critical', rounds: 4 } })
    const plan = close([window, bleed, critical], 4)
    expect(plan).toMatchObject({ traumaDelta: 0, bleeding: [], critical: [] })
    expect(plan.changes).toEqual([
      { kind: 'set', id: 'window', field: 'steps', before: { exists: true, value: window.steps }, value: [{ modifiers: [], labels: ['About 2 minutes left'], until: 'by-hand' }] },
      { kind: 'set', id: 'window', field: 'afterCombat', before: { exists: false }, value: { suggestedMinutes: 2, instruction: '' } },
      { kind: 'set', id: 'bleed', field: 'steps', before: { exists: true, value: bleed.steps }, value: [{ modifiers: [], labels: ['About 3 minutes left', '+1 Trauma when it runs out'], until: 'by-hand' }] },
      { kind: 'set', id: 'bleed', field: 'afterCombat', before: { exists: false }, value: { suggestedMinutes: 3, instruction: '+1 Trauma when it runs out', countdown: 'bleed' } },
      { kind: 'set', id: 'critical', field: 'steps', before: { exists: true, value: critical.steps }, value: [{ modifiers: [], labels: ['About 4 minutes left', 'Death Save when it runs out'], until: 'by-hand' }] },
      { kind: 'set', id: 'critical', field: 'afterCombat', before: { exists: false }, value: { suggestedMinutes: 4, instruction: 'Death Save when it runs out', countdown: 'critical' } },
    ])
  })

  it('suggests at least a minute for a window whose round has passed but has not been ticked', () => {
    expect(close([stored('w', [step('next-round-end')], { combatOrigin: origin(2) })], 5).changes[0]).toMatchObject({ value: [{ labels: ['About 1 minute left'] }] })
  })

  it('suggests the larger count of lost stages still to come, or ends a daze whose stages have all passed', () => {
    const dazed = stored('dazed', [step('rounds')], { lost: { movement: [4, 5], action: [3, 4] } })
    expect(close([dazed], 4).changes[1]).toMatchObject({ field: 'afterCombat', value: { suggestedMinutes: 2 } })
    expect(close([dazed], 6).changes).toEqual([{ kind: 'remove', id: 'dazed', before: dazed }])
  })

  it('reads an unfired countdown before lost stages, and lost stages before the step', () => {
    const mixed = stored('m', [step('next-round-end')], { lost: { movement: [4], action: [] }, countdown: { kind: 'bleed', rounds: 3 } })
    expect(close([mixed], 4).changes[1]).toMatchObject({ value: { suggestedMinutes: 3, countdown: 'bleed' } })
    const lostWindow = stored('l', [step('next-round-end')], { combatOrigin: origin(4), lost: { movement: [5, 6, 7], action: [] } })
    expect(close([lostWindow], 4).changes[1]).toMatchObject({ value: { suggestedMinutes: 3 } })
  })

  it('leaves fired countdowns, converted cards, cards without a step, and other fights\' cards alone', () => {
    const cards = [
      stored('fired', [step('by-hand')], { countdown: { kind: 'bleed', rounds: 1, fired: true } }),
      stored('converted', [step('combat-end')], { afterCombat: null }),
      stored('empty', []),
      stored('other', [step('combat-end')], { combatOrigin: origin(1, 'elsewhere') }),
      { id: 'handless', name: 'Old', cause: '', steps: [step('combat-end')], combatOrigin: 'fight' },
    ]
    expect(close(cards, 4)).toEqual(NOTHING)
  })
})

describe('reading a card', () => {
  const card = (until: string | null, fields: object = {}) =>
    ({ id: 'c', name: 'Wound', cause: 'test', steps: until === null ? [] : [{ modifiers: [], labels: [], until } as LubecEffectStep], ...fields })

  it('names what ends a card, and only the round a fight set for a wound card', () => {
    const cases: [object, string | null, string | null][] = [
      [card('rounds', { lost: { movement: [3], action: [3, 5] } }), null, null],
      [card('rounds', { countdown: { kind: 'bleed', rounds: 2 }, combatOrigin: { originatingRound: 3 } }), 'Due at the end of round 5', 'Due at the end of round 5'],
      [card('rounds', { lost: { movement: [3] }, countdown: { kind: 'critical', rounds: 1 }, combatOrigin: { originatingRound: 2 } }), 'Due at the end of round 3', 'Due at the end of round 3'],
      [card('rounds', { combatOrigin: { originatingRound: 2 }, countdown: { rounds: 3, fired: false } }), 'Due at the end of round 5', 'Due at the end of round 5'],
      [card('rounds', { countdown: { kind: 'bleed', rounds: 2, fired: true }, combatOrigin: { originatingRound: 3 } }), 'Counts down by round', null],
      [card('rounds', { countdown: { kind: 'bleed', rounds: 2 } }), 'Counts down by round', null],
      [card('rounds', { countdown: { kind: 'bleed', rounds: 'd4' }, combatOrigin: { originatingRound: 3 } }), 'Counts down by round', null],
      [card('rounds'), 'Counts down by round', null],
      [card('next-round-end', { combatOrigin: { originatingRound: 3 } }), 'Ends with round 4', 'Ends with round 4'],
      [card('next-round-end', { combatOrigin: { originatingRound: 2 }, lost: { movement: [3], action: [] } }), null, null],
      [card('next-round-end'), 'Until the end of the next round', null],
      [card('long-rest'), 'Step down after 1 Long Rest', null],
      [card('whenever'), null, null],
      [card(null), null, null],
    ]
    for (const [effect, trigger, roundTrigger] of cases) expect([view(effect).trigger, view(effect).roundTrigger]).toEqual([trigger, roundTrigger])
  })

  it('says a wound card is resolved by hand while its step counts rounds the fight does not run', () => {
    const wound = { wound: { table: 'blunt', row: 'Rung bell' } }
    expect(view(card('rounds', wound)).byHand).toBe(true)
    expect(view(card('rounds', { ...wound, countdown: { kind: 'bleed', rounds: 1 } })).byHand).toBe(false)
    expect(view(card('rounds', { ...wound, lost: { movement: [3] } })).byHand).toBe(false)
    expect(view(card('long-rest', wound)).byHand).toBe(false)
    expect(view(card(null, wound)).byHand).toBe(false)
    expect(view(card('rounds')).byHand).toBe(false)
  })

  it('lets a fight\'s round read a wound only from its effective round, and a brief window only through the round it ends with', () => {
    const late = card('long-rest', { combatOrigin: origin(2, 'fight', 3) })
    expect([2, 3].map((round) => view(late, { fightId: 'fight', round }).activeInFight)).toEqual([false, true])
    const window = card('next-round-end', { combatOrigin: origin(2) })
    expect([2, 3, 4].map((round) => view(window, { fightId: 'fight', round }).activeInFight)).toEqual([true, true, false])
    expect(view(late, { fightId: 'other', round: 1 }).activeInFight).toBe(true)
    expect(view(window, null).activeInFight).toBe(true)
  })

  it('keeps an after-combat card out of every fight and its restrictions off, while Core still reads it', () => {
    for (const afterCombat of [{ suggestedMinutes: 2, instruction: '' }, null]) {
      const converted = card('by-hand', { combatOrigin: origin(4), afterCombat })
      expect(view(converted, { fightId: 'next', round: 1 })).toMatchObject({ activeInFight: false, physicalRestrictionsActive: false })
      expect(view(converted, null).activeInFight).toBe(true)
    }
    expect(view(card('by-hand')).physicalRestrictionsActive).toBe(true)
    expect(view(card(null)).physicalRestrictionsActive).toBe(false)
  })
})
