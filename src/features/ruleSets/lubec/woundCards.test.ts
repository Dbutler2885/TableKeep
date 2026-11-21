import { describe, expect, it } from 'vitest'
import type { LubecEffect, LubecEffectStep } from './effects'
import { lubecEffectTrigger, lubecWoundCards, lubecWoundRoundTrigger, type LubecWoundCardContext, type LubecWoundRolled } from './woundCards'
import type { LubecWoundNow } from './woundTables/outcome'

// The words a stage-losing card shows, and the line under each card naming
// what ends it, read straight off the cards the builder makes and the round
// metadata combat stamps on them.

const context = (rolled?: LubecWoundRolled): LubecWoundCardContext => ({
  source: {
    table: 'blunt', tableName: 'Blunt Force', location: 'head', part: 'head', impact: 6, severity: 'Serious',
    row: 'Rung bell', prose: 'Rung bell.', branch: null, contentVersion: 'test', dice: {}, checks: [], trauma: 1, stress: 0, minimumStress: 0,
  },
  cause: 'Blunt Force, head, Impact 6: Serious Rung bell',
  rolled,
})

const labelsFor = (now: LubecWoundNow, rolled?: LubecWoundRolled) =>
  lubecWoundCards({ now: [now], cards: [] }, context(rolled)).map((card) => card.steps[0].labels[0])

describe('a stage-losing card outside a fight\'s rounds', () => {
  it('names the next Movement Stage it costs', () => {
    expect(labelsFor({ kind: 'lose-movement' })).toEqual(['Lose the next Movement Stage'])
  })

  it('names the next Action Stage it costs, and the Defense that goes with it', () => {
    expect(labelsFor({ kind: 'lose-action' })).toEqual(['Lose the next Action Stage, Defense with it'])
  })

  it('names one turn of both Stages for a one-turn daze', () => {
    expect(labelsFor({ kind: 'dazed', turns: 1 })).toEqual(['Lose the next Movement and Action Stages'])
  })

  it('counts the Stages a rolled daze takes and shows the die it rolled', () => {
    expect(labelsFor({ kind: 'dazed', turns: '1d4' }, { dazed: 3 })).toEqual(['Lose the next 3 Movement and 3 Action Stages (1d4 = 3)'])
  })

  it('reads a rolled daze that rolled 1 as one turn of both Stages', () => {
    expect(labelsFor({ kind: 'dazed', turns: '1d4' }, { dazed: 1 })).toEqual(['Lose the next Movement and Action Stages (1d4 = 1)'])
  })
})

describe('a stage-losing card inside a fight', () => {
  it('says only the rounds a lost Movement Stage falls in, as the card already says Movement lost', () => {
    expect(labelsFor({ kind: 'lose-movement' }, { lost: { movement: { movement: [2], action: [] } } })).toEqual(['Round 2'])
  })

  it('names the rounds it was worked out to cost instead, and carries them', () => {
    const lost = { movement: [4], action: [3, 4] }
    const [card] = lubecWoundCards({ now: [{ kind: 'dazed', turns: '1d4' }], cards: [] }, context({ dazed: 2, lost: { dazed: lost } }))
    expect(card.steps[0].labels).toEqual(['Action + Defense lost in rounds 3, 4; Movement lost in round 4 (1d4 = 2)'])
    expect(card.lost).toEqual(lost)
  })
})

const card = (until: string, fields: Partial<LubecEffect> = {}): LubecEffect =>
  ({ id: 'c', name: 'Wound', cause: 'test', steps: [{ modifiers: [], labels: [], until } as LubecEffectStep], ...fields })

describe('what ends a card\'s current step', () => {
  it('says nothing of when a card ends that already lists the rounds it takes', () => {
    expect(lubecEffectTrigger(card('rounds', { lost: { movement: [3], action: [3, 5] } }))).toBeNull()
  })

  it('names the round a countdown falls due, counted from the round its wound landed', () => {
    const countdown = card('rounds', { countdown: { kind: 'bleed', rounds: 2 }, combatOrigin: { originatingRound: 3 } })
    expect(lubecEffectTrigger(countdown)).toBe('Due at the end of round 5')
  })

  it('reads the countdown when the lost rounds are not both lists', () => {
    const partly = card('rounds', { lost: { movement: [3] }, countdown: { kind: 'critical', rounds: 1 }, combatOrigin: { originatingRound: 2 } })
    expect(lubecEffectTrigger(partly)).toBe('Due at the end of round 3')
  })

  it('says only that it counts down once the countdown has fired', () => {
    const fired = card('rounds', { countdown: { kind: 'bleed', rounds: 2, fired: true }, combatOrigin: { originatingRound: 3 } })
    expect(lubecEffectTrigger(fired)).toBe('Counts down by round')
  })

  it('says only that it counts down when no round can be named', () => {
    expect(lubecEffectTrigger(card('rounds', { countdown: { kind: 'bleed', rounds: 2 } }))).toBe('Counts down by round')
    expect(lubecEffectTrigger(card('rounds', { countdown: { kind: 'bleed', rounds: 'd4' }, combatOrigin: { originatingRound: 3 } }))).toBe('Counts down by round')
    expect(lubecEffectTrigger(card('rounds'))).toBe('Counts down by round')
  })

  it('names the round a brief window ends with, or says so without a fight', () => {
    expect(lubecEffectTrigger(card('next-round-end', { combatOrigin: { originatingRound: 3 } }))).toBe('Ends with round 4')
    expect(lubecEffectTrigger(card('next-round-end'))).toBe('Until the end of the next round')
  })

  it('reads any other step from its own words, and says nothing for a step that names none', () => {
    expect(lubecEffectTrigger(card('long-rest'))).toBe('Step down after 1 Long Rest')
    expect(lubecEffectTrigger(card('whenever'))).toBeNull()
    expect(lubecEffectTrigger({ id: 'c', name: 'Bare', cause: 'test', steps: [] })).toBeNull()
  })
})

describe('the round a wound card ends with', () => {
  const card = (until: string | null, extra: Partial<LubecEffect> = {}): LubecEffect =>
    ({ id: 'w', name: 'Flinch', cause: '', steps: until === null ? [] : [{ modifiers: [], labels: [], until } as LubecEffectStep], ...extra })

  it('names the round a fight window or countdown ends with, and nothing a table already says', () => {
    expect(lubecWoundRoundTrigger(card('next-round-end', { combatOrigin: { originatingRound: 2 } } as Partial<LubecEffect>))).toBe('Ends with round 3')
    expect(lubecWoundRoundTrigger(card('rounds', { combatOrigin: { originatingRound: 2 }, countdown: { rounds: 3, fired: false } } as Partial<LubecEffect>))).toBe('Due at the end of round 5')
    expect(lubecWoundRoundTrigger(card('long-rest'))).toBeNull()
    expect(lubecWoundRoundTrigger(card(null))).toBeNull()
  })

  it('says nothing for a card that lists the rounds it takes', () => {
    expect(lubecWoundRoundTrigger(card('next-round-end', { combatOrigin: { originatingRound: 2 }, lost: { movement: [3], action: [] } } as Partial<LubecEffect>))).toBeNull()
  })
})
