// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AppTab, Campaign } from '../../types/app'

const SERVER_TIMESTAMP = { sentinel: 'serverTimestamp' }

const mocks = vi.hoisted(() => ({
  updateDoc: vi.fn(async (..._args: unknown[]) => undefined),
}))

vi.mock('../../firebase', () => ({ db: { name: 'db-stub' } }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  serverTimestamp: () => SERVER_TIMESTAMP,
  updateDoc: mocks.updateDoc,
}))

const { CampaignSettingsModal } = await import('./CampaignSettingsModal')

const campaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  id: 'c1',
  name: 'The Black Wyrm',
  status: 'active',
  groupId: 'g1',
  gmUserId: 'gm-1',
  ...overrides,
})

function renderModal(overrides: Partial<Campaign> = {}) {
  const onClose = vi.fn()
  render(<CampaignSettingsModal groupId="g1" campaign={campaign(overrides)} onClose={onClose} />)
  return { onClose }
}

const checkbox = (label: string) => screen.getByLabelText(label, { exact: false }) as HTMLInputElement
const shownTabs = () => screen.getAllByRole('checkbox').map((box) => box.closest('label')?.querySelector('span')?.textContent)
const checkedTabs = () => screen.getAllByRole('checkbox')
  .filter((box) => (box as HTMLInputElement).checked)
  .map((box) => box.closest('label')?.querySelector('span')?.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.updateDoc.mockImplementation(async () => undefined)
})

afterEach(() => {
  cleanup()
})

describe('CampaignSettingsModal', () => {
  it('offers an OSE campaign its own tabs, without the rules link, all on by default', () => {
    renderModal({ system: 'ose' })

    expect(shownTabs()).toEqual(['Character', 'Maps', 'Monsters', 'Items', 'NPCs', 'Tables', 'Notes', 'Calendar'])
    expect(checkedTabs()).toEqual(shownTabs())
  })

  it('offers a VtM campaign only the tabs VtM has', () => {
    renderModal({ system: 'vtm' })

    expect(shownTabs()).toEqual(['Character', 'Maps', 'Monsters', 'NPCs', 'Notes', 'Calendar'])
  })

  it('keeps the character tab on and marks it required', () => {
    renderModal()

    expect(checkbox('Character').disabled).toBe(true)
    expect(screen.getByText('required').closest('label')).toBe(checkbox('Character').closest('label'))
  })

  it('starts from the tabs the campaign has saved', () => {
    renderModal({ enabledTabs: ['character', 'notes'] })

    expect(checkedTabs()).toEqual(['Character', 'Notes'])
  })

  it('starts with every tab on when the saved list is empty', () => {
    renderModal({ enabledTabs: [] })

    expect(checkedTabs()).toEqual(shownTabs())
  })

  it('saves the chosen tabs in the system order, rules link included, and closes', async () => {
    const { onClose } = renderModal({ system: 'ose' })

    fireEvent.click(checkbox('Items'))
    fireEvent.click(checkbox('Tables'))
    fireEvent.click(checkbox('Items'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    const enabledTabs: AppTab[] = ['character', 'maps', 'monsters', 'items', 'npcs', 'notes', 'calendar', 'rules']
    expect(mocks.updateDoc).toHaveBeenCalledWith(
      { path: 'groups/g1/campaigns/c1' },
      { enabledTabs, updatedAt: SERVER_TIMESTAMP },
    )
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows Saving and disables the form while the save is in flight', async () => {
    let finish: () => void = () => undefined
    mocks.updateDoc.mockImplementation(() => new Promise<undefined>((resolve) => { finish = () => resolve(undefined) }))
    renderModal()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true)
    expect(checkbox('Maps').disabled).toBe(true)

    await act(async () => finish())
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false)
  })

  it('shows a refused save and stays open', async () => {
    mocks.updateDoc.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'))
    const { onClose } = renderModal()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(screen.getByText('Missing or insufficient permissions.')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows a fallback message for a failure that is not an Error', async () => {
    mocks.updateDoc.mockRejectedValueOnce('offline')
    renderModal()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(screen.getByText('Could not save settings.')).toBeTruthy()
  })

  it('closes without saving on Cancel', () => {
    const { onClose } = renderModal()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(mocks.updateDoc).not.toHaveBeenCalled()
  })
})
