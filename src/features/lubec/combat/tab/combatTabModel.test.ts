import { describe, expect, it } from 'vitest'
import { lubecDetachedItem } from '../../../ruleSets/lubec/gear/detachedItems'
import { parseLubecGmItem, type LubecGmItem } from '../../../ruleSets/lubec/gear/gmItem'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import type { Combatant, CombatSheet, CombatState } from '../engine/types'
import { combatCatchLine, combatCountWords, combatFloorRows, combatItemOptions, endedFloor } from './combatFloorRows'
import { combatantRole, combatPhaseView } from './combatPhases'
import { addFloorPick, adjustFloorPick, combatFloorSelections, combatSetupProblems, floorPickLimit, isSelected, setupFloorRows, toggleCombatant } from './combatSetupModel'

const ball = (id: string, fields: Record<string, unknown> = {}): LubecGmItem =>
  parseLubecGmItem({ name: 'Dodgeball', kind: 'weapon', mode: 'thrown', table: 'dodgeball', size: 1, qty: 1, impact: 0, catchChance: 50, catchPutsThrowerOut: true, status: 'library', ...fields }, id)
const floorOf = (...items: LubecGmItem[]) => items.map((item) => lubecDetachedItem(item, []))

describe('Floor rows', () => {
  it('groups records by name and catch rules for display and keeps every backing id', () => {
    const rope = parseLubecGmItem({ name: 'Rope', kind: 'thing', status: 'library' }, 'rope')
    const rows = combatFloorRows(floorOf(ball('a', { qty: 2 }), ball('b', { impact: 1 }), ball('c', { catchChance: 30 }), rope))
    expect(rows.map((row) => [row.item.name, row.count, row.recordIds])).toEqual([['Dodgeball', 3, ['a', 'b']], ['Dodgeball', 1, ['c']], ['Rope', 1, ['rope']]])
  })

  it('words catch rules as the mock-up does, and says nothing for an item nobody can catch', () => {
    expect(combatCatchLine(ball('a'))).toBe('Catch 50% · catching it puts the thrower out')
    expect(combatCatchLine(ball('a', { catchPutsThrowerOut: false, catchChance: 10 }))).toBe('Catch 10%')
    expect(combatCatchLine(ball('a', { catchChance: 0, catchPutsThrowerOut: false }))).toBe('')
    expect(combatCatchLine({ name: 'Bat', mode: 'melee', catchChance: 50 })).toBe('')
  })

  it('counts same-named items together in words', () => {
    const rows = [{ item: ball('a'), count: 2 }, { item: ball('b'), count: 4 }, { item: ball('r', { name: 'Fist-sized rock' }), count: 1 }]
    expect(combatCountWords(rows)).toBe('6 dodgeballs and 1 fist-sized rock')
    expect(combatCountWords([{ item: ball('a'), count: 1 }])).toBe('1 dodgeball')
    expect(combatCountWords([{ item: ball('a'), count: 1 }, { item: ball('b', { name: 'Bat' }), count: 1 }, { item: ball('c', { name: 'Rock' }), count: 2 }])).toBe('1 dodgeball, 1 bat and 2 rocks')
    expect(combatCountWords([])).toBe('')
  })

  it('says what End sent to Items, capitalised, with the total', () => {
    expect(endedFloor({ floor: floorOf(ball('a', { qty: 6 })) })).toEqual({ words: '6 dodgeballs', total: 6 })
    expect(endedFloor({ floor: [] })).toEqual({ words: '', total: 0 })
  })

  it('labels picks so that items which would read alike also show their Impact', () => {
    const options = combatItemOptions([
      ball('a'), ball('b', { impact: 1 }), ball('d', { status: 'dropped', qty: 3 }), ball('r', { name: 'Fist-sized rock', catchChance: 10 }), ball('x', { name: 'Bat', mode: 'melee' }),
      parseLubecGmItem({ name: 'Rope', kind: 'thing', status: 'library' }, 'rope-1'), parseLubecGmItem({ name: 'Rope', kind: 'thing', status: 'library' }, 'rope-2'),
    ])
    expect(options.map((option) => option.label)).toEqual([
      'Dodgeball (catch 50%) · Impact + 0', 'Dodgeball (catch 50%) · Impact + 1', 'Dodgeball (catch 50%) · dropped ×3', 'Fist-sized rock (catch 10%)', 'Bat',
      'Rope · Impact + 0', 'Rope · Impact + 0',
    ])
  })
})

