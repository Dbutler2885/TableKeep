import { describe, expect, it } from 'vitest'
import { LUBEC_PANIC_TABLE, lubecPanicRow } from './panicTable'

describe('the Lubec Panic table', () => {
  it('has 20 rows, 01 to 20, each with a name and text', () => {
    expect(LUBEC_PANIC_TABLE.map(({ roll }) => roll)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1))
    expect(LUBEC_PANIC_TABLE.filter(({ name, text }) => !name || !text)).toEqual([])
  })

  it('structures only the rolling character’s own Stress and Minimum Stress changes', () => {
    const changes = Object.fromEntries(LUBEC_PANIC_TABLE.filter((row) => row.changes.length > 0).map((row) => [row.roll, row.changes]))
    expect(changes).toEqual({
      1: [{ counter: 'stress', sign: -1, dice: { count: 1, sides: 5 } }],
      2: [{ counter: 'stress', amount: 1 }],
      3: [{ counter: 'stress', amount: 1 }],
      4: [{ counter: 'minimumStress', amount: 1 }],
      14: [{ counter: 'minimumStress', amount: 2 }],
      15: [{ counter: 'stress', sign: -1, dice: { count: 1, sides: 10 } }],
      18: [{ counter: 'minimumStress', amount: 1 }],
      19: [{ counter: 'minimumStress', amount: 1 }],
    })
  })

  it('keeps everything else a row says as text', () => {
    expect(lubecPanicRow(3)?.text).toBe('Gain 1 Stress. All Close Group members gain 2 Stress.')
    expect(lubecPanicRow(6)?.text).toContain('or gain 1d5 Stress')
    expect(lubecPanicRow(18)?.text).toBe('Roll twice on this table. Increase your Minimum Stress by 1.')
  })

  it('picks a row by its d20, and nothing outside 1 to 20', () => {
    expect(lubecPanicRow(1)?.name).toBe('ADRENALINE RUSH')
    expect(lubecPanicRow(20)?.name).toBe('Mind in Tatters')
    expect(lubecPanicRow(0)).toBeNull()
    expect(lubecPanicRow(21)).toBeNull()
  })
})
