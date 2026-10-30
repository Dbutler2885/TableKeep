// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransferNotification } from './TransferNotification'
import { parseOseCharacter } from '../character/lib/storedCharacterRecord'
import type { CharacterRecord, PendingTransfer } from '../../types/app'

const mocks = vi.hoisted(() => ({ incomingTransfers: [] as PendingTransfer[], acceptTransfer: vi.fn(), declineTransfer: vi.fn() }))
vi.mock('./usePendingTransfers', () => ({ usePendingTransfers: () => mocks }))
vi.mock('../../firebase', () => ({ db: {} }))

const offer = (id: string, toCharacterId = 'pc') =>
  ({ id, toCharacterId, fromCharacterName: 'Borin', toCharacterName: 'Ada', itemName: 'Rope', itemKind: 'general' }) as PendingTransfer
const ada = parseOseCharacter('pc', {
  name: 'Ada',
  details: {
    abilityScores: { STR: 13 },
    inventory: [
      { id: 'a', kind: 'general', qty: 1, equipped: false },
      { id: 'b', kind: 'general', qty: 1, equipped: false },
      { id: 'sword', kind: 'general', qty: 1, equipped: true },
    ],
  },
})
const other = parseOseCharacter('other', { name: 'Cole', details: { inventory: [{ id: 'c', kind: 'general', qty: 1, equipped: false }] } })
const notice = (characters: CharacterRecord[] = [other, ada]) => (
  <TransferNotification campaignId="c" groupId="g" currentUserId="player" role="player" characters={characters} />
)
const buttons = () => screen.getAllByRole('button') as HTMLButtonElement[]
const deferred = () => {
  let settle = { resolve: () => {}, reject: (_error: unknown) => {} }
  const promise = new Promise<void>((resolve, reject) => { settle = { resolve: () => resolve(), reject } })
  return { promise, ...settle }
}

beforeEach(() => { vi.resetAllMocks(); mocks.incomingTransfers = [offer('first')] })
afterEach(cleanup)

describe('TransferNotification', () => {
  it('renders nothing while no transfer is incoming', () => {
    mocks.incomingTransfers = []
    const { container } = render(notice())
    expect(container.innerHTML).toBe('')
  })

  it('renders the first incoming offer with the receiver packed slots, equipped items excluded', () => {
    const { container } = render(notice())
    expect(container.innerHTML).toBe(
      '<div class="confirm-overlay" role="dialog" aria-modal="true"><div class="confirm-modal">' +
        '<h3>Incoming Transfer</h3>' +
        '<p><strong>Borin</strong> wants to give <strong>Rope</strong> to <strong>Ada</strong>.</p>' +
        '<p style="font-size: 0.92em;">Type: general</p>' +
        '<p style="font-size: 0.92em;">Packed slots: 2/17</p>' +
        '<div class="confirm-actions">' +
        '<button type="button" class="confirm-danger">Decline</button>' +
        '<button type="button">Accept</button>' +
        '</div></div></div>',
    )
  })

  it('counts the other pending offers beneath the first', () => {
    mocks.incomingTransfers = [offer('first'), offer('second'), offer('third')]
    const { container } = render(notice())
    expect(screen.getByText('Packed slots: 2/17')).toBeTruthy()
    expect(container.querySelector('.confirm-modal')?.lastElementChild?.outerHTML).toBe(
      '<p style="margin-top: 8px; font-size: 0.85em; opacity: 0.7;">+2 more pending</p>',
    )
  })

  it.each([
    ['Accept', 'acceptTransfer'],
    ['Decline', 'declineTransfer'],
  ] as const)('%s responds to the first offer and holds both buttons until it settles', async (label, action) => {
    const pending = deferred()
    mocks[action].mockReturnValueOnce(pending.promise)
    render(notice())
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(mocks[action]).toHaveBeenCalledExactlyOnceWith('first')
    for (const button of buttons()) expect(button.disabled).toBe(true)
    await act(async () => pending.resolve())
    for (const button of buttons()) expect(button.disabled).toBe(false)
    expect(document.querySelector('.error')).toBeNull()
  })

  it.each([
    ['Accept', 'acceptTransfer', 'Failed to accept transfer.'],
    ['Decline', 'declineTransfer', 'Failed to decline transfer.'],
  ] as const)('%s shows the thrown message, or its own fallback for a non-Error', async (label, action, fallback) => {
    mocks[action].mockRejectedValueOnce(new Error('Transfer is gone.')).mockRejectedValueOnce('offline')
    render(notice())
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect((await screen.findByText('Transfer is gone.')).outerHTML).toBe('<p class="error">Transfer is gone.</p>')
    for (const button of buttons()) expect(button.disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(await screen.findByText(fallback)).toBeTruthy()
    expect(screen.queryByText('Transfer is gone.')).toBeNull()
  })

  it('clears an earlier error as soon as the next response starts', async () => {
    const pending = deferred()
    mocks.acceptTransfer.mockRejectedValueOnce(new Error('Not enough packed slots to accept this item.'))
    mocks.declineTransfer.mockReturnValueOnce(pending.promise)
    render(notice())
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await screen.findByText('Not enough packed slots to accept this item.')
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(document.querySelector('.error')).toBeNull()
    await act(async () => pending.resolve())
  })

  it('keeps an error across offers, because it belongs to the notification and not to one offer', async () => {
    mocks.acceptTransfer.mockRejectedValueOnce(new Error('Transfer is gone.'))
    const view = render(notice())
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await screen.findByText('Transfer is gone.')
    mocks.incomingTransfers = []
    view.rerender(notice())
    expect(view.container.innerHTML).toBe('')
    mocks.incomingTransfers = [offer('next')]
    view.rerender(notice())
    expect(screen.getByText('Transfer is gone.')).toBeTruthy()
  })

  it('holds the buttons only for the offer being answered, not for the next one that replaces it', async () => {
    const pending = deferred()
    mocks.acceptTransfer.mockReturnValueOnce(pending.promise)
    const view = render(notice())
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    for (const button of buttons()) expect(button.disabled).toBe(true)
    mocks.incomingTransfers = [offer('next', 'other')]
    view.rerender(notice())
    expect(screen.getByText('Packed slots: 1/13')).toBeTruthy()
    for (const button of buttons()) expect(button.disabled).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(mocks.declineTransfer).toHaveBeenCalledExactlyOnceWith('next')
    await act(async () => pending.resolve())
  })

  it('recounts the packed slots when the receiver changes in the roster', () => {
    const view = render(notice())
    expect(screen.getByText('Packed slots: 2/17')).toBeTruthy()
    view.rerender(notice([other, parseOseCharacter('pc', { name: 'Ada', details: null })]))
    expect(screen.getByText('Packed slots: 0/13')).toBeTruthy()
  })
})
