import { describe, expect, it } from 'vitest'
import { planSheetIntention } from '../../character/characterStore/sheetIntention'
import { lubecCharacterSheet } from '../../ruleSets/lubec/sheetFixtures'
import { endWoundRound, landWoundLifetime } from '../../ruleSets/lubec/woundLifetime'
import { closingIntention, roundTickIntention } from './roundTick'
import { combatWoundIntention } from './woundIntention'
import type { CombatWound } from './woundTypes'

// The wound lifetime's sheet changes as revision-checked intentions, through
// the real sheet planner: what the lifetime decides is its own suite's; here,
// that each change lands on the stored card it read and nowhere else.

const origin = (round: number, fightId = 'fight') => ({ fightId, woundId: `w${round}`, originatingRound: round, effectiveRound: round })
const brief = (id: string, round: number, extra: object = {}) => ({
  id, name: 'Clipped', cause: 'Blunt Force', combatOrigin: origin(round), keep: 'me',
  steps: [{ modifiers: [], labels: [], until: 'next-round-end', rolls: [{ scope: 'attacks', mode: 'disadvantage' }] }], ...extra,
})
const twoStep = (id: string, round: number) => ({ ...brief(id, round), steps: [...brief(id, round).steps, { modifiers: [{ target: 'Handle', amount: -10 }], labels: [], until: 'long-rest' }] })
const handMade = { id: 'note', name: 'Sunburn', cause: '', steps: [{ modifiers: [], labels: [], until: 'next-round-end' }] }
const tick = (round: number): CombatWound => ({ kind: 'tick', tickRound: round, id: `round-${round}:character:hero`, target: { kind: 'character', sheetId: 'hero' }, originatingRound: round, effectiveRound: round + 1, traumaDelta: 0, stressDelta: 0 })
const closeAt = (round: number): CombatWound => ({ ...tick(round), kind: 'close', id: 'close:character:hero' })
const sheet = (effects: object[]) => ({ sheetRevision: 4, lubec: { ...lubecCharacterSheet(), effects } })
type Sheet = ReturnType<typeof sheet>
const applied = (raw: Sheet, intention: ReturnType<typeof roundTickIntention>) => (intention ? planSheetIntention(raw, intention).mutation!.sheet as Sheet : null)
const ticked = (raw: Sheet, round: number, operationId = 'op') => applied(raw, roundTickIntention(raw, tick(round), 'fight', operationId))
const closed = (raw: Sheet, round: number) => applied(raw, closingIntention(raw, closeAt(round), 'fight', 'close'))

describe('a round tick as a sheet intention', () => {
  it('commits at the revision it read, or is no intention when nothing ends', () => {
    const raw = sheet([brief('a', 2)])
    expect(roundTickIntention(raw, tick(2), 'fight', 'op')).toBeNull()
    const after = planSheetIntention(raw, roundTickIntention(raw, tick(3), 'fight', 'op')!)
    expect(after.outcome).toMatchObject({ status: 'committed', revision: 5 })
    expect((after.mutation!.sheet.lubec as { effects: unknown[] }).effects).toEqual([])
  })

  it('changes only the card it names, keeping its other fields, the other cards, and a replay finds nothing left', () => {
    const raw = sheet([twoStep('b', 1), handMade, brief('other', 1, { combatOrigin: origin(1, 'elsewhere') })])
    const after = ticked(raw, 2)!
    const effects = after.lubec.effects as { id: string; steps: unknown[]; keep?: string }[]
    expect(effects.map((effect) => [effect.id, effect.steps.length])).toEqual([['b', 1], ['note', 1], ['other', 1]])
    expect(effects[0]).toMatchObject({ keep: 'me', steps: [{ until: 'long-rest' }] })
    expect(effects.slice(1)).toEqual(raw.lubec.effects.slice(1))
    expect(roundTickIntention(after, tick(2), 'fight', 'op')).toBeNull()
  })

  it('refuses rather than overwrite a card someone changed since the tick read it', () => {
    const raw = sheet([twoStep('b', 1)])
    const intention = roundTickIntention(raw, tick(2), 'fight', 'op')!
    const edited = sheet([{ ...twoStep('b', 1), steps: [twoStep('b', 1).steps[0]] }])
    expect(planSheetIntention(edited, intention).outcome).toMatchObject({ status: 'repair' })
  })
})

