import { describe, expect, it } from 'vitest'
import type { LubecCheckRoll } from './checkRoll'
import type { LubecEffect } from './effects'
import { emptyLubecGear, type LubecItem } from './gear/gearRecord'
import { lubecCharacterSheet } from './sheetFixtures'
import { lubecCheckParts, lubecValueParts } from './valueParts'

// How the number a roll is made under is reached, each change named by where
// it comes from, for Tommy Eves (a Working Kid: Speed 51 + 5, Handle 50 + 5).

const card = (name: string, step: Record<string, unknown>, part?: string): LubecEffect =>
  ({ id: name, name, cause: 'test', ...(part ? { part } : {}), steps: [{ modifiers: [], labels: [], ...step }] })
const anvil = { id: 'anvil', name: 'Anvil', kind: 'thing', carrier: 'hands', slot: 0, size: 1, qty: 1, weight: 'extra', check: 'pass', note: '' } as unknown as LubecItem

describe('a value\'s parts', () => {
  it('starts from the base and the class', () => {
    expect(lubecValueParts(lubecCharacterSheet(), 'Speed')).toEqual([{ label: 'Base', value: '51' }, { label: 'Working Kid', value: '+5' }])
  })

  it('names each card by its wound: its fraction, then its flat amount, then what it drops the value to', () => {
    const wound = card('Shattered forearm', { fractions: [{ target: 'Handle', factor: 0.5 }], modifiers: [{ target: 'Handle', amount: -10 }], setTo: [{ target: 'Handle', value: 20 }] }, 'Forearm')
    const other = card('Sprain', { modifiers: [{ target: 'Speed', amount: -10 }] })
    expect(lubecValueParts(lubecCharacterSheet({ effects: [wound, other] }), 'Handle')).toEqual([
      { label: 'Base', value: '50' }, { label: 'Working Kid', value: '+5' },
      { label: 'Shattered forearm', value: 'halved' }, { label: 'Shattered forearm', value: '-10' }, { label: 'Shattered forearm', value: 'drops to 20' },
    ])
  })

  it('counts a card on a narrow action only for a roll that is that action', () => {
    const hand = card('Broken hand', { taskModifiers: [{ target: 'Handle', amount: -20, task: 'punch' }] })
    const sheet = lubecCharacterSheet({ effects: [hand] })
    expect(lubecValueParts(sheet, 'Handle', ['punch'])).toContainEqual({ label: 'Broken hand', value: '-20' })
    expect(lubecValueParts(sheet, 'Handle')).not.toContainEqual({ label: 'Broken hand', value: '-20' })
  })

  it('names gear\'s Speed losses by their reason, unless the player switched one off', () => {
    const gear = { ...emptyLubecGear(), items: [anvil] }
    expect(lubecValueParts(lubecCharacterSheet({ gear }), 'Speed')).toContainEqual({ label: 'Anvil: extra heavy, always', value: '-20' })
    expect(lubecValueParts(lubecCharacterSheet({ gear: { ...gear, overrides: ['extra:anvil'] } }), 'Speed')).toHaveLength(2)
  })

  it('says when the floor held the value up', () => {
    const crushed = card('Crushed', { modifiers: [{ target: 'Strength', amount: -40 }] })
    expect(lubecValueParts(lubecCharacterSheet({ effects: [crushed] }), 'Strength')!.at(-1)).toEqual({ label: 'Floor', value: 'no lower than 10' })
  })

  it('has no parts for a hole', () => {
    const sheet = lubecCharacterSheet()
    expect(lubecValueParts({ ...sheet, base: { ...sheet.base, Speed: null } }, 'Speed')).toBeNull()
  })
})

const check = (fields: Partial<LubecCheckRoll>): LubecCheckRoll => ({
  kind: 'stat-check', against: 'Handle', target: 55, dice: [30], result: 30, advantage: 'normal', skill: null, outcome: 'success', stressAdded: 0, ...fields,
} as LubecCheckRoll)

describe('a Core roll\'s target as parts', () => {
  it('is the value\'s parts, with an armed skill added as its own part', () => {
    const sheet = lubecCharacterSheet()
    expect(lubecCheckParts(sheet, check({}))).toEqual([{ label: 'Base', value: '50' }, { label: 'Working Kid', value: '+5' }])
    expect(lubecCheckParts(sheet, check({ skill: 'Swimming', target: 65 }))!.at(-1)).toEqual({ label: 'Swimming', value: '+10' })
  })

  it('shows no parts once the sheet has changed so they would not reach the roll\'s target', () => {
    expect(lubecCheckParts(lubecCharacterSheet(), check({ target: 70 }))).toBeNull()
  })
})
