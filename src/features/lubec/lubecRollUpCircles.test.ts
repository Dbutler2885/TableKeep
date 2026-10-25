import { describe, expect, it } from 'vitest'
import type { LubecCharacterSheet } from '../ruleSets/lubec/characterRecord'
import { makeLubecGuidedCharacter } from '../ruleSets/lubec/directEntry'
import type { LubecStat, LubecValueName } from '../ruleSets/lubec/sheet'
import {
  lubecCanSwap,
  lubecDiceNote,
  lubecGeneratePreview,
  lubecHighestStats,
  lubecRollUpActive,
  lubecRollUpCircle,
  lubecRollUpStatus,
  lubecStartSwap,
  lubecSwapHint,
  lubecSwapPreview,
  lubecSwapTapped,
  type LubecRollUpState,
  type LubecSwapDraft,
} from './lubecRollUpCircles'

const empty = (): LubecCharacterSheet => makeLubecGuidedCharacter('gus', { userId: 'player-1', username: 'gus1977' }).lubec

// Stats 47, 33, 24, 52 and 41: Intellect lowest, Handle highest; each Save 10 + 3 + 4.
const rolled = (changes: Partial<LubecCharacterSheet> = {}): LubecCharacterSheet => ({
  ...empty(),
  base: { Strength: 47, Speed: 33, Intellect: 24, Handle: 52, Charm: 41, Sanity: 17, Fear: 17, Body: 17 },
  rollUp: {
    stats: {
      Strength: { tens: 40, d10: 7 },
      Speed: { tens: 30, d10: 3 },
      Intellect: { tens: 20, d10: 4 },
      Handle: { tens: 50, d10: 2 },
      Charm: { tens: 40, d10: 1 },
    },
    saves: { Sanity: [3, 4], Fear: [3, 4], Body: [3, 4] },
  },
  ...changes,
})

const state = (sheet: LubecCharacterSheet, changes: Partial<LubecRollUpState> = {}): LubecRollUpState =>
  ({ sheet, swap: null, spins: {}, landed: [], canAct: true, ...changes })

const STATS: LubecStat[] = ['Strength', 'Speed', 'Intellect', 'Handle', 'Charm']

/** Each Stat's mark class, note and whether a tap does something. */
const marks = (circleState: LubecRollUpState) => STATS.map((name) => {
  const circle = lubecRollUpCircle(circleState, name)
  return [name, circle.classes.find((entry) => entry.startsWith('swap-')) ?? null, circle.note, circle.tappable]
})

const select = (source: LubecStat | null): LubecSwapDraft => ({ stage: 'select', source })
const review: LubecSwapDraft = { stage: 'review', source: 'Intellect', target: 'Speed' }

