import { describe, expect, it } from 'vitest'
import { planSheetIntention } from '../../character/characterStore/sheetIntention'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { combatRollMode } from './engine/combatModes'
import type { CombatSheet } from './engine/types'
import { closingIntention, roundTickIntention } from './roundTick'
import { lubecRollMode } from '../../ruleSets/lubec/rollModes'
import type { CombatWound } from './woundTypes'

const origin = (round: number, fightId = 'fight') => ({ fightId, woundId: `w${round}`, originatingRound: round, effectiveRound: round })
const brief = (id: string, round: number, extra: object = {}) => ({
  id, name: 'Clipped', cause: 'Blunt Force', combatOrigin: origin(round), keep: 'me',
  steps: [{ modifiers: [], labels: [], until: 'next-round-end', rolls: [{ scope: 'attacks', mode: 'disadvantage' }] }], ...extra,
})
const twoStep = (id: string, round: number) => ({ ...brief(id, round), steps: [...brief(id, round).steps, { modifiers: [{ target: 'Handle', amount: -10 }], labels: [], until: 'long-rest' }] })
const handMade = { id: 'note', name: 'Sunburn', cause: '', steps: [{ modifiers: [], labels: [], until: 'next-round-end' }] }
const tick = (round: number): CombatWound => ({ kind: 'tick', tickRound: round, id: `round-${round}:character:hero`, target: { kind: 'character', sheetId: 'hero' }, originatingRound: round, effectiveRound: round + 1, traumaDelta: 0, stressDelta: 0 })
const sheet = (effects: object[]) => ({ sheetRevision: 4, lubec: { ...lubecCharacterSheet(), effects } })

describe('the end of a round for one combatant', () => {
  it('ends a brief window from round R at the end of R+1, and not before', () => {
    const raw = sheet([brief('a', 2)])
    expect(roundTickIntention(raw, tick(2), 'fight', 'op')).toBeNull()
    const ended = roundTickIntention(raw, tick(3), 'fight', 'op')!
    const after = planSheetIntention(raw, ended)
    expect(after.outcome).toMatchObject({ status: 'committed', revision: 5 })
    expect((after.mutation!.sheet.lubec as { effects: unknown[] }).effects).toEqual([])
  })

  it('keeps a round-0 wound through round 1', () => {
    expect(roundTickIntention(sheet([brief('a', 0)]), tick(0), 'fight', 'op')).toBeNull()
    expect(roundTickIntention(sheet([brief('a', 0)]), tick(1), 'fight', 'op')).not.toBeNull()
  })

  it('steps a card with a later step down to it, and leaves hand-made cards, other fights and every other field alone', () => {
    const raw = sheet([twoStep('b', 1), handMade, brief('other', 1, { combatOrigin: origin(1, 'elsewhere') })])
    const after = planSheetIntention(raw, roundTickIntention(raw, tick(2), 'fight', 'op')!)
    const effects = (after.mutation!.sheet.lubec as { effects: { id: string; steps: unknown[]; keep?: string }[] }).effects
    expect(effects.map((effect) => [effect.id, effect.steps.length])).toEqual([['b', 1], ['note', 1], ['other', 1]])
    expect(effects[0]).toMatchObject({ keep: 'me', steps: [{ until: 'long-rest' }] })
  })

  it('never ends a step twice: a replay on the ended sheet finds nothing left to end', () => {
    const raw = sheet([twoStep('b', 1)])
    const after = planSheetIntention(raw, roundTickIntention(raw, tick(2), 'fight', 'op')!).mutation!.sheet
    expect(roundTickIntention(after, tick(2), 'fight', 'op')).toBeNull()
  })

  it('refuses rather than overwrite a card someone changed since the tick read it', () => {
    const raw = sheet([twoStep('b', 1)])
    const intention = roundTickIntention(raw, tick(2), 'fight', 'op')!
    const edited = sheet([{ ...twoStep('b', 1), steps: [twoStep('b', 1).steps[0]] }])
    expect(planSheetIntention(edited, intention).outcome).toMatchObject({ status: 'repair' })
  })
})

describe('reading a window that has passed', () => {
  it('is inactive to combat rolls from the round after it ends, before the tick is delivered', () => {
    const record: CombatSheet = { kind: 'character', sheetId: 'hero', name: 'Wayne', ownerUserId: 'p', portraitPath: '', sheet: lubecCharacterSheet({ effects: [brief('a', 2) as never] }) }
    const attack = { kind: 'attack', stat: 'Handle' } as const
    expect(combatRollMode(record, attack, { fightId: 'fight', round: 2 }).mode).toBe('disadvantage')
    expect(combatRollMode(record, attack, { fightId: 'fight', round: 3 }).mode).toBe('disadvantage')
    expect(combatRollMode(record, attack, { fightId: 'fight', round: 4 }).mode).toBe('normal')
  })
})

