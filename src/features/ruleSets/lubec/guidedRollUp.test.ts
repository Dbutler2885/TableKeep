import { describe, expect, it } from 'vitest'
import type { LubecCharacterSheet } from './characterRecord'
import type { LubecDice } from './dice'
import { makeLubecGuidedCharacter } from './directEntry'
import {
  lubecRollUpIncomplete,
  lubecRollUpStage,
  lubecSwapSources,
  lubecSwapTargets,
  lubecTensLeft,
  lubecUnrolledValues,
  readLubecRollUp,
  withLubecScoresKept,
  withLubecSwap,
  withLubecRemainingRolled,
  withLubecValueRolled,
} from './guidedRollUp'
import { LUBEC_VALUE_NAMES, type LubecValueName } from './sheet'

const owner = { userId: 'player-1', username: 'tommyev' }

/** Dice that land on the given faces in turn, each as [face, sides]. */
function diceLanding(...faces: (readonly [number, number])[]): LubecDice {
  const queue = [...faces]
  return () => {
    const next = queue.shift()
    if (!next) throw new Error('No seeded die left')
    return (next[0] - 0.5) / next[1]
  }
}

const freshSheet = () => makeLubecGuidedCharacter('kid-1', owner).lubec

const rolled = (sheet: LubecCharacterSheet, name: LubecValueName, dice: LubecDice): LubecCharacterSheet =>
  ({ ...sheet, ...withLubecValueRolled(sheet, name, dice) })

// Every value rolled: Stats at 47, 33, 24, 52, 41 and each Save at 10 + 3 + 4.
function allRolled(): LubecCharacterSheet {
  let sheet = freshSheet()
  sheet = rolled(sheet, 'Strength', diceLanding([2, 5], [7, 10]))
  sheet = rolled(sheet, 'Speed', diceLanding([3, 4], [3, 10]))
  sheet = rolled(sheet, 'Intellect', diceLanding([3, 3], [4, 10]))
  sheet = rolled(sheet, 'Handle', diceLanding([1, 2], [2, 10]))
  sheet = rolled(sheet, 'Charm', diceLanding([1, 1], [1, 10]))
  for (const name of ['Sanity', 'Fear', 'Body'] as const) sheet = rolled(sheet, name, diceLanding([3, 10], [4, 10]))
  return sheet
}

const withBase = (base: Partial<LubecCharacterSheet['base']>): LubecCharacterSheet => {
  const sheet = allRolled()
  return { ...sheet, base: { ...sheet.base, ...base } }
}

describe('a Guided roll-up character', () => {
  it('is a new character\'s draft, owned by its creator, made through the Guided roll-up door with nothing rolled', () => {
    const character = makeLubecGuidedCharacter('kid-1', owner)

    expect(character).toMatchObject({ ownerUserId: 'player-1', creationMode: 'new', creationStatus: 'draft' })
    expect(character.lubec).toMatchObject({ door: 'guided', rollUp: null, counters: { stress: 2, minimumStress: 2, trauma: 0 } })
    expect(Object.values(character.lubec.base).every((value) => value === null)).toBe(true)
    expect(lubecRollUpStage(readLubecRollUp(character.lubec.rollUp))).toBe('rolling')
  })
})

