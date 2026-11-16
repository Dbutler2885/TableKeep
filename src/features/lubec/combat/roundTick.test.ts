import { describe, expect, it } from 'vitest'
import { planSheetIntention } from '../../character/characterStore/sheetIntention'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { combatRollMode } from './engine/combatModes'
import type { CombatSheet } from './engine/types'
import { roundTickIntention } from './roundTick'
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
    expect(fired.lubec.effects[0]).toMatchObject({ countdown: { kind: 'bleed', rounds: 1, fired: true, firedRound: 4 }, steps: [{ until: 'by-hand', labels: ['Fired at the end of round 4: +1 Trauma added. Clear by hand.'] }] })
    expect(fired.lubec.effects[1]).toEqual(arm)
    expect(run(fired, 4)).toBeNull()
    expect(run(fired, 5)).toBeNull()
  })

  it('makes a Critical countdown one due event with no Trauma, and keeps two countdowns from one Save apart', () => {
    const raw = sheet([countdown('bleed', 'bleed', 2, 2), countdown('critical', 'critical', 2, 1)])
    const third = run(raw, 3)!
    expect(third.lubec.counters.trauma).toBe(raw.lubec.counters.trauma)
    expect(third.lubec.effects.map((effect) => (effect as { countdown: { fired?: boolean } }).countdown.fired ?? false)).toEqual([false, true])
    expect(third.lubec.effects[1]).toMatchObject({ steps: [{ labels: ['Due at the end of round 3: a Death Save, which the GM resolves privately. Clear by hand.'] }] })
    const fourth = run(third, 4)!
    expect(fourth.lubec.counters.trauma).toBe(raw.lubec.counters.trauma + 1)
  })

  it('adds its Trauma as a change, keeping a manual Trauma change made since', () => {
    const raw = sheet([countdown('bleed', 'bleed', 1, 1)])
    const intention = roundTickIntention(raw, tick(2), 'fight', 'op')!
    const changed = { ...raw, sheetRevision: 5, lubec: { ...raw.lubec, counters: { ...raw.lubec.counters, trauma: 3 } } }
    expect((planSheetIntention(changed, { ...intention, baseRevision: 5 }).mutation!.sheet.lubec as typeof raw.lubec).counters.trauma).toBe(4)
  })
})