describe('a saved countdown', () => {
  const countdown = (id: string, kind: 'bleed' | 'critical', round: number, rounds: number) => ({
    id, name: 'Long chest cut', cause: 'Cutting', combatOrigin: origin(round), countdown: { kind, rounds },
    steps: [{ modifiers: [], labels: [`+1 Trauma in d4 = ${rounds} rounds`], until: 'rounds' }],
  })
  const arm = { id: 'arm', name: 'Long chest cut', cause: 'Cutting', combatOrigin: origin(3), steps: [{ modifiers: [{ target: 'Handle', amount: -20 }], labels: [], until: 'long-rest' }] }
  const run = (raw: ReturnType<typeof sheet>, round: number) => {
    const intention = roundTickIntention(raw, tick(round), 'fight', 'op')
    return intention ? planSheetIntention(raw, intention).mutation!.sheet as ReturnType<typeof sheet> : null
  }

  it('with a d4 of 1 rolled in round 3 fires at the end of round 4, adds +1 Trauma once, and marks itself fired', () => {
    const raw = sheet([countdown('bleed', 'bleed', 3, 1), arm])
    expect(run(raw, 3)).toBeNull()
    const fired = run(raw, 4)!
    expect(fired.lubec.counters.trauma).toBe(raw.lubec.counters.trauma + 1)
    expect(fired.lubec.effects[0]).toMatchObject({ countdown: { kind: 'bleed', rounds: 1, fired: true, firedRound: 4 }, steps: [{ until: 'by-hand', labels: ['+1 Trauma added at the end of round 4'] }] })
    expect(fired.lubec.effects[1]).toEqual(arm)
    expect(run(fired, 4)).toBeNull()
    expect(run(fired, 5)).toBeNull()
  })

  it('makes a Critical countdown one due event with no Trauma, and keeps two countdowns from one Save apart', () => {
    const raw = sheet([countdown('bleed', 'bleed', 2, 2), countdown('critical', 'critical', 2, 1)])
    const third = run(raw, 3)!
    expect(third.lubec.counters.trauma).toBe(raw.lubec.counters.trauma)
    expect(third.lubec.effects.map((effect) => (effect as { countdown: { fired?: boolean } }).countdown.fired ?? false)).toEqual([false, true])
    expect(third.lubec.effects[1]).toMatchObject({ steps: [{ labels: ['Death Save due at the end of round 3'] }] })
    const fourth = run(third, 4)!
    expect(fourth.lubec.counters.trauma).toBe(raw.lubec.counters.trauma + 1)
  })

  it('raises a Death Save reminder for a due Critical, and one for a bleed at the threshold, each once', () => {
    const atThree = (effects: object[]) => { const raw = sheet(effects); return { ...raw, lubec: { ...raw.lubec, counters: { ...raw.lubec.counters, trauma: 3 } } } }
    const third = run(atThree([countdown('bleed', 'bleed', 2, 1), countdown('critical', 'critical', 2, 1)]), 3)!
    expect((third.lubec as { deathReminders?: unknown }).deathReminders).toEqual([
      { id: 'op_death', reasons: ['Trauma reached 4, the Death Save threshold of 4'], event: 'Bleeding from Long chest cut at the end of round 3' },
      { id: 'op_critical_critical', reasons: ['A Critical countdown ran out: Death Save due'], event: 'Long chest cut at the end of round 3' },
    ])
    expect(run(third, 3)).toBeNull()
    const below = run(sheet([countdown('bleed', 'bleed', 2, 1)]), 3)!
    expect((below.lubec as { deathReminders?: unknown }).deathReminders).toBeUndefined()
  })

  it('adds its Trauma as a change, keeping a manual Trauma change made since', () => {
    const raw = sheet([countdown('bleed', 'bleed', 1, 1)])
    const intention = roundTickIntention(raw, tick(2), 'fight', 'op')!
    const changed = { ...raw, sheetRevision: 5, lubec: { ...raw.lubec, counters: { ...raw.lubec.counters, trauma: 3 } } }
    expect((planSheetIntention(changed, { ...intention, baseRevision: 5 }).mutation!.sheet.lubec as typeof raw.lubec).counters.trauma).toBe(4)
  })
})