describe('Lubec roll-up circles', () => {
  it('shows "Roll" in an empty circle, which the owner or the GM taps and anyone else only sees', () => {
    expect(lubecRollUpCircle(state(empty()), 'Strength')).toEqual({
      classes: [], number: 'Roll', label: 'Generate Strength', tappable: true, note: '', swapNote: false,
    })
    expect(lubecRollUpCircle(state(empty(), { canAct: false }), 'Body')).toMatchObject({ label: 'Body not rolled yet', tappable: false })
  })

  it('spins each rolled circle on its own preview, leaving every value not rolled yet to roll meanwhile', () => {
    const spins = { Speed: { preview: 37, step: 3 }, Body: { preview: 22, step: 0 } }
    expect(lubecRollUpCircle(state(empty(), { spins }), 'Speed')).toEqual({
      classes: ['rolling'], number: '37', label: 'Rolling Speed', tappable: false, note: '', swapNote: false,
    })
    expect(lubecRollUpCircle(state(empty(), { spins }), 'Body')).toMatchObject({ classes: ['rolling'], number: '22' })
    expect(lubecRollUpCircle(state(empty(), { spins }), 'Charm')).toMatchObject({ number: 'Roll', tappable: true })
  })

  it('shows a rolled value waiting for its class with its dice under it, landing once, and never rolled again', () => {
    const sheet = rolled()
    expect(lubecRollUpCircle(state(sheet, { landed: ['Speed', 'Strength'] }), 'Strength')).toEqual({
      classes: ['has-value', 'awaiting-class', 'landed'], number: '47', label: 'Strength score 47', tappable: false, note: '40 + 7', swapNote: false,
    })
    expect(lubecRollUpCircle(state(sheet), 'Sanity')).toMatchObject({ classes: ['has-value', 'awaiting-class'], note: '10 + 3 + 4' })
  })

  it('marks the lowest, locks the highest and invites a tap on every Stat it may trade with', () => {
    expect(marks(state(rolled(), { swap: select('Intellect') }))).toEqual([
      ['Strength', 'swap-target', '40 + 7', true],
      ['Speed', 'swap-target', '30 + 3', true],
      ['Intellect', 'swap-source', 'Lowest', false],
      ['Handle', 'swap-locked', 'Locked', false],
      ['Charm', 'swap-target', '40 + 1', true],
    ])
    expect(lubecRollUpCircle(state(rolled(), { swap: select('Intellect') }), 'Speed').label).toBe('Swap Intellect 24 with Speed 33')
    expect(marks(state(rolled(), { swap: select('Intellect'), canAct: false })).every(([, , , tappable]) => !tappable)).toBe(true)
  })

  it('lets a tie for lowest pick which Stat moves, then trades it for review', () => {
    const tied = rolled({ base: { ...rolled().base, Speed: 24 } })
    const swap = lubecStartSwap(tied)
    expect(swap).toEqual(select(null))
    expect(marks(state(tied, { swap })).map(([, mark, note, tappable]) => [mark, note, tappable])).toEqual([
      [null, '40 + 7', false],
      ['swap-source', 'Pick one', true],
      ['swap-source', 'Pick one', true],
      ['swap-locked', 'Locked', false],
      [null, '40 + 1', false],
    ])

    const picked = lubecSwapTapped(tied, swap, 'Speed')
    expect(picked).toEqual(select('Speed'))
    expect(lubecSwapTapped(tied, picked, 'Handle')).toBe(picked)
    expect(lubecSwapTapped(tied, picked, 'Strength')).toEqual({ stage: 'review', source: 'Speed', target: 'Strength' })
    expect(lubecSwapTapped(tied, picked, 'Sanity')).toBe(picked)
  })

  it('shows a Swap under review traded, both circles marked, before anything is stored', () => {
    const sheet = rolled()
    expect(lubecStartSwap(sheet)).toEqual(select('Intellect'))
    expect(lubecSwapPreview(sheet, review)).toMatchObject({ Intellect: 33, Speed: 24 })
    expect(lubecSwapPreview(sheet, select('Intellect'))).toBe(sheet.base)
    expect(marks(state(sheet, { swap: review }))).toEqual([
      ['Strength', null, '40 + 7', false],
      ['Speed', 'swap-moved', 'Swapped', false],
      ['Intellect', 'swap-moved', 'Swapped', false],
      ['Handle', null, '50 + 2', false],
      ['Charm', null, '40 + 1', false],
    ])
    expect(lubecRollUpCircle(state(sheet, { swap: review }), 'Speed').number).toBe('24')
  })

  it('notes the two Stats a confirmed Swap moved, as their dice no longer add up to them', () => {
    const sheet = rolled({ rollUp: { ...rolled().rollUp as object, swap: { lowest: 'Intellect', other: 'Strength' } } })
    expect(marks(state(sheet)).map(([, , note]) => note)).toEqual(['Swapped', '30 + 3', 'Swapped', '50 + 2', '40 + 1'])
    expect(lubecRollUpCircle(state(sheet), 'Strength').swapNote).toBe(true)
  })

  it('hints at each step of the Swap in the tray', () => {
    expect([select(null), select('Intellect'), review].map(lubecSwapHint)).toEqual([
      'Tied for lowest: tap the one that moves',
      'Tap a Stat to trade with your lowest',
      'Intellect and Speed traded',
    ])
  })

  it('offers the Swap only when the lowest Stat has something to trade with', () => {
    expect(lubecCanSwap(rolled())).toBe(true)
    const level = rolled({ base: { ...rolled().base, Strength: 30, Speed: 30, Intellect: 30, Handle: 30, Charm: 30 } })
    expect(lubecCanSwap(level)).toBe(false)
    expect(lubecHighestStats(level)).toEqual(['Strength', 'Speed', 'Intellect', 'Handle', 'Charm'])
    expect(lubecCanSwap(empty())).toBe(false)
  })

  it('says what is happening on the status line, in the prototype\'s words', () => {
    const status = (sheet: LubecCharacterSheet, changes: { swap?: LubecSwapDraft; generated?: LubecValueName } = {}) =>
      lubecRollUpStatus({ sheet, swap: changes.swap ?? null, spins: {}, generated: changes.generated ?? null })
    const partly = rolled({ rollUp: { stats: { Strength: { tens: 40, d10: 7 } } } })
    const tied = rolled({ base: { ...rolled().base, Speed: 24 } })

    expect(lubecRollUpStatus({ sheet: empty(), swap: null, spins: { Fear: { preview: 15, step: 0 } }, generated: 'Fear' })).toBe('Rolling Fear...')
    const spins = { Body: { preview: 15, step: 2 }, Strength: { preview: 47, step: 0 } }
    expect(lubecRollUpStatus({ sheet: empty(), swap: null, spins, generated: 'Strength' })).toBe('Rolling Strength, Body...')
    expect(status(empty())).toBe('Roll each Stat and Save to begin.')
    expect(status(empty(), { generated: 'Strength' })).toBe('Roll each Stat and Save to begin.')
    expect(status(partly, { generated: 'Strength' })).toBe('Strength generated at 47.')
    expect(status(rolled(), { generated: 'Body' })).toBe('Keep these scores or swap your lowest Stat.')
    expect(status(rolled(), { swap: select('Intellect') })).toBe('Intellect is your lowest. Tap a Stat to trade places with it. Your best Stat is locked.')
    expect(status(tied, { swap: select(null) })).toBe('Two Stats tie for lowest. Tap the one you want to move.')
    expect(status(rolled(), { swap: review })).toBe('Intellect is now 33; Speed is now 24. Confirm or undo.')
    expect(status(rolled({ rollUp: { ...rolled().rollUp as object, kept: true } }))).toBe('Scores settled. Now choose a class.')
    expect(status(rolled({ rollUp: { ...rolled().rollUp as object, swap: { lowest: 'Intellect', other: 'Strength' } } })))
      .toBe('Intellect and Strength swapped. Now choose a class.')
  })

  it('keeps the roll-up on the circles until the scores are settled and a class is chosen', () => {
    const kept = rolled({ rollUp: { ...rolled().rollUp as object, kept: true } })
    expect(lubecRollUpActive(empty())).toBe(true)
    expect(lubecRollUpActive(rolled({ class: { key: 'working', choices: {} } }))).toBe(true)
    expect(lubecRollUpActive(kept)).toBe(true)
    expect(lubecRollUpActive({ ...kept, class: { key: 'working', choices: {} } })).toBe(false)
  })

  it('spins Stats through the dealt tens\' range and Saves through 2d10 + 10', () => {
    expect([0, 0.999].map((value) => lubecGeneratePreview('Strength', () => value))).toEqual([21, 60])
    expect([0, 0.999].map((value) => lubecGeneratePreview('Sanity', () => value))).toEqual([12, 30])
    expect(lubecGeneratePreview('Charm')).toBeGreaterThan(20)
  })

  it('writes a Stat\'s dice as its tens and d10, and a Save\'s as 10 and its two d10s', () => {
    expect(lubecDiceNote({ tens: 30, d10: 9 })).toBe('30 + 9')
    expect(lubecDiceNote([1, 10])).toBe('10 + 1 + 10')
  })
})
