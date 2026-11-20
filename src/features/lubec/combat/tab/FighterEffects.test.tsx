// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { LubecCharacterRecord } from '../../../ruleSets/lubec/characterRecord'
import { makeLubecDirectEntryCharacter } from '../../../ruleSets/lubec/directEntry'
import type { LubecEffect } from '../../../ruleSets/lubec/effects'
import { lubecCharacterSheet } from '../../../ruleSets/lubec/sheetFixtures'
import { publicCombatant } from '../engine/inputs'
import type { CombatSheet, CombatState } from '../engine/types'
import type { CombatEffectsAccess, CombatSheetWriter } from './fighterEffectsModel'
import { TurnOrderPanel } from './TurnOrder'

// Each fighter's active cards where the fight is played: under their row in the
// turn order for whoever can read the sheet, and the sheet's own Effects panel
// one tap away, with Step down for whoever may change it.

afterEach(cleanup)
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})

const wound = {
  groupId: 'w1', table: 'cutting', tableName: 'Cutting', location: 'forearm', part: 'forearm-L', impact: 5, severity: 'Serious', row: 'Deep gash',
  prose: 'Bleeding timer. `-20 Handle` until 1 Long Rest.', branch: null, contentVersion: 'cutting.md@1', dice: { 'Bleeding d4': [2] }, checks: [], trauma: 1, stress: 0, minimumStress: 0,
}
const bleeding: LubecEffect = {
  id: 'w1_bleed', cardKey: 'bleed', name: 'Deep gash', part: 'Bleeding', cause: 'Cutting', wound, countdown: { kind: 'bleed', rounds: 2 }, combatOrigin: { originatingRound: 1 },
  steps: [{ modifiers: [], labels: ['+1 Trauma in d4 = 2 rounds'], until: 'rounds' }],
}
const arm: LubecEffect = {
  id: 'w1_arm', cardKey: 'arm', name: 'Deep gash', part: 'Forearm', cause: 'Cutting', wound,
  steps: [{ modifiers: [{ target: 'Handle', amount: -20 }], labels: [], until: 'long-rest', restrictions: [{ kind: 'no-two-handed' }] }],
}

function record(id: string, name: string, owner: string, effects: LubecEffect[]): LubecCharacterRecord {
  const character = makeLubecDirectEntryCharacter(id, { userId: owner, username: 'someone' })
  return { ...character, name, creationStatus: 'active', lubec: { ...lubecCharacterSheet({ effects }), counters: { stress: 0, minimumStress: 0, trauma: 1 } } }
}
const sheetOf = (character: LubecCharacterRecord, kind: 'character' | 'npc'): CombatSheet =>
  ({ kind, sheetId: character.id, name: character.name, ownerUserId: character.ownerUserId, portraitPath: '', sheet: character.lubec })

const wayne = record('wayne', 'Wayne', 'wayne-uid', [bleeding, arm])
const roy = record('roy', 'Roy', 'gm', [arm])
const state: CombatState = {
  round: 1, phase: 'before-initiative', stageInstanceId: 's', floor: [], attack: null, woundOutbox: [], woundAcknowledgements: [],
  combatants: [publicCombatant(sheetOf(wayne, 'character')), publicCombatant(sheetOf(roy, 'npc'))],
}
const writer = (): CombatSheetWriter => ({ updateCharacter: vi.fn(), updateCharacterNow: vi.fn(), hasPendingWrite: () => false, recovery: () => null })
const scope = { groupId: 'g', campaignId: 'c' }
const npc = { id: 'roy', name: 'Roy', portraitPath: '', portraitUrl: null, portraitFocusX: 50, portraitFocusY: 50, tokenIcon: { icon: 'pawn', color: '#555555', size: 34 } }

const show = (access: CombatEffectsAccess) =>
  render(<div className="shell-root" data-theme="lubec"><div className="lubec-combat"><TurnOrderPanel state={state} userId={access.viewer.userId} effects={access} /></div></div>)
const entriesOf = (name: string) => within(screen.getByRole('list', { name: `${name}'s effects` })).getAllByRole('button')
const OPEN = '. Open details and actions'

