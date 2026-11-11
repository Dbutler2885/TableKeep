// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { LubecLiveFight } from './combatWatch'
import type { CombatCommand, CombatOutcome } from './engine/types'

const mocks = vi.hoisted(() => ({ sent: [] as CombatCommand[], outcome: { ok: true } as CombatOutcome }))
vi.mock('./useLubecCombatSend', () => ({
  useLubecCombatSend: () => async (_key: string, make: () => CombatCommand) => {
    mocks.sent.push(make())
    return mocks.outcome
  },
}))

const { DeclarationReviewModal } = await import('./DeclarationReviewModal')
const scope = { groupId: 'g', campaignId: 'c' }
const WAYNE = 'character:wayne'
const ROY = 'npc:roy'

function reviewing(): LubecLiveFight {
  const person = { name: 'Wayne', kind: 'character' as const, sheetId: 'wayne', ownerUserId: 'player', key: WAYNE, portraitPath: '', speed: 50, armor: [], interactionSequence: 0, outReason: null }
  return { id: 'fight', fight: { status: 'live', participantUserIds: ['player'], state: {
    phase: 'declare', round: 1, stageInstanceId: 'review-1', order: [ROY, WAYNE], floor: [], attack: null, woundOutbox: [], woundAcknowledgements: [],
    combatants: [{ ...person, proposedDeclaration: { ran: false, full: true, aim: null, frozen: null, total: 50, lines: [{ against: ROY, amount: 50 }], sourceRevision: 1 } }, { ...person, key: ROY, kind: 'npc', sheetId: 'roy', ownerUserId: 'gm', name: 'Roy' }],
    pendingActions: [{ combatantKey: WAYNE, action: 'reviewDeclaration' }],
  } } }
}

const workspace = (live: LubecLiveFight) => <div>
  <input aria-label="GM notes" defaultValue="Unfinished note" />
  <DeclarationReviewModal scope={scope} live={live} userId="gm" />
</div>

beforeEach(() => {
  mocks.sent = []
  mocks.outcome = { ok: true, fightId: 'fight', generatedIds: [], rolls: [] }
  HTMLDialogElement.prototype.showModal = function () { this.open = true; this.querySelector('button')?.focus() }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(cleanup)

describe('GM declaration review modal', () => {
  it('preserves the current draft, blocks dismissal, and restores focus after approval', async () => {
    const idle = reviewing()
    idle.fight.state.pendingActions = []
    const view = render(workspace(idle))
    const notes = screen.getByRole('textbox', { name: 'GM notes' }) as HTMLInputElement
    fireEvent.change(notes, { target: { value: 'Still editing this note' } })
    notes.focus()
    view.rerender(workspace(reviewing()))
    const dialog = screen.getByRole('dialog', { name: 'Review declaration' }) as HTMLDialogElement
    expect(dialog.open).toBe(true)
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual(['Reject declaration', 'Approve declaration'])
    const cancel = new Event('cancel', { cancelable: true, bubbles: true })
    fireEvent(dialog, cancel)
    expect(cancel.defaultPrevented).toBe(true)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.click(dialog)
    expect(dialog.open).toBe(true)
    expect(mocks.sent).toEqual([])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve declaration' }))
    await waitFor(() => expect(mocks.sent[0]).toMatchObject({ envelope: { actorKey: null, stageInstanceId: 'review-1' }, payload: { type: 'answerDeclaration', combatantKey: WAYNE, approve: true } }))
    view.rerender(workspace(idle))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(notes.value).toBe('Still editing this note')
    expect(document.activeElement).toBe(notes)
  })

  it('rejects through the same GM command, and keeps a failed decision visible for retry', async () => {
    mocks.outcome = { ok: false, reason: 'The table did not answer. Press again to retry the same action.' }
    render(workspace(reviewing()))
    const dialog = screen.getByRole('dialog') as HTMLDialogElement
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject declaration' }))
    await waitFor(() => expect(mocks.sent[0].payload).toEqual({ type: 'answerDeclaration', combatantKey: WAYNE, approve: false }))
    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect(dialog.open).toBe(true)
  })

  it('opens only for a live declaration review with a submitted choice from someone still in the fight', () => {
    const live = reviewing()
    live.fight.state.phase = 'attack'
    const view = render(workspace(live))
    expect(screen.queryByRole('dialog')).toBeNull()
    live.fight.state.phase = 'declare'
    live.fight.state.combatants[0].proposedDeclaration = null
    view.rerender(workspace(live))
    expect(screen.queryByRole('dialog')).toBeNull()
    const out = reviewing()
    out.fight.state.combatants[0].outReason = 'gm'
    view.rerender(workspace(out))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
