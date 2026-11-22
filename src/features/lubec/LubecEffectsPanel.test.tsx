// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { LubecEffect } from '../ruleSets/lubec/effects'
import { lubecCharacterSheet } from '../ruleSets/lubec/sheetFixtures'
import { LubecEffectsPanel } from './LubecEffectsPanel'

// The Effects panel's wound cards: each wound under the table's own name and
// words, its cards' compact lines, the wound it came from on opening (for
// every viewer), and Step down for whoever may change the sheet.

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
  it('sits under the table\'s name, severity, Trauma and words, and its line says only what it does now', () => {
    mount([forearm], null)
    const heading = region().querySelector('.lubec-effect-group')!
    expect([...heading.children].map((part) => part.textContent)).toEqual(['Forearm injury', 'Serious · Trauma +1', '-20 Handle until 1 Long Rest.'])
    expect(lineTexts()).toEqual([['Handle -20']])
  })

  it('shows a Trauma +0 wound\'s Trauma too', () => {
    mount([{ ...forearm, wound: { ...wound, trauma: 0 } }], null)
    expect(region().querySelector('.lubec-effect-group-meta')!.textContent).toBe('Serious · Trauma +0')
  })

  it('says Lasting on a lasting card without inventing a recovery', () => {
    mount([{ ...lasting, wound: { ...wound, groupId: 'other' } }], null)
    expect(lineTexts()).toEqual([['Charm -10']])
  })

  it('gathers a wound\'s linked cards under its one heading, with no names the table does not give', () => {
    mount([forearm, handMade, lasting], null)
    expect([...region().querySelectorAll('.lubec-effect-group-name')].map((group) => group.textContent)).toEqual(['Forearm injury'])
    expect(lineTexts().map((line) => line[0])).toEqual(['Handle -20', 'Charm -10', 'Sunburn'])
    expect(region().textContent).not.toMatch(/Forearm(?! injury)|Scar/)
  })

  it('opens the wound it came from, even for a viewer who may not change the sheet', () => {
    mount([forearm], null)
    fireEvent.click(within(region()).getByRole('button', { name: /Forearm injury/ }))
    const detail = screen.getByLabelText('Forearm injury wound')
    const facts = Object.fromEntries([...detail.querySelectorAll('.lubec-wound-fact')].map((fact) => [fact.querySelector('dt')!.textContent, fact.querySelector('dd')!.textContent]))
    expect(facts).toEqual({
      Table: 'Blunt Force', Struck: 'Left forearm', Impact: '4', Severity: 'Serious',
      Rolled: 'Hit location 37', Roll: 'Keep hold: Handle Check 71 against 55, failed, +1 Stress', Charged: 'Trauma +1, Stress +1',
    })
    expect(within(detail).queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(region().querySelector('.lubec-effect > .secondary-button')).toBeNull()
  })

  it('lists the d2, both dice of a roll at Advantage, and the drop it rolled for', () => {
    const shot = {
      ...wound, branch: 2, dice: { 'Hit location': [37], Fingers: [] },
      checks: [{ purpose: 'Keep hold', kind: 'stat-check', against: 'Handle', mode: 'advantage', target: 55, dice: [71, 4], result: 4, success: true, stress: 0 }],
      drop: { hand: 'left', kept: true, held: 'Club' },
    }
    mount([{ ...forearm, wound: shot }], null)
    fireEvent.click(within(region()).getByRole('button', { name: /Forearm injury/ }))
    const facts = [...screen.getByLabelText('Forearm injury wound').querySelectorAll('.lubec-wound-fact')].map((fact) => [fact.querySelector('dt')!.textContent, fact.querySelector('dd')!.textContent])
    expect(facts).toEqual(expect.arrayContaining([
      ['d2', '2'], ['Rolled', 'Hit location 37'],
      ['Roll', 'Keep hold: Handle Check Advantage 71 and 04, kept 04 against 55, passed'],
      ['Drop', 'Kept hold of the Club in the left hand'],
    ]))
    expect(facts.map(([label]) => label)).not.toContain('Fingers')
  })

  it('opens a wound saved before its dice and rolls were kept, without inventing either', () => {
    const { dice: _dice, checks: _checks, ...bare } = wound
    mount([{ ...forearm, wound: bare }], null)
    fireEvent.click(within(region()).getByRole('button', { name: /Forearm injury/ }))
    const labels = [...screen.getByLabelText('Forearm injury wound').querySelectorAll('.lubec-wound-fact dt')].map((term) => term.textContent)
    expect(labels).toEqual(['Table', 'Struck', 'Impact', 'Severity', 'Charged'])
  })

  it('says nothing about a charge the wound did not make', () => {
    mount([{ ...forearm, wound: { ...wound, trauma: 0, stress: 0 } }], null)
    fireEvent.click(within(region()).getByRole('button', { name: /Forearm injury/ }))
    const labels = [...screen.getByLabelText('Forearm injury wound').querySelectorAll('.lubec-wound-fact dt')].map((term) => term.textContent)
    expect(labels).not.toContain('Charged')
  })

  it('steps down only its own card for the owner or GM, never repeating anything else', () => {
    const onChange = vi.fn()
    mount([forearm, lasting, handMade], onChange)
    fireEvent.click(within(region()).getByRole('button', { name: 'Step down Forearm injury: Handle -20' }))
    expect(onChange).toHaveBeenCalledWith([lasting, handMade])
  })

  it('marks a consequence the app does not play yet as resolved by hand, and only that', () => {
    const brief: LubecEffect = { ...forearm, id: 'wound_1_brief', cardKey: 'brief', part: 'Off guard', steps: [{ modifiers: [], labels: [], until: 'rounds', restrictions: [{ kind: 'no-run' }] }] }
    mount([brief, { ...forearm, wound: { ...wound, groupId: 'two' } }], null)
    expect(lineTexts()).toEqual([['Cannot run', 'Resolved by hand'], ['Handle -20']])
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
    expect(lineTexts()).toEqual([['Attacks at Disadvantage', 'Ends with round 3']])
  })

  it('keeps a hand-made effect opening straight into its editor', () => {
    mount([handMade], vi.fn())
    fireEvent.click(region().querySelector('button.lubec-effect-line')!)
    expect(region().querySelector('.lubec-effect-editor')).not.toBeNull()
  })
})