describe('rolling a value', () => {
  it('deals a Stat one of the tens left and adds a d10, storing both dice and the base value', () => {
    const sheet = rolled(freshSheet(), 'Strength', diceLanding([2, 5], [7, 10]))

    expect(sheet.base.Strength).toBe(47)
    expect(sheet.rollUp).toEqual({ stats: { Strength: { tens: 40, d10: 7 } } })
  })

  it('deals each Stat from the tens still left, so the five Stats take 50, 40, 40, 30 and 20 between them', () => {
    const sheet = allRolled()
    const rollUp = readLubecRollUp(sheet.rollUp)

    expect(Object.values(rollUp.stats).map(({ tens }) => tens).sort()).toEqual([20, 30, 40, 40, 50])
    expect([sheet.base.Strength, sheet.base.Speed, sheet.base.Intellect, sheet.base.Handle, sheet.base.Charm])
      .toEqual([47, 33, 24, 52, 41])
    expect(lubecTensLeft(rollUp)).toEqual([])
  })

  it('rolls a Save as 2d10 + 10, keeping both d10s', () => {
    const sheet = rolled(freshSheet(), 'Fear', diceLanding([10, 10], [1, 10]))

    expect(sheet.base.Fear).toBe(21)
    expect(readLubecRollUp(sheet.rollUp).saves).toEqual({ Fear: [10, 1] })
  })

  it('never rolls a value twice', () => {
    const sheet = rolled(freshSheet(), 'Body', diceLanding([5, 10], [5, 10]))

    expect(withLubecValueRolled(sheet, 'Body', diceLanding([1, 10], [1, 10]))).toBeNull()
  })

  it('keeps whatever else is stored on the roll-up', () => {
    const sheet = { ...freshSheet(), rollUp: { note: 'kept', stats: { Charm: { tens: 20, d10: 1, by: 'gm' } } } }

    const next = rolled(sheet, 'Speed', diceLanding([1, 4], [9, 10]))

    expect(next.rollUp).toEqual({ note: 'kept', stats: { Charm: { tens: 20, d10: 1, by: 'gm' }, Speed: { tens: 50, d10: 9 } } })
  })
})

describe('rolling every value left at once', () => {
  it('rolls each value not rolled yet in the sheet\'s order, just as one roll at a time would', () => {
    const dice = diceLanding(
      [2, 5], [7, 10], [3, 4], [3, 10], [3, 3], [4, 10], [1, 2], [2, 10], [1, 1], [1, 10],
      [3, 10], [4, 10], [3, 10], [4, 10], [3, 10], [4, 10],
    )
    const sheet = { ...freshSheet(), ...withLubecRemainingRolled(freshSheet(), dice) }

    expect(sheet.rollUp).toEqual(allRolled().rollUp)
    expect(sheet.base).toEqual(allRolled().base)
    expect(lubecRollUpStage(readLubecRollUp(sheet.rollUp))).toBe('deciding')
  })

  it('leaves the values already rolled as they landed and deals the rest from the tens they left', () => {
    let sheet = rolled(freshSheet(), 'Strength', diceLanding([1, 5], [7, 10]))
    sheet = rolled(sheet, 'Fear', diceLanding([10, 10], [1, 10]))
    const dice = diceLanding([1, 4], [3, 10], [1, 3], [4, 10], [1, 2], [2, 10], [1, 1], [1, 10], [3, 10], [4, 10], [5, 10], [6, 10])
    sheet = { ...sheet, ...withLubecRemainingRolled(sheet, dice) }

    expect(sheet.base).toEqual({ Strength: 57, Speed: 43, Intellect: 44, Handle: 32, Charm: 21, Sanity: 17, Fear: 21, Body: 21 })
    expect(lubecUnrolledValues(readLubecRollUp(sheet.rollUp))).toEqual([])
  })

  it('rolls nothing once every value is rolled', () => {
    expect(withLubecRemainingRolled(allRolled(), diceLanding())).toBeNull()
  })
})

describe('reading a stored roll-up', () => {
  it('reads unreadable dice as not rolled and an unreadable Swap as none', () => {
    const rollUp = readLubecRollUp({
      stats: { Strength: { tens: '40', d10: 7 }, Speed: { tens: 30, d10: 2 }, Luck: { tens: 50, d10: 1 } },
      saves: { Sanity: [3], Fear: [3, 4] },
      swap: { lowest: 'Luck', other: 'Speed' },
      kept: 'yes',
    })

    expect(rollUp).toEqual({ stats: { Speed: { tens: 30, d10: 2 } }, saves: { Fear: [3, 4] }, swap: null, kept: false })
  })
})