describe('closing the fight for one combatant', () => {
  const close = (raw: ReturnType<typeof sheet>, round: number) => {
    const entry: CombatWound = { ...tick(round), kind: 'close', id: 'close:character:hero' }
    const intention = closingIntention(raw, entry, 'fight', 'op')
    return intention ? planSheetIntention(raw, intention).mutation!.sheet as ReturnType<typeof sheet> : null
  }
  const card = (id: string, steps: object[], extra: object = {}) => ({ id, name: 'Wound', cause: '', combatOrigin: origin(3), steps, ...extra })
  const step = (until: string, extra: object = {}) => ({ modifiers: [], labels: [], until, ...extra })

  it('ends rest-of-combat steps, stepping to an explicit next step, and leaves rest, treatment, minute and lasting cards alone', () => {
    const fightOnly = card('fight', [step('combat-end', { rolls: [{ scope: 'speed', mode: 'disadvantage' }] })])
    const thenRest = card('then', [step('combat-end'), step('long-rest')])
    const kept = ['long-rest', 'treated', 'by-hand', 'lasting', 'put-back'].map((until) => card(until, [step(until)]))
    const after = close(sheet([fightOnly, thenRest, ...kept, handMade]), 4)!
    expect(after.lubec.effects.map((effect) => (effect as { id: string }).id)).toEqual(['then', ...kept.map((entry) => entry.id), 'note'])
    expect((after.lubec.effects[0] as { steps: { until: string }[] }).steps).toEqual([step('long-rest')])
    expect(after.lubec.counters).toEqual(sheet([]).lubec.counters)
  })

  it('turns a running window or countdown into an after-combat card suggesting the rounds left as minutes', () => {
    const window = card('window', [step('next-round-end')], { combatOrigin: origin(4) })
    const bleed = card('bleed', [step('rounds')], { countdown: { kind: 'bleed', rounds: 3 } })
    const critical = card('critical', [step('rounds')], { countdown: { kind: 'critical', rounds: 4 } })
    const after = close(sheet([window, bleed, critical]), 4)!
    const [w, b, c] = after.lubec.effects as { steps: { labels: string[]; until: string }[]; afterCombat: object }[]
    expect(w).toMatchObject({ afterCombat: { suggestedMinutes: 2 }, steps: [{ until: 'by-hand', labels: ['About 2 minutes left'] }] })
    expect(b).toMatchObject({ afterCombat: { suggestedMinutes: 3, countdown: 'bleed' }, steps: [{ labels: ['About 3 minutes left', '+1 Trauma when it runs out'] }] })
    expect(c).toMatchObject({ afterCombat: { suggestedMinutes: 4, countdown: 'critical' }, steps: [{ labels: ['About 4 minutes left', 'Death Save when it runs out'] }] })
    expect(after.lubec.counters.trauma).toBe(sheet([]).lubec.counters.trauma)
    expect(close(after, 4)).toBeNull()
  })

  it('leaves a fired countdown and another fight\'s cards alone', () => {
    const fired = card('fired', [step('by-hand')], { countdown: { kind: 'bleed', rounds: 1, fired: true } })
    const other = card('other', [step('combat-end')], { combatOrigin: origin(1, 'elsewhere') })
    expect(close(sheet([fired, other]), 4)).toBeNull()
  })

  it('makes an after-combat card count in Core until cleared, and in no later fight', () => {
    const converted = { ...brief('a', 4), afterCombat: { suggestedMinutes: 2, instruction: '' } }
    const record: CombatSheet = { kind: 'character', sheetId: 'hero', name: 'Wayne', ownerUserId: 'p', portraitPath: '', sheet: lubecCharacterSheet({ effects: [converted as never] }) }
    expect(combatRollMode(record, { kind: 'attack', stat: 'Handle' }, { fightId: 'next', round: 1 }).mode).toBe('normal')
    expect(lubecRollMode(record.sheet.effects, { kind: 'attack', stat: 'Handle' }).mode).toBe('disadvantage')
  })
})


describe('lost stage cards through ticks and closing', () => {
  const card = { id: 'dazed', name: 'Dazed', cause: 'Concussion', combatOrigin: origin(3), lost: { movement: [4, 5], action: [3, 4] }, steps: [{ modifiers: [], labels: [], until: 'rounds' }] }
  it('keeps Dazed until its last lost stage passes, then expires once', () => {
    const raw = sheet([card])
    expect(roundTickIntention(raw, tick(4), 'fight', 'tick4')).toBeNull()
    const after = planSheetIntention(raw, roundTickIntention(raw, tick(5), 'fight', 'tick5')!).mutation!.sheet as ReturnType<typeof sheet>
    expect(after.lubec.effects).toEqual([])
    expect(roundTickIntention(after, tick(5), 'fight', 'retry')).toBeNull()
  })
  it('suggests the larger remaining stage count as minutes on closing', () => {
    const raw = sheet([card])
    const after = planSheetIntention(raw, closingIntention(raw, { ...tick(4), kind: 'close' }, 'fight', 'close')!).mutation!.sheet as ReturnType<typeof sheet>
    expect(after.lubec.effects).toMatchObject([{ afterCombat: { suggestedMinutes: 2 }, steps: [{ until: 'by-hand' }] }])
  })
})


it('continues countdowns while unconscious and leaves manual unconsciousness on closing', () => {
  const unconscious = { id: 'sleep', name: 'Unconscious', cause: 'Head 9', combatOrigin: origin(3), steps: [{ modifiers: [], labels: ['13 minutes'], until: 'by-hand', restrictions: [{ kind: 'unconscious' }] }] }
  const bleed = { id: 'bleed', name: 'Bleeding', cause: 'Cut', combatOrigin: origin(3), countdown: { kind: 'bleed', rounds: 1 }, steps: [{ modifiers: [], labels: [], until: 'rounds' }] }
  const raw = sheet([unconscious, bleed])
  const after = planSheetIntention(raw, roundTickIntention(raw, tick(4), 'fight', 'tick')!).mutation!.sheet as ReturnType<typeof sheet>
  expect(after.lubec.effects[0]).toEqual(unconscious)
  expect(after.lubec.counters.trauma).toBe(raw.lubec.counters.trauma + 1)
  expect(closingIntention(after, { ...tick(4), kind: 'close' }, 'fight', 'close')).toBeNull()
})