describe('a countdown tick as a sheet intention', () => {
  const countdown = (id: string, kind: 'bleed' | 'critical', round: number, rounds: number) => ({
    id, name: 'Long chest cut', cause: 'Cutting', combatOrigin: origin(round), countdown: { kind, rounds },
    steps: [{ modifiers: [], labels: [`+1 Trauma in d4 = ${rounds} rounds`], until: 'rounds' }],
  })
  const withTrauma = (raw: Sheet, trauma: number): Sheet => ({ ...raw, lubec: { ...raw.lubec, counters: { ...raw.lubec.counters, trauma } } })

  it('adds a firing bleed\'s Trauma once and marks the card, leaving its other cards alone', () => {
    const arm = { id: 'arm', name: 'Long chest cut', cause: 'Cutting', combatOrigin: origin(3), steps: [{ modifiers: [{ target: 'Handle', amount: -20 }], labels: [], until: 'long-rest' }] }
    const raw = sheet([countdown('bleed', 'bleed', 3, 1), arm])
    const fired = ticked(raw, 4)!
    expect(fired.lubec.counters.trauma).toBe(raw.lubec.counters.trauma + 1)
    expect(fired.lubec.effects[0]).toMatchObject({ countdown: { kind: 'bleed', rounds: 1, fired: true, firedRound: 4 }, steps: [{ until: 'by-hand', labels: ['+1 Trauma added at the end of round 4'] }] })
    expect(fired.lubec.effects[1]).toEqual(arm)
    expect(ticked(fired, 4)).toBeNull()
  })

  it('raises a Death Save reminder for a due Critical, and one for a bleed at the threshold, each once', () => {
    const third = ticked(withTrauma(sheet([countdown('bleed', 'bleed', 2, 1), countdown('critical', 'critical', 2, 1)]), 3), 3)!
    expect((third.lubec as { deathReminders?: unknown }).deathReminders).toEqual([
      { id: 'op_death', reasons: ['Trauma reached 4, the Death Save threshold of 4'], event: 'Bleeding from Long chest cut at the end of round 3' },
      { id: 'op_critical_critical', reasons: ['A Critical countdown ran out: Death Save due'], event: 'Long chest cut at the end of round 3' },
    ])
    expect(ticked(third, 3)).toBeNull()
    const below = ticked(sheet([countdown('bleed', 'bleed', 2, 1)]), 3)!
    expect((below.lubec as { deathReminders?: unknown }).deathReminders).toBeUndefined()
  })

  it('adds its Trauma as a change, keeping a manual Trauma change made since', () => {
    const raw = sheet([countdown('bleed', 'bleed', 1, 1)])
    const intention = roundTickIntention(raw, tick(2), 'fight', 'op')!
    const changed = { ...withTrauma(raw, 3), sheetRevision: 5 }
    expect((planSheetIntention(changed, { ...intention, baseRevision: 5 }).mutation!.sheet.lubec as Sheet['lubec']).counters.trauma).toBe(4)
  })
})

it('closes a fight as a sheet intention that converts running cards once and charges nothing', () => {
  const raw = sheet([brief('window', 4), handMade])
  const after = closed(raw, 4)!
  expect(after.lubec.effects).toEqual([
    { ...brief('window', 4), afterCombat: { suggestedMinutes: 2, instruction: '' }, steps: [{ modifiers: [], labels: ['About 2 minutes left'], until: 'by-hand' }] },
    handMade,
  ])
  expect(after.lubec.counters).toEqual(raw.lubec.counters)
  expect(closingIntention(after, closeAt(4), 'fight', 'close')).toBeNull()
})

describe('a daze from landing to the end of the fight', () => {
  const key = 'character:hero'
  const landing = landWoundLifetime({
    outcome: { now: [{ kind: 'dazed', turns: '1d4' }], cards: [] },
    context: {
      source: { table: 'blunt', tableName: 'Blunt Force', location: 'head', part: 'head', impact: 6, severity: 'Serious', row: 'Rung bell', prose: 'Rung bell.', branch: null, contentVersion: 'v1', dice: { 'Dazed 1d4': [2] }, checks: [], trauma: 1, stress: 0, minimumStress: 0 },
      cause: 'Blunt Force, head, Impact 6: Serious Rung bell', rolled: { dazed: 2 },
    },
    at: { round: 3, actionTaken: false },
  })
  const wound: CombatWound = { id: 'w3', target: { kind: 'character', sheetId: 'hero' }, originatingRound: 3, effectiveRound: 3, traumaDelta: 1, stressDelta: 0, effect: landing.cards[0], effects: landing.cards }
  const delivered = planSheetIntention(sheet([]), combatWoundIntention(sheet([]), wound, 'fight', 'op')).mutation!.sheet as Sheet
  const watch = { [key]: landing.public!.watchThrough! }

  it('keeps the card while the fight still watches its target, and ends it with its last lost stage', () => {
    expect(delivered.lubec.effects).toMatchObject([{ id: 'op_dazed', lost: { movement: [4, 5], action: [3, 4] }, combatOrigin: { fightId: 'fight', originatingRound: 3 } }])
    let current = delivered
    let roundWatch: Record<string, number> = watch
    for (const round of [3, 4, 5]) {
      const ending = endWoundRound({ round, combatants: [{ key, name: 'Wayne' }], roundWatch, countdowns: undefined })
      expect(ending.tickKeys).toEqual([key])
      current = ticked(current, round, `tick${round}`) ?? current
      roundWatch = ending.roundWatch
      expect(current.lubec.effects).toHaveLength(round < 5 ? 1 : 0)
    }
    expect(roundWatch).toEqual({})
    expect(current.lubec.counters).toEqual(delivered.lubec.counters)
  })

  it('suggests the stages left as minutes when the fight closes first, keeping the saved wound as it landed', () => {
    const after = closed(ticked(delivered, 3) ?? delivered, 4)!
    const [card] = after.lubec.effects as Record<string, unknown>[]
    expect(card).toMatchObject({ afterCombat: { suggestedMinutes: 2 }, steps: [{ until: 'by-hand', labels: ['About 2 minutes left'] }] })
    expect(card.wound).toEqual((delivered.lubec.effects[0] as Record<string, unknown>).wound)
    expect(after.lubec.counters).toEqual(delivered.lubec.counters)
  })
})