const sheet = (sheetId: string, base = {}): CombatSheet =>
  ({ kind: 'character', sheetId, name: `Kid ${sheetId}`, ownerUserId: 'p', portraitPath: '', sheet: lubecCharacterSheet({ base: { ...lubecCharacterSheet().base, ...base } }) })

describe('local setup', () => {
  it('toggles combatants without writing anything', () => {
    const one = { kind: 'character' as const, sheetId: 'one' }
    const picked = toggleCombatant([], one)
    expect(isSelected(picked, one)).toBe(true)
    expect(toggleCombatant(picked, { ...one })).toEqual([])
  })

  it('names each selected combatant\'s missing inputs as Start would, with the sheet to repair', () => {
    const problems = combatSetupProblems([{ kind: 'character', sheetId: 'hole' }, { kind: 'character', sheetId: 'fine' }, { kind: 'npc', sheetId: 'gone' }], [sheet('hole', { Speed: null, Body: null }), sheet('fine')])
    expect(problems.map((problem) => [problem.name, problem.text])).toEqual([
      ['Kid hole', 'Kid hole: missing Speed; repair Speed, Body.'],
      ['Kid hole', 'Kid hole: missing Dodgeball Body; repair Speed, Body.'],
      ['npc:gone', 'npc:gone: sheet is missing or unreadable.'],
    ])
  })

  it('caps a dropped pick at its record, lets library counts grow, and drops a pick at zero', () => {
    const dropped = ball('d', { status: 'dropped', qty: 2 })
    const library = ball('l')
    expect([floorPickLimit(dropped), floorPickLimit(library)]).toEqual([2, 99])
    let picks = addFloorPick(addFloorPick(addFloorPick([], dropped), dropped), dropped)
    expect(picks).toEqual([{ itemId: 'd', status: 'dropped', qty: 2 }])
    picks = addFloorPick(picks, library)
    expect(adjustFloorPick(picks, dropped, -2)).toEqual([{ itemId: 'l', status: 'library', qty: 1 }])
  })

  it('shows picks as rows backed by their own items, leaving out a pick whose item has gone', () => {
    const rows = setupFloorRows([{ itemId: 'l', status: 'library', qty: 3 }, { itemId: 'gone', status: 'dropped', qty: 1 }], [ball('l')])
    expect(rows.map((row) => [row.key, row.count, row.source.id])).toEqual([['l', 3, 'l']])
  })

  it('sends a library count as copies of at most its stack, and a dropped pick as it is', () => {
    const items = [ball('one'), ball('three', { qty: 3 }), ball('d', { status: 'dropped', qty: 5 })]
    expect(combatFloorSelections([
      { itemId: 'one', status: 'library', qty: 2 }, { itemId: 'three', status: 'library', qty: 7 }, { itemId: 'd', status: 'dropped', qty: 4 }, { itemId: 'gone', status: 'library', qty: 2 },
    ], items)).toEqual([
      { itemId: 'one', status: 'library', qty: 1 }, { itemId: 'one', status: 'library', qty: 1 },
      { itemId: 'three', status: 'library', qty: 3 }, { itemId: 'three', status: 'library', qty: 3 }, { itemId: 'three', status: 'library', qty: 1 },
      { itemId: 'd', status: 'dropped', qty: 4 }, { itemId: 'gone', status: 'library', qty: 2 },
    ])
  })
})

describe('phase view', () => {
  it('names Before initiative and its stepper, and any later round by number', () => {
    expect(combatPhaseView({ phase: 'before-initiative', round: 0 } as CombatState)).toEqual({ round: 'Before initiative', stage: 'attacks run at once', steps: ['Pre-initiative attacks', 'Roll Initiative'], now: 0 })
    expect(combatPhaseView({ phase: 'movement', round: 2 } as CombatState)).toMatchObject({ round: 'Round 2', steps: ['Movement', 'Declare', 'Attack'] })
  })

  it('tells the viewer which row is theirs', () => {
    const row = (kind: 'character' | 'npc', ownerUserId: string) => ({ kind, ownerUserId }) as Combatant
    expect([combatantRole(row('character', 'me'), 'me'), combatantRole(row('character', 'you'), 'me'), combatantRole(row('npc', 'me'), 'me')]).toEqual(['You', 'Player', 'NPC'])
  })
})
