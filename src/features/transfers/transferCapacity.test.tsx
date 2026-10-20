// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransferNotification } from './TransferNotification'
import { TransferPickerModal } from '../character/components/TransferPickerModal'
import { parseOseCharacter } from '../character/lib/storedCharacterRecord'
import { capacityCases } from '../character/oseCarryingCases'
import type { PendingTransfer } from '../../types/app'

const mocks = vi.hoisted(() => ({ incomingTransfers: [] as PendingTransfer[], acceptTransfer: vi.fn(), declineTransfer: vi.fn() }))
vi.mock('./usePendingTransfers', () => ({ usePendingTransfers: () => mocks }))
vi.mock('../../firebase', () => ({ db: {} }))
const offer = { id: 'offer', toCharacterId: 'pc', fromCharacterName: 'Borin', toCharacterName: 'Ada', itemName: 'Rope', itemKind: 'general' } as PendingTransfer
const target = (details: unknown) => parseOseCharacter('pc', { name: 'Ada', details })
const renderNotice = (details: unknown) => render(<TransferNotification campaignId="c" groupId="g" currentUserId="player" role="player" characters={[target(details)]} />)
beforeEach(() => { vi.resetAllMocks(); mocks.incomingTransfers = [offer] })
afterEach(cleanup)

describe('transfer capacity displays', () => {
  it.each(capacityCases)('both transfer screens: $name', ({ details, packedSlots }) => {
    const character = target(details)
    const flow = {
      transferPickerOpen: true, transferTargets: [character], transferTargetCharacterId: 'pc', transferBusy: false,
      closeTransferPicker: vi.fn(), setTransferTargetCharacterId: vi.fn(), submitTransfer: vi.fn(),
    } as unknown as Parameters<typeof TransferPickerModal>[0]['flow']
    render(<TransferPickerModal flow={flow} detailItem={null} />)
    renderNotice(details)
    expect(screen.getAllByText('Packed slots: 0/' + packedSlots)).toHaveLength(2)
  })
  it('still offers acceptance when full; the callable decides whether it fits', async () => {
    const inventory = [
      ...Array.from({ length: 13 }, (_, i) => ({ id: String(i), kind: 'general', qty: 100, equipped: false })),
      { id: 'equipped', kind: 'general', qty: 100, equipped: true },
    ]
    renderNotice({ inventory })
    expect(screen.getByText('Packed slots: 13/13')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Accept' })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)
    await waitFor(() => expect(mocks.acceptTransfer).toHaveBeenCalledExactlyOnceWith('offer'))
  })
  it.each([new Error('Not enough packed slots to accept this item.'), 'offline'])('shows accept failure %s and releases both buttons', async (error) => {
    mocks.acceptTransfer.mockRejectedValueOnce(error)
    renderNotice({ inventory: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    await screen.findByText(error instanceof Error ? error.message : 'Failed to accept transfer.')
    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(false)
  })
  it('uses empty receiver defaults when the target is absent from the local roster', () => {
    render(<TransferNotification campaignId="c" groupId="g" currentUserId="player" role="player" characters={[]} />)
    expect(screen.getByText('Packed slots: 0/13')).toBeTruthy()
  })
})
