import { describe, expect, it } from 'vitest'
import { emptyLubecClockFields, hiddenLubecClockSharing, type LubecClock, type LubecClockChange } from './lubecClock'
import { enqueueLubecClockAlerts } from './lubecClockAlertQueue'

const clock = (id: string, filled: number[]): LubecClock => ({
  ...emptyLubecClockFields(), ...hiddenLubecClockSharing(), id, name: id, pieces: 6, filled, started: true, createdAtMs: 0,
})

const change = (id: string, before: number[], filled: number[]): LubecClockChange => ({
  clock: clock(id, filled), before, added: filled.filter((i) => !before.includes(i)), removed: before.filter((i) => !filled.includes(i)),
})

const counter = () => {
  let seq = 0
  return () => ++seq
}

describe('enqueueLubecClockAlerts', () => {
  it('queues changes to different clocks in turn', () => {
    const queue = enqueueLubecClockAlerts([], [change('a', [], [0]), change('b', [1], [])], counter())
    expect(queue.map((alert) => [alert.clock.id, alert.seq])).toEqual([['a', 1], ['b', 2]])
  })

  it('folds a later change into the clock already waiting, and starts the one on screen over', () => {
    const next = counter()
    const queue = enqueueLubecClockAlerts([], [change('a', [], [0]), change('b', [], [1])], next)
    const later = enqueueLubecClockAlerts(queue, [change('a', [0], [0, 2]), change('b', [1], [1, 3])], next)
    expect(later).toMatchObject([
      { clock: { id: 'a' }, before: [], added: [0, 2], removed: [], seq: 3 },
      { clock: { id: 'b' }, before: [], added: [1, 3], removed: [], seq: 2 },
    ])
  })

  it('drops a clock that has come back to what the table last saw', () => {
    const queue = enqueueLubecClockAlerts([], [change('a', [2], [2, 4]), change('b', [], [1])], counter())
    expect(enqueueLubecClockAlerts(queue, [change('a', [2, 4], [2])], counter()).map((alert) => alert.clock.id)).toEqual(['b'])
  })
})
