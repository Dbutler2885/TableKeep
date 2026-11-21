import { describe, expect, it } from 'vitest'
import type { CombatLogEntry } from './combatLog'
import { combatRevealWait, revealedEntries } from './combatReveal'
import type { CombatState } from './engine/types'

// What the page waits on before it shows a new fight state, and how far the table log may run.

const log = (id: string, roll = true): CombatLogEntry => ({ id, at: null, event: id, actor: null, ...(roll ? { roll: { who: 'Roy', what: 'Attack roll', roll: '27', target: 'against 36', result: 'Hit', tone: 'ok' } } : {}) })
const state = (revealRolls?: string[]) => ({ revealRolls } as CombatState)
const view = (entries: CombatLogEntry[], cards: CombatLogEntry[] = [], settled: string[] = []) => ({ entries, cards, settled: new Set(settled) })

describe('the reveal wait', () => {
  it('waits on the first card that has not landed, before anything the state names', () => {
    const [opening, attack, strength] = [log('open', false), log('attack'), log('strength')]
    expect(combatRevealWait(view([opening, attack, strength], [attack, strength]), state(['attack', 'strength']))).toBe('card:attack')
    expect(combatRevealWait(view([opening, attack, strength], [attack, strength], ['attack']), state())).toBe('card:strength')
  })

  it('waits on rolls the state was rolled in until their log entries arrive', () => {
    expect(combatRevealWait(view([log('open', false)]), state(['attack', 'strength']))).toBe('rolls:attack,strength')
    expect(combatRevealWait(view([log('open', false), log('attack')]), state(['attack', 'strength']))).toBe('rolls:strength')
  })

  it('waits on nothing once every card has landed and every roll has arrived, or with no fight', () => {
    const attack = log('attack')
    expect(combatRevealWait(view([attack], [attack], ['attack']), state(['attack']))).toBeNull()
    expect(combatRevealWait(view([attack]), state(['attack']))).toBeNull()
    expect(combatRevealWait(view([]), null)).toBeNull()
  })
})

describe('the table log during a reveal', () => {
  it('stops short of the first card still landing, and shows everything once it has', () => {
    const [opening, attack, impact] = [log('open', false), log('attack'), log('impact', false)]
    expect(revealedEntries(view([opening, attack, impact], [attack]))).toEqual([opening])
    expect(revealedEntries(view([opening, attack, impact], [attack], ['attack']))).toEqual([opening, attack, impact])
  })

  it('shows the whole log for a card whose entry it does not hold', () => {
    const opening = log('open', false)
    expect(revealedEntries(view([opening], [log('elsewhere')]))).toEqual([opening])
  })
})
