// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { LubecEffect } from '../ruleSets/lubec/effects'
import { lubecCharacterSheet } from '../ruleSets/lubec/sheetFixtures'
import { LubecEffectsPanel } from './LubecEffectsPanel'

// The Effects panel's wound cards: the compact line, the linked cards of one
// wound under its name, the wound it came from on opening (for every viewer),
// and Step down for whoever may change the sheet.

afterEach(cleanup)

const wound = {
  groupId: 'wound_1', table: 'blunt', tableName: 'Blunt Force', location: 'forearm', part: 'forearm-L', impact: 4, severity: 'Serious',
  row: 'Forearm injury', prose: '`-20 Handle` until 1 Long Rest.', branch: null, contentVersion: 'blunt-force.md@1119f060',
  dice: { 'Hit location': [37] }, checks: [{ purpose: 'Keep hold', kind: 'stat-check', against: 'Handle', mode: 'normal', target: 55, dice: [71], result: 71, success: false, stress: 1 }],
  trauma: 1, stress: 1, minimumStress: 0,
}
const forearm: LubecEffect = { id: 'wound_1_injury', cardKey: 'injury', name: 'Forearm injury', part: 'Forearm', cause: 'Blunt Force, left forearm, Impact 4', wound, steps: [{ modifiers: [{ target: 'Handle', amount: -20 }], labels: [], until: 'long-rest' }] }
const lasting: LubecEffect = { id: 'wound_1_scar', cardKey: 'scar', name: 'Forearm injury', part: 'Scar', cause: 'Blunt Force', wound, steps: [{ modifiers: [{ target: 'Charm', amount: -10 }], labels: [], until: 'lasting' }] }
const handMade: LubecEffect = { id: 'note', name: 'Sunburn', cause: 'Beach', steps: [{ modifiers: [], labels: ['Sore'] }] }

const mount = (effects: LubecEffect[], onChange: ((effects: LubecEffect[]) => void) | null) =>
  render(<div className="shell-root" data-theme="lubec"><LubecEffectsPanel effects={effects} counters={lubecCharacterSheet().counters} onChange={onChange} gear={lubecCharacterSheet().gear} onGearChange={null} /></div>)

const region = () => screen.getByLabelText('Active effects')
const lineTexts = () => [...region().querySelectorAll('.lubec-effect-line')].map((line) => [...line.children].map((part) => part.textContent))

describe('a wound card', () => {
  it('reads its name, what it does now, what ends it and what follows', () => {
    mount([forearm], null)
    expect(lineTexts()).toEqual([['Forearm injury', 'Handle -20', 'Step down after 1 Long Rest', 'then healed']])
  })

  it('says Lasting on a lasting card without inventing a recovery', () => {
    mount([{ ...lasting, wound: { ...wound, groupId: 'other' } }], null)
    expect(lineTexts()).toEqual([['Forearm injury', 'Charm -10', 'Lasting']])
  })

  it('gathers a wound\'s linked cards under its name, each named by its part', () => {
    mount([forearm, handMade, lasting], null)
    expect([...region().querySelectorAll('.lubec-effect-group')].map((group) => group.textContent)).toEqual(['Forearm injury'])
    expect(lineTexts().map((line) => line[0])).toEqual(['Forearm', 'Scar', 'Sunburn'])
  })

  it('opens the wound it came from, even for a viewer who may not change the sheet', () => {
    mount([forearm], null)
    fireEvent.click(within(region()).getByRole('button', { name: /Forearm injury/ }))
    const detail = screen.getByLabelText('Forearm injury wound')
    const facts = Object.fromEntries([...detail.querySelectorAll('.lubec-wound-fact')].map((fact) => [fact.querySelector('dt')!.textContent, fact.querySelector('dd')!.textContent]))
    expect(facts).toMatchObject({
      Table: 'Blunt Force', Struck: 'Left forearm', Impact: '4', Severity: 'Serious', Wound: 'Forearm injury', Row: '-20 Handle until 1 Long Rest.',
      Rolled: 'Hit location 37', Roll: 'Keep hold: Handle Check 71 against 55, failed, +1 Stress', Charged: 'Trauma +1, Stress +1', Source: 'blunt-force.md@1119f060',
    })
    expect(within(detail).queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(region().querySelector('.lubec-effect > .secondary-button')).toBeNull()
  })

  it('steps down only its own card for the owner or GM, never repeating anything else', () => {
    const onChange = vi.fn()
    mount([forearm, lasting, handMade], onChange)
    fireEvent.click(within(region()).getByRole('button', { name: 'Step down Forearm injury Forearm' }))
    expect(onChange).toHaveBeenCalledWith([lasting, handMade])
  })

  it('marks a consequence the app does not play yet as resolved by hand, and only that', () => {
    const brief: LubecEffect = { ...forearm, id: 'wound_1_brief', cardKey: 'brief', part: 'Off guard', steps: [{ modifiers: [], labels: [], until: 'long-rest', restrictions: [{ kind: 'no-run' }] }] }
    mount([brief, { ...forearm, wound: { ...wound, groupId: 'two' } }], null)
    expect(lineTexts()).toEqual([
      ['Forearm injury', 'Cannot run', 'Step down after 1 Long Rest', 'then healed', 'Resolved by hand'],
      ['Forearm injury', 'Handle -20', 'Step down after 1 Long Rest', 'then healed'],
    ])
  })

  it('adds a lasting step\'s Minimum Stress with the Step down that reaches it, and only then', () => {
    const onChange = vi.fn()
    const lastStep = { modifiers: [{ target: 'Body' as const, amount: -20 }], labels: [], until: 'lasting' as const, minimumStress: 4 }
    const body: LubecEffect = { ...forearm, id: 'wound_1_body', cardKey: 'body', part: 'Body', steps: [{ modifiers: [], labels: [], until: 'long-rest' }, lastStep] }
    mount([body], onChange)
    fireEvent.click(within(region()).getByRole('button', { name: 'Step down Forearm injury' }))
    expect(onChange).toHaveBeenCalledWith([{ ...body, steps: [lastStep] }], { ...lubecCharacterSheet().counters, minimumStress: lubecCharacterSheet().counters.minimumStress + 4 })
  })

  it('names the round a brief window from a fight ends with', () => {
    const brief: LubecEffect = { ...forearm, combatOrigin: { fightId: 'f', woundId: 'w', originatingRound: 2, effectiveRound: 2 }, steps: [{ modifiers: [], labels: [], until: 'next-round-end', rolls: [{ scope: 'attacks', mode: 'disadvantage' }] }] }
    mount([brief], null)
    expect(lineTexts()).toEqual([['Forearm injury', 'Attacks at Disadvantage', 'Ends with round 3', 'then healed']])
  })

  it('keeps a hand-made effect opening straight into its editor', () => {
    mount([handMade], vi.fn())
    fireEvent.click(region().querySelector('button.lubec-effect-line')!)
    expect(region().querySelector('.lubec-effect-editor')).not.toBeNull()
  })
})