it('offers a waking Save before clearing Head 9 and sends it once without an ordinary whole-list edit', async () => {
  const card = { ...forearm, id: 'head9', name: 'Knocked out', wakeSave: 'severe-concussion', steps: [{ modifiers: [], labels: ['13 minutes'], until: 'by-hand' as const, restrictions: [{ kind: 'unconscious' as const }] }] }
  const change = vi.fn()
  const recover = vi.fn(async () => ({ status: 'committed' as const, operationId: 'wake', revision: 3 }))
  render(<LubecEffectsPanel effects={[card]} counters={lubecCharacterSheet().counters} onChange={change} onRecover={recover} gear={lubecCharacterSheet().gear} onGearChange={null} />)
  fireEvent.click(screen.getByRole('button', { name: /Step down Knocked out/ }))
  expect(screen.getByRole('dialog', { name: 'Waking Save' })).toBeTruthy()
  const submit = screen.getByRole('button', { name: 'Wake and roll Body Save' })
  fireEvent.click(submit)
  fireEvent.click(submit)
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Waking Save' })).toBeNull())
  expect(recover).toHaveBeenCalledExactlyOnceWith('head9', 'wake')
  expect(change).not.toHaveBeenCalled()
})

it('offers the speech card\'s recovery Save at its Step down, sends it once, and steps no sibling down', async () => {
  const card = {
    ...forearm, id: 'speech', name: 'Windpipe opened', part: 'Speech',
    steps: [
      { modifiers: [], labels: [], until: 'long-rest' as const, restrictions: [{ kind: 'speech' as const, words: 'Whisper only' }] },
      { modifiers: [], labels: ['Body Save'], until: 'by-hand' as const, onReach: { save: 'Body', failure: 'Speech damaged' } },
    ],
  }
  const change = vi.fn()
  const recover = vi.fn(async () => ({ status: 'committed' as const, operationId: 'reach', revision: 3 }))
  render(<LubecEffectsPanel effects={[card, forearm]} counters={lubecCharacterSheet().counters} onChange={change} onRecover={recover} gear={lubecCharacterSheet().gear} onGearChange={null} />)
  fireEvent.click(screen.getAllByRole('button', { name: /Step down Windpipe opened/ })[0])
  const dialog = screen.getByRole('dialog', { name: 'Recovery Save' })
  expect(dialog.textContent).toContain('Stepping Windpipe opened down reaches its recovery point: roll a Body Save once. Failure leaves Speech damaged')
  const submit = screen.getByRole('button', { name: 'Step down and roll Body Save' })
  fireEvent.click(submit)
  fireEvent.click(submit)
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Recovery Save' })).toBeNull())
  expect(recover).toHaveBeenCalledExactlyOnceWith('speech', 'reach')
  expect(change).not.toHaveBeenCalled()
})