describe('effects in the turn order', () => {
  it('lists every fighter\'s wounds under their row for the GM, one button each, named and worded as the table writes them', () => {
    show({ roster: { characters: [wayne], npcs: [{ npc, sheet: roy }] }, writers: { characters: writer(), npcSheets: writer() }, scope, viewer: { role: 'gm', userId: 'gm' } })
    // Each wound is one chip on the fighter's line, by the table's name; its title is the table's words and the round it is due.
    const words = 'Deep gash · Bleeding timer. -20 Handle until 1 Long Rest'
    expect(entriesOf('Wayne').map((entry) => [entry.textContent, entry.getAttribute('title'), entry.getAttribute('aria-label')])).toEqual([
      ['Deep gash', `${words} · Due at the end of round 3`, `${words} · Due at the end of round 3${OPEN}`],
    ])
    expect(entriesOf('Roy').map((entry) => entry.getAttribute('aria-label'))).toEqual([`${words}${OPEN}`])
    expect(entriesOf('Wayne').every((entry) => entry.getAttribute('type') === 'button')).toBe(true)
    expect(screen.queryByRole('button', { name: /^Effects$|effects$/ })).toBeNull()
  })

  it('shows a player only the sheets they can read, and nothing for a fighter with no cards', () => {
    const calm = record('wayne', 'Wayne', 'wayne-uid', [])
    show({ roster: { characters: [calm], npcs: [] }, writers: { characters: writer(), npcSheets: null }, scope, viewer: { role: 'player', userId: 'wayne-uid' } })
    expect(screen.queryByRole('list', { name: "Wayne's effects" })).toBeNull()
    expect(screen.queryByRole('list', { name: "Roy's effects" })).toBeNull()
    expect(screen.queryByRole('button', { name: /Open details and actions$/ })).toBeNull()
  })

  it('opens the tapped card\'s details and actions over the fight, and Step down saves the sheet the way the sheet does', () => {
    const characters = writer()
    show({ roster: { characters: [wayne], npcs: [] }, writers: { characters, npcSheets: null }, scope, viewer: { role: 'player', userId: 'wayne-uid' } })
    fireEvent.click(screen.getByRole('button', { name: /^Deep gash · / }))
    const dialog = screen.getByRole('dialog', { name: "Wayne's effects" })
    expect(within(dialog).getByLabelText('Deep gash wound').textContent).toContain('Left forearm')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Step down Deep gash: Handle -20, Two-handed actions impossible' }))
    expect(characters.updateCharacter).toHaveBeenCalledWith('wayne', { lubec: { ...wayne.lubec, effects: [bleeding] } }, wayne)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a tapped card\'s wound read-only for a viewer who may not change the sheet', () => {
    show({ roster: { characters: [wayne], npcs: [] }, writers: { characters: writer(), npcSheets: null }, scope, viewer: { role: 'player', userId: 'someone-else' } })
    fireEvent.click(screen.getByRole('button', { name: /^Deep gash · / }))
    const dialog = screen.getByRole('dialog', { name: "Wayne's effects" })
    expect(within(dialog).queryByRole('button', { name: /^Step down/ })).toBeNull()
    expect(within(dialog).getByLabelText('Deep gash wound').textContent).toContain('Bleeding d4 2')
  })

  it('opens a hand-made card in its editor for the GM, and its line alone for a viewer who may not change it', () => {
    const sunburn: LubecEffect = { id: 'sun', name: 'Sunburn', cause: 'Beach', steps: [{ modifiers: [], labels: ['Sore'] }] }
    const burnt = record('wayne', 'Wayne', 'wayne-uid', [sunburn])
    const view = show({ roster: { characters: [burnt], npcs: [] }, writers: { characters: writer(), npcSheets: null }, scope, viewer: { role: 'gm', userId: 'gm' } })
    fireEvent.click(screen.getByRole('button', { name: /^Sunburn · Sore/ }))
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /Remove/i })).toBeTruthy()
    view.unmount()
    show({ roster: { characters: [burnt], npcs: [] }, writers: { characters: writer(), npcSheets: null }, scope, viewer: { role: 'player', userId: 'someone-else' } })
    fireEvent.click(screen.getByRole('button', { name: /^Sunburn · Sore/ }))
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Remove/i })).toBeNull()
  })
})
