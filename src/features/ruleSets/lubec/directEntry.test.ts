import { describe, expect, it } from 'vitest'
import { parseLubecCharacter, serializeLubecCharacter } from './characterParser'
import {
  makeLubecDirectEntryCharacter,
  parseLubecBaseEntry,
  withLubecBaseValue,
  withLubecClass,
  withLubecClassChoice,
} from './directEntry'
import { lubecFinalValue } from './derivations'

const owner = { userId: 'player-1', username: 'tommyev' }

describe('a Direct entry character', () => {
  it('is an established draft owned by its creator, made through the Direct entry door, with the starting counters', () => {
    const character = makeLubecDirectEntryCharacter('kid-1', owner)

    expect(character).toMatchObject({
      id: 'kid-1',
      system: 'lubec',
      ownerUserId: 'player-1',
      ownerUsername: 'tommyev',
      creationMode: 'established',
      creationStatus: 'established_draft',
    })
    expect(character.lubec.door).toBe('direct')
    expect(character.lubec.counters).toEqual({ stress: 2, minimumStress: 2, trauma: 0 })
    expect(character.lubec.effects).toEqual([])
  })

  it('starts with every base value, the class and its choice as holes, which survive a save', () => {
    const stored = serializeLubecCharacter(makeLubecDirectEntryCharacter('kid-1', owner))
    const reread = parseLubecCharacter('kid-1', stored)

    expect(Object.values(reread.lubec.base)).toEqual([null, null, null, null, null, null, null, null])
    expect(reread.lubec.class).toEqual({ key: null, choices: { statPenalty: null, statBonus: null } })
    expect(stored.lubec).toMatchObject({ base: { Strength: null, Body: null }, class: { key: null } })
  })
})

describe('a typed base value', () => {
  it.each([
    ['42', 42],
    [' 7 ', 7],
    ['0', 0],
    ['-5', -5],
    ['', null],
    ['   ', null],
    ['12.5', null],
    ['4x', null],
    ['-', null],
  ])('reads %j as %j', (text, value) => {
    expect(parseLubecBaseEntry(text)).toBe(value)
  })
})

describe('direct entry edits', () => {
  const draft = () => makeLubecDirectEntryCharacter('kid-1', owner).lubec

  it('sets one base value and leaves the rest', () => {
    const sheet = { ...draft(), ...withLubecBaseValue(draft(), 'Speed', 51) }

    expect(sheet.base.Speed).toBe(51)
    expect(sheet.base.Strength).toBeNull()
  })

  it('changes the class and clears the old class\'s choice, keeping fields it does not model', () => {
    const nerd = { ...draft(), class: { key: 'nerd', choices: { statPenalty: 'Charm', statBonus: null, note: 'kept' } } }

    expect(withLubecClass(nerd, 'popular').class).toEqual({
      key: 'popular',
      choices: { statPenalty: null, statBonus: null, note: 'kept' },
    })
  })

  it('sets a class choice, which then reaches the final value it names', () => {
    const base = { ...draft().base, Charm: 40 }
    const nerd = { ...draft(), base, ...withLubecClass(draft(), 'nerd') }
    const chosen = { ...nerd, ...withLubecClassChoice(nerd, 'statPenalty', 'Charm') }

    expect(lubecFinalValue(nerd, 'Charm')).toBeNull()
    expect(lubecFinalValue(chosen, 'Charm')).toBe(30)
  })
})