describe('the roll-up stage', () => {
  it('waits on the dice, then on keeping or swapping, then is settled', () => {
    const sheet = allRolled()
    const almost = { ...sheet, rollUp: { ...sheet.rollUp, saves: { Sanity: [3, 4], Fear: [3, 4] } } }

    expect(lubecRollUpStage(readLubecRollUp(almost.rollUp))).toBe('rolling')
    expect(lubecRollUpStage(readLubecRollUp(sheet.rollUp))).toBe('deciding')
    expect(lubecRollUpStage(readLubecRollUp({ ...sheet, ...withLubecScoresKept(sheet) }.rollUp))).toBe('settled')
  })
})

describe('the Swap', () => {
  it('moves only the lowest Stat, to any Stat but the highest', () => {
    const sheet = allRolled()

    expect(lubecSwapSources(sheet)).toEqual(['Intellect'])
    expect(lubecSwapTargets(sheet, 'Intellect')).toEqual(['Strength', 'Speed', 'Charm'])
    expect(lubecSwapTargets(sheet, 'Speed')).toEqual([])
  })

  it('lets a tie for lowest pick which one moves, but not trade between the tied Stats', () => {
    const sheet = withBase({ Speed: 24 })

    expect(lubecSwapSources(sheet)).toEqual(['Speed', 'Intellect'])
    expect(lubecSwapTargets(sheet, 'Speed')).toEqual(['Strength', 'Charm'])
  })

  it('offers nothing while a Stat is still a hole', () => {
    expect(lubecSwapSources(withBase({ Charm: null }))).toEqual([])
  })

  it('trades the two scores and records the Swap, leaving the dice as they landed', () => {
    const sheet = allRolled()

    const swapped = { ...sheet, ...withLubecSwap(sheet, { lowest: 'Intellect', other: 'Strength' }) }

    expect([swapped.base.Intellect, swapped.base.Strength]).toEqual([47, 24])
    expect(readLubecRollUp(swapped.rollUp)).toMatchObject({
      swap: { lowest: 'Intellect', other: 'Strength' },
      stats: { Strength: { tens: 40, d10: 7 }, Intellect: { tens: 20, d10: 4 } },
    })
    expect(lubecRollUpStage(readLubecRollUp(swapped.rollUp))).toBe('settled')
  })

  it('refuses a Swap with the highest Stat, from a Stat that is not the lowest, before every die, or a second time', () => {
    const sheet = allRolled()
    const swapped = { ...sheet, ...withLubecSwap(sheet, { lowest: 'Intellect', other: 'Strength' }) }
    const kept = { ...sheet, ...withLubecScoresKept(sheet) }
    const unrolled = { ...sheet, rollUp: { stats: {}, saves: {} } }

    expect(withLubecSwap(sheet, { lowest: 'Intellect', other: 'Handle' })).toBeNull()
    expect(withLubecSwap(sheet, { lowest: 'Speed', other: 'Strength' })).toBeNull()
    expect(withLubecSwap(unrolled, { lowest: 'Intellect', other: 'Strength' })).toBeNull()
    expect(withLubecSwap(swapped, { lowest: 'Strength', other: 'Speed' })).toBeNull()
    expect(withLubecSwap(kept, { lowest: 'Intellect', other: 'Strength' })).toBeNull()
  })
})

describe('what an unfinished roll-up lacks', () => {
  it('names the values not rolled yet, then a Swap not decided, then nothing', () => {
    const sheet = allRolled()
    const partly = rolled(freshSheet(), 'Strength', diceLanding([2, 5], [7, 10]))

    expect(lubecRollUpIncomplete(freshSheet())).toEqual([`Not rolled yet: ${LUBEC_VALUE_NAMES.join(', ')}.`])
    expect(lubecRollUpIncomplete(partly)).toEqual(['Not rolled yet: Speed, Intellect, Handle, Charm, Sanity, Fear, Body.'])
    expect(lubecRollUpIncomplete(sheet)).toEqual(['The scores are neither kept nor swapped yet.'])
    expect(lubecRollUpIncomplete({ ...sheet, ...withLubecScoresKept(sheet) })).toEqual([])
  })

  it('is nothing for a character that did not come through Guided roll-up', () => {
    expect(lubecRollUpIncomplete({ ...freshSheet(), door: 'direct' })).toEqual([])
  })
})
