// @vitest-environment jsdom
/**
 * Records how the group home names each campaign's rule set: on the active,
 * draft and inactive cards, and in the new-campaign picker. Recorded from the
 * code as it stood before the registry named rule sets; the two decided
 * changes since are a card with no stored rule set reading "OSE", and the
 * picker using each rule set's full name.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, GroupRecord } from '../../types/app'

vi.mock('../auth/DiscordConnection', () => ({ DiscordConnection: () => null }))
vi.mock('../auth/DiscordReturnNotice', () => ({ DiscordReturnNotice: () => null }))
vi.mock('./DiscordServerLink', () => ({ DiscordServerLink: () => null }))
vi.mock('../invites/useInvites', () => ({
  inviteState: () => 'active',
  useGroupInvites: () => ({ invites: [], createInvite: vi.fn(), revokeInvite: vi.fn() }),
}))

const { GroupHome } = await import('./GroupHome')

const campaign = (id: string, system: string | undefined, status: Campaign['status']): Campaign => ({
  id,
  name: `Campaign ${id}`,
  status,
  groupId: 'g1',
  system,
})

const group = (overrides: Partial<GroupRecord> = {}): GroupRecord => ({
  id: 'g1',
  name: 'The Group',
  slug: 'the-group',
  activeCampaignId: null,
  activeCampaign: null,
  drafts: [],
  inactiveCampaigns: [],
  memberRole: 'admin',
  ...overrides,
})

function renderHome(overrides: Partial<GroupRecord> = {}) {
  const onCreateCampaign = vi.fn(async (_groupId: string, _name: string, _system: string) => undefined)
  render(
    <GroupHome
      user={{ uid: 'gm-1' } as User}
      username="gmuser1"
      group={group(overrides)}
      onCreateCampaign={onCreateCampaign}
      onSetActiveCampaign={vi.fn()}
      onDeactivateCampaign={vi.fn()}
      onDeleteInactiveCampaign={vi.fn()}
      onDeleteDraftCampaign={vi.fn()}
      onDeleteGroup={vi.fn()}
      onBackToGroups={vi.fn()}
      onOpenCampaign={vi.fn()}
      onOpenActiveCampaign={vi.fn()}
      onSignOut={vi.fn()}
    />,
  )
  return { onCreateCampaign }
}

const cardLine = (name: string) => screen.getByText(name).closest('.group-home-card')?.querySelector('p')?.textContent

afterEach(() => {
  cleanup()
})

describe('GroupHome campaign cards', () => {
  it.each([
    ['ose', 'OSE'],
    ['vtm', 'VTM'],
    [undefined, 'OSE'],
    ['', 'OSE'],
    ['unregistered', 'OSE'],
  ] as const)('a campaign storing %j is labelled %j', (system, label) => {
    renderHome({
      activeCampaign: campaign('a', system, 'active'),
      drafts: [campaign('d', system, 'draft')],
      inactiveCampaigns: [campaign('i', system, 'inactive')],
    })

    expect(cardLine('Campaign a')).toBe(`${label} · active`)
    expect(cardLine('Campaign d')).toBe(`${label} · private draft`)
    expect(cardLine('Campaign i')).toBe(`${label} · inactive`)
  })
})

describe('GroupHome new-campaign picker', () => {
  const openPicker = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create new draft' }))
    return within(screen.getByRole('dialog')).getByRole('combobox') as HTMLSelectElement
  }

  it('offers OSE and VtM by their full names, with OSE chosen', () => {
    renderHome()
    const picker = openPicker()

    expect([...picker.options].map((option) => [option.value, option.textContent])).toEqual([
      ['ose', 'Old-School Essentials'],
      ['vtm', 'Vampire: the Masquerade'],
    ])
    expect(picker.value).toBe('ose')
  })

  it.each(['ose', 'vtm'])('creates a %s campaign storing that id', async (system) => {
    const { onCreateCampaign } = renderHome()
    const picker = openPicker()
    const dialog = within(screen.getByRole('dialog'))

    fireEvent.change(dialog.getByRole('textbox'), { target: { value: 'New One' } })
    fireEvent.change(picker, { target: { value: system } })
    fireEvent.click(dialog.getByRole('button', { name: 'Create' }))

    await vi.waitFor(() => expect(onCreateCampaign).toHaveBeenCalledWith('g1', 'New One', system))
  })
})
