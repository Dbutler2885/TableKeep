// @vitest-environment jsdom
/**
 * Pins everything the group home does today: its header, the three campaign
 * sections, and each dialog's open, cancel, busy, success and failure paths,
 * including the invite list and the two-step group delete. Recorded against
 * the single GroupHome component before it was split.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { Campaign, GroupRecord, InviteCode } from '../../types/app'

const invitesHook = vi.hoisted(() => ({
  invites: [] as InviteCode[],
  createInvite: vi.fn<(input: { groupId: string; groupName: string; createdByName: string }) => Promise<string>>(),
  revokeInvite: vi.fn<(token: string) => Promise<void>>(),
  calls: [] as Array<string | null>,
}))

vi.mock('../auth/DiscordConnection', () => ({
  DiscordConnection: ({ userId, variant }: { userId: string; variant: string }) => (
    <p data-testid="discord-connection">{`${userId}:${variant}`}</p>
  ),
}))
vi.mock('../auth/DiscordReturnNotice', () => ({
  DiscordReturnNotice: ({ variant }: { variant: string }) => <p data-testid="discord-return">{variant}</p>,
}))
vi.mock('./DiscordServerLink', () => ({
  DiscordServerLink: ({ groupId, canManage }: { groupId: string; canManage: boolean }) => (
    <p data-testid="discord-server">{`${groupId}:${String(canManage)}`}</p>
  ),
}))
vi.mock('../invites/useInvites', () => ({
  inviteState: (invite: InviteCode) => {
    if (invite.redeemedBy) return 'redeemed'
    if (invite.revoked) return 'revoked'
    if (invite.expiresAt && invite.expiresAt <= Date.now()) return 'expired'
    return 'active'
  },
  useGroupInvites: (_user: User, groupId: string | null) => {
    invitesHook.calls.push(groupId)
    return { invites: invitesHook.invites, createInvite: invitesHook.createInvite, revokeInvite: invitesHook.revokeInvite }
  },
}))

const { GroupHome } = await import('./GroupHome')

const NOW = Date.UTC(2026, 9, 18, 12, 0, 0)
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const campaign = (id: string, status: Campaign['status'], system = 'ose'): Campaign => ({
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

const invite = (token: string, overrides: Partial<InviteCode> = {}): InviteCode => ({
  token,
  groupId: 'g1',
  groupName: 'The Group',
  createdBy: 'gm-1',
  createdByName: 'gmuser1',
  createdAt: NOW - DAY,
  expiresAt: NOW + 3 * DAY,
  redeemedBy: null,
  redeemedAt: null,
  revoked: false,
  ...overrides,
})

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (reason: unknown) => void }

function deferred(): Deferred {
  let resolve!: () => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

type RenderOptions = {
  group?: Partial<GroupRecord>
  user?: Partial<User>
  canInvite?: boolean
}

function renderHome({ group: groupOverrides, user, canInvite }: RenderOptions = {}) {
  const props = {
    onCreateCampaign: vi.fn(async (_groupId: string, _name: string, _system: string) => undefined),
    onSetActiveCampaign: vi.fn(async (_groupId: string, _campaignId: string) => undefined),
    onDeactivateCampaign: vi.fn(async (_groupId: string, _campaignId: string) => undefined),
    onDeleteInactiveCampaign: vi.fn(async (_groupId: string, _campaignId: string) => undefined),
    onDeleteDraftCampaign: vi.fn(async (_groupId: string, _campaignId: string) => undefined),
    onDeleteGroup: vi.fn(async (_groupId: string) => undefined),
    onBackToGroups: vi.fn(),
    onOpenCampaign: vi.fn(),
    onOpenActiveCampaign: vi.fn(),
    onSignOut: vi.fn(),
  }
  const canInviteProp = canInvite === undefined ? {} : { canInvite }
  render(
    <GroupHome
      user={{ uid: 'gm-1', isAnonymous: false, ...user } as User}
      username="gmuser1"
      group={group(groupOverrides)}
      {...props}
      {...canInviteProp}
    />,
  )
  return props
}

const dialog = () => within(screen.getByRole('dialog'))
const card = (name: string) =>
  screen.getAllByText(name).map((node) => node.closest('.group-home-card')).find(Boolean) as HTMLElement

function setClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  })
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
  invitesHook.invites = []
  invitesHook.calls = []
  invitesHook.createInvite.mockReset()
  invitesHook.revokeInvite.mockReset()
  setClipboard(vi.fn(async () => undefined))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('GroupHome header', () => {
  it('shows the group, the signed-in name and the Discord links', () => {
    renderHome()

    expect(screen.getByRole('heading', { level: 1, name: 'The Group' })).toBeTruthy()
    expect(screen.getByText('Group').className).toBe('group-eyebrow')
    expect(screen.getByText('gmuser1').tagName).toBe('STRONG')
    expect(screen.getByTestId('discord-connection').textContent).toBe('gm-1:subtitle')
    expect(screen.getByTestId('discord-server').textContent).toBe('g1:true')
    expect(screen.getByTestId('discord-return').textContent).toBe('subtitle')
  })

  it('lets a member see the server link without managing it', () => {
    renderHome({ group: { memberRole: 'member' } })

    expect(screen.getByTestId('discord-server').textContent).toBe('g1:false')
  })

  it('hides the Discord links from an anonymous visitor', () => {
    renderHome({ user: { isAnonymous: true } })

    expect(screen.queryByTestId('discord-connection')).toBeNull()
    expect(screen.queryByTestId('discord-server')).toBeNull()
    expect(screen.queryByTestId('discord-return')).toBeNull()
  })

  it('goes back to the groups and signs out', () => {
    const props = renderHome()

    fireEvent.click(screen.getByRole('button', { name: 'Back to groups' }))
    expect(props.onBackToGroups).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(props.onSignOut).toHaveBeenCalledTimes(1)
  })

  it('offers an admin the invite and delete buttons', () => {
    renderHome()

    expect(screen.getByRole('button', { name: 'Invite to group' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete group' })).toBeTruthy()
  })

  it('offers a member neither button', () => {
    renderHome({ group: { memberRole: 'member' } })

    expect(screen.queryByRole('button', { name: 'Invite to group' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete group' })).toBeNull()
  })

  it('withholds the invite button from an admin who cannot invite, but keeps delete', () => {
    renderHome({ canInvite: false })

    expect(screen.queryByRole('button', { name: 'Invite to group' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete group' })).toBeTruthy()
  })

  it('opens no dialog until asked', () => {
    renderHome()

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('GroupHome active campaign', () => {
  it('says when there is none', () => {
    renderHome()

    expect(screen.getByText('No active campaign.').closest('.group-home-card')?.className).toBe(
      'group-home-card group-home-card-muted',
    )
  })

  it('opens the active campaign on a click, Enter or Space, and ignores other keys', () => {
    const props = renderHome({ group: { activeCampaign: campaign('a', 'active') } })
    const activeCard = card('Campaign a')

    fireEvent.click(activeCard)
    expect(props.onOpenActiveCampaign).toHaveBeenCalledTimes(1)

    expect(fireEvent.keyDown(activeCard, { key: 'Enter' })).toBe(false)
    expect(fireEvent.keyDown(activeCard, { key: ' ' })).toBe(false)
    expect(props.onOpenActiveCampaign).toHaveBeenCalledTimes(3)

    expect(fireEvent.keyDown(activeCard, { key: 'a' })).toBe(true)
    expect(props.onOpenActiveCampaign).toHaveBeenCalledTimes(3)
  })

  it('deactivates through a confirmation without opening the campaign', async () => {
    const pending = deferred()
    const props = renderHome({ group: { activeCampaign: campaign('a', 'active') } })
    props.onDeactivateCampaign.mockReturnValueOnce(pending.promise.then(() => undefined))

    fireEvent.click(within(card('Campaign a')).getByRole('button', { name: 'Deactivate' }))
    expect(props.onOpenActiveCampaign).not.toHaveBeenCalled()
    expect(dialog().getByRole('heading', { level: 3, name: 'Deactivate' })).toBeTruthy()
    expect(screen.getByRole('dialog').textContent).toContain('Deactivate Campaign a?')

    fireEvent.click(dialog().getByRole('button', { name: 'Deactivate' }))
    expect(props.onDeactivateCampaign).toHaveBeenCalledWith('g1', 'a')
    const busyButton = dialog().getByRole('button', { name: 'Deactivating…' }) as HTMLButtonElement
    expect(busyButton.disabled).toBe(true)
    expect(busyButton.className).toBe('primary')

    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    await act(async () => pending.resolve())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the confirmation open with the error when deactivating fails', async () => {
    const props = renderHome({ group: { activeCampaign: campaign('a', 'active') } })
    props.onDeactivateCampaign.mockRejectedValueOnce(new Error('No permission.')).mockRejectedValueOnce('nope')

    fireEvent.click(within(card('Campaign a')).getByRole('button', { name: 'Deactivate' }))
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Deactivate' })))
    expect(dialog().getByText('No permission.').className).toBe('error')

    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Deactivate' })))
    expect(dialog().getByText('Unable to deactivate campaign.')).toBeTruthy()
    expect((dialog().getByRole('button', { name: 'Deactivate' }) as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(within(card('Campaign a')).getByRole('button', { name: 'Deactivate' }))
    expect(screen.getByRole('dialog').querySelector('.error')).toBeNull()
  })
})

describe('GroupHome drafts and inactive campaigns', () => {
  it('says when either list is empty', () => {
    renderHome()

    expect(screen.getByText('No drafts yet.')).toBeTruthy()
    expect(screen.getByText('No inactive campaigns yet.')).toBeTruthy()
  })

  it.each([
    ['d1', { drafts: [campaign('d1', 'draft')] }],
    ['i1', { inactiveCampaigns: [campaign('i1', 'inactive')] }],
  ] as const)('opens campaign %s on a click, Enter or Space, and ignores other keys', (id, overrides) => {
    const props = renderHome({ group: overrides })
    const listCard = card(`Campaign ${id}`)

    fireEvent.click(listCard)
    expect(fireEvent.keyDown(listCard, { key: 'Enter' })).toBe(false)
    expect(fireEvent.keyDown(listCard, { key: ' ' })).toBe(false)
    expect(fireEvent.keyDown(listCard, { key: 'Tab' })).toBe(true)

    expect(props.onOpenCampaign.mock.calls).toEqual([[id], [id], [id]])
  })

  it('lists every campaign in order', () => {
    renderHome({
      group: {
        drafts: [campaign('d1', 'draft'), campaign('d2', 'draft')],
        inactiveCampaigns: [campaign('i1', 'inactive'), campaign('i2', 'inactive')],
      },
    })

    const names = [...document.querySelectorAll('.group-card-list strong')].map((node) => node.textContent)
    expect(names).toEqual(['Campaign d1', 'Campaign d2', 'Campaign i1', 'Campaign i2'])
  })

  it.each([
    ['d1', { drafts: [campaign('d1', 'draft')] }],
    ['i1', { inactiveCampaigns: [campaign('i1', 'inactive')] }],
  ] as const)('sets campaign %s active through a confirmation', async (id, overrides) => {
    const pending = deferred()
    const props = renderHome({ group: overrides })
    props.onSetActiveCampaign.mockReturnValueOnce(pending.promise.then(() => undefined))

    fireEvent.click(within(card(`Campaign ${id}`)).getByRole('button', { name: 'Set active' }))
    expect(props.onOpenCampaign).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog').textContent).toBe(`Set activeMake Campaign ${id} the active campaign?CancelSet active`)

    fireEvent.click(dialog().getByRole('button', { name: 'Set active' }))
    expect(props.onSetActiveCampaign).toHaveBeenCalledWith('g1', id)
    expect((dialog().getByRole('button', { name: 'Setting…' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    await act(async () => pending.resolve())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('warns that the current active campaign will be deactivated', () => {
    renderHome({ group: { activeCampaign: campaign('a', 'active'), drafts: [campaign('d1', 'draft')] } })

    fireEvent.click(within(card('Campaign d1')).getByRole('button', { name: 'Set active' }))
    expect(screen.getByRole('dialog').textContent).toContain('Campaign a will be deactivated.')
  })

  it('keeps the set-active confirmation open with the error when it fails', async () => {
    const props = renderHome({ group: { drafts: [campaign('d1', 'draft')] } })
    props.onSetActiveCampaign.mockRejectedValueOnce(new Error('Taken.')).mockRejectedValueOnce(42)

    fireEvent.click(within(card('Campaign d1')).getByRole('button', { name: 'Set active' }))
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Set active' })))
    expect(dialog().getByText('Taken.')).toBeTruthy()
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Set active' })))
    expect(dialog().getByText('Unable to set active campaign.')).toBeTruthy()

    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each([
    {
      kind: 'draft',
      overrides: { drafts: [campaign('d1', 'draft')] },
      id: 'd1',
      button: 'Delete draft Campaign d1',
      heading: 'Delete draft',
      text: 'Delete draftDelete Campaign d1?CancelDelete',
      callback: 'onDeleteDraftCampaign',
      fallback: 'Unable to delete draft.',
    },
    {
      kind: 'inactive campaign',
      overrides: { inactiveCampaigns: [campaign('i1', 'inactive')] },
      id: 'i1',
      button: 'Delete Campaign i1',
      heading: 'Delete campaign',
      text: 'Delete campaignDelete Campaign i1 and all its data?CancelDelete',
      callback: 'onDeleteInactiveCampaign',
      fallback: 'Unable to delete campaign.',
    },
  ] as const)('deletes a $kind through a confirmation', async ({ overrides, id, button, heading, text, callback, fallback }) => {
    const pending = deferred()
    const props = renderHome({ group: overrides })
    const onDelete = props[callback]
    onDelete.mockReturnValueOnce(pending.promise.then(() => undefined))

    const deleteButton = within(card(`Campaign ${id}`)).getByRole('button', { name: button })
    expect(deleteButton.getAttribute('title')).toBe(button)
    expect(deleteButton.className).toBe('group-icon-button')
    fireEvent.click(deleteButton)
    expect(props.onOpenCampaign).not.toHaveBeenCalled()
    expect(dialog().getByRole('heading', { level: 3, name: heading })).toBeTruthy()
    expect(screen.getByRole('dialog').textContent).toBe(text)

    fireEvent.click(dialog().getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('g1', id)
    const busyButton = dialog().getByRole('button', { name: 'Deleting…' }) as HTMLButtonElement
    expect(busyButton.disabled).toBe(true)
    expect(busyButton.className).toBe('danger')
    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    await act(async () => pending.resolve())
    expect(screen.queryByRole('dialog')).toBeNull()

    onDelete.mockRejectedValueOnce(new Error('Locked.')).mockRejectedValueOnce(null)
    fireEvent.click(within(card(`Campaign ${id}`)).getByRole('button', { name: button }))
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Delete' })))
    expect(dialog().getByText('Locked.')).toBeTruthy()
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Delete' })))
    expect(dialog().getByText(fallback)).toBeTruthy()
    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('clears a stale error when a card button opens another confirmation', async () => {
    const props = renderHome({ group: { drafts: [campaign('d1', 'draft')] } })
    props.onSetActiveCampaign.mockRejectedValueOnce(new Error('Taken.'))

    fireEvent.click(within(card('Campaign d1')).getByRole('button', { name: 'Set active' }))
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Set active' })))
    expect(screen.getByText('Taken.')).toBeTruthy()

    fireEvent.click(within(card('Campaign d1')).getByRole('button', { name: 'Delete draft Campaign d1' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    expect(screen.queryByText('Taken.')).toBeNull()
  })
})

describe('GroupHome new draft dialog', () => {
  const openCreate = () => fireEvent.click(screen.getByRole('button', { name: 'Create new draft' }))
  const nameInput = () => dialog().getByRole('textbox') as HTMLInputElement
  const systemSelect = () => dialog().getByRole('combobox') as HTMLSelectElement
  const createButton = () => dialog().getByRole('button', { name: /^Creat/ }) as HTMLButtonElement

  it('opens empty, on OSE, with the name focused and Create disabled', () => {
    renderHome()
    openCreate()

    expect(dialog().getByRole('heading', { level: 3, name: 'New draft campaign' })).toBeTruthy()
    expect(nameInput().value).toBe('')
    expect(document.activeElement).toBe(nameInput())
    expect(systemSelect().value).toBe('ose')
    expect(createButton().disabled).toBe(true)
  })

  it('needs a name that is not only spaces', () => {
    renderHome()
    openCreate()

    fireEvent.change(nameInput(), { target: { value: '   ' } })
    expect(createButton().disabled).toBe(true)
    fireEvent.change(nameInput(), { target: { value: ' x ' } })
    expect(createButton().disabled).toBe(false)
  })

  it('creates the draft as typed, locks the form while busy, then closes and resets', async () => {
    const pending = deferred()
    const props = renderHome()
    props.onCreateCampaign.mockReturnValueOnce(pending.promise.then(() => undefined))
    openCreate()

    fireEvent.change(nameInput(), { target: { value: ' Next Run ' } })
    fireEvent.change(systemSelect(), { target: { value: 'vtm' } })
    fireEvent.click(createButton())

    expect(props.onCreateCampaign).toHaveBeenCalledWith('g1', ' Next Run ', 'vtm')
    expect(createButton().textContent).toBe('Creating…')
    expect(createButton().disabled).toBe(true)
    expect(nameInput().disabled).toBe(true)
    expect(systemSelect().disabled).toBe(true)

    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog')).toBeTruthy()

    await act(async () => pending.resolve())
    expect(screen.queryByRole('dialog')).toBeNull()

    openCreate()
    expect(nameInput().value).toBe('')
    expect(systemSelect().value).toBe('ose')
  })

  it('keeps the form and shows the error when creating fails', async () => {
    const props = renderHome()
    props.onCreateCampaign.mockRejectedValueOnce(new Error('Name taken.')).mockRejectedValueOnce(undefined)
    openCreate()

    fireEvent.change(nameInput(), { target: { value: 'Next Run' } })
    fireEvent.change(systemSelect(), { target: { value: 'vtm' } })
    await act(async () => fireEvent.click(createButton()))

    expect(dialog().getByText('Name taken.').className).toBe('error')
    expect(nameInput().value).toBe('Next Run')
    expect(systemSelect().value).toBe('vtm')
    expect(createButton().textContent).toBe('Create')
    expect(nameInput().disabled).toBe(false)

    await act(async () => fireEvent.click(createButton()))
    expect(dialog().getByText('Unable to create campaign.')).toBeTruthy()
  })

  it('cancels by clearing the form and the error', async () => {
    const props = renderHome()
    props.onCreateCampaign.mockRejectedValueOnce(new Error('Name taken.'))
    openCreate()
    fireEvent.change(nameInput(), { target: { value: 'Next Run' } })
    fireEvent.change(systemSelect(), { target: { value: 'vtm' } })
    await act(async () => fireEvent.click(createButton()))

    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    openCreate()
    expect(nameInput().value).toBe('')
    expect(systemSelect().value).toBe('ose')
    expect(screen.getByRole('dialog').querySelector('.error')).toBeNull()
  })

  it('opens without clearing an error left by another dialog', async () => {
    const props = renderHome({ group: { drafts: [campaign('d1', 'draft')] } })
    props.onSetActiveCampaign.mockRejectedValueOnce(new Error('Taken.'))

    fireEvent.click(within(card('Campaign d1')).getByRole('button', { name: 'Set active' }))
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Set active' })))
    openCreate()

    expect(screen.getAllByText('Taken.')).toHaveLength(2)
  })
})

describe('GroupHome invites', () => {
  const openInvites = () => fireEvent.click(screen.getByRole('button', { name: 'Invite to group' }))
  const generateButton = () => dialog().getByRole('button', { name: /Generate invite link|Working…/ }) as HTMLButtonElement

  it('subscribes to the invites only while the dialog is open', () => {
    renderHome()
    expect(invitesHook.calls.every((groupId) => groupId === null)).toBe(true)

    openInvites()
    expect(invitesHook.calls.at(-1)).toBe('g1')

    fireEvent.click(dialog().getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(invitesHook.calls.at(-1)).toBeNull()
  })

  it('says when there are no invites yet', () => {
    renderHome()
    openInvites()

    expect(dialog().getByRole('heading', { level: 3, name: 'Invite to The Group' })).toBeTruthy()
    expect(screen.getByRole('dialog').firstElementChild?.className).toBe('confirm-modal group-modal invite-modal')
    expect(dialog().getByText('No invites yet.').className).toBe('invite-list-empty')
  })

  it('generates an invite, copies its link and marks it copied', async () => {
    const pending = deferred()
    const writeText = vi.fn(async (_text: string) => undefined)
    setClipboard(writeText)
    invitesHook.createInvite.mockImplementationOnce(async () => {
      await pending.promise
      return 'tok-new-aaaaaaaaaaaa'
    })
    invitesHook.invites = [invite('tok-new-aaaaaaaaaaaa')]
    renderHome()
    openInvites()

    fireEvent.click(generateButton())
    expect(invitesHook.createInvite).toHaveBeenCalledWith({ groupId: 'g1', groupName: 'The Group', createdByName: 'gmuser1' })
    expect(generateButton().textContent).toBe('Working…')
    expect(generateButton().disabled).toBe(true)

    await act(async () => pending.resolve())
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/tok-new-aaaaaaaaaaaa`)
    expect(generateButton().textContent).toBe('Generate invite link')
    expect(generateButton().disabled).toBe(false)
    expect(dialog().getByRole('button', { name: 'Copy invite link' }).textContent).toBe('Copied')
    expect(document.querySelector('.invite-state')?.textContent).toBe('Copied')
  })

  it('still generates when the clipboard refuses the link', async () => {
    setClipboard(vi.fn(async () => Promise.reject(new Error('denied'))))
    invitesHook.createInvite.mockResolvedValueOnce('tok-new-aaaaaaaaaaaa')
    invitesHook.invites = [invite('tok-new-aaaaaaaaaaaa')]
    renderHome()
    openInvites()

    await act(async () => fireEvent.click(generateButton()))
    expect(screen.getByRole('dialog').querySelector('.error')).toBeNull()
    expect(dialog().getByRole('button', { name: 'Copy invite link' }).textContent).toBe('Copy link')
  })

  it('marks the new invite copied when there is no clipboard at all', async () => {
    setClipboard(undefined)
    invitesHook.createInvite.mockResolvedValueOnce('tok-new-aaaaaaaaaaaa')
    invitesHook.invites = [invite('tok-new-aaaaaaaaaaaa')]
    renderHome()
    openInvites()

    await act(async () => fireEvent.click(generateButton()))
    expect(dialog().getByRole('button', { name: 'Copy invite link' }).textContent).toBe('Copied')
  })

  it('shows why an invite could not be generated', async () => {
    invitesHook.createInvite.mockRejectedValueOnce(new Error('Quota.')).mockRejectedValueOnce({})
    renderHome()
    openInvites()

    await act(async () => fireEvent.click(generateButton()))
    expect(dialog().getByText('Quota.').className).toBe('error')
    await act(async () => fireEvent.click(generateButton()))
    expect(dialog().getByText('Could not create invite.')).toBeTruthy()
    expect(generateButton().disabled).toBe(false)
  })

  it('clears the error and the copied mark when closed and reopened', async () => {
    invitesHook.createInvite.mockRejectedValueOnce(new Error('Quota.'))
    invitesHook.invites = [invite('tok-one-aaaaaaaaaaaa')]
    renderHome()
    openInvites()
    fireEvent.click(dialog().getByRole('button', { name: 'Copy invite link' }))
    await act(async () => fireEvent.click(generateButton()))
    expect(dialog().getByText('Quota.')).toBeTruthy()
    expect(dialog().getByRole('button', { name: 'Copy invite link' }).textContent).toBe('Copied')

    fireEvent.click(dialog().getByRole('button', { name: 'Done' }))
    openInvites()
    expect(screen.getByRole('dialog').querySelector('.error')).toBeNull()
    expect(dialog().getByRole('button', { name: 'Copy invite link' }).textContent).toBe('Copy link')
  })

  it('also clears them when the invite button is pressed with the dialog still open', async () => {
    invitesHook.createInvite.mockRejectedValueOnce(new Error('Quota.'))
    invitesHook.invites = [invite('tok-one-aaaaaaaaaaaa')]
    renderHome()
    openInvites()
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Copy invite link' })))
    await act(async () => fireEvent.click(generateButton()))

    openInvites()
    expect(screen.getByRole('dialog').querySelector('.error')).toBeNull()
    expect(dialog().getByRole('button', { name: 'Copy invite link' }).textContent).toBe('Copy link')
  })

  it('copies an existing invite link, and says when the clipboard is unavailable', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    setClipboard(writeText)
    invitesHook.invites = [invite('tok-one-aaaaaaaaaaaa'), invite('tok-two-bbbbbbbbbbbb')]
    renderHome()
    openInvites()
    const [first, second] = dialog().getAllByRole('button', { name: 'Copy invite link' })

    await act(async () => fireEvent.click(second))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/tok-two-bbbbbbbbbbbb`)
    expect(second.textContent).toBe('Copied')
    expect(first.textContent).toBe('Copy link')

    setClipboard(vi.fn(async () => Promise.reject(new Error('denied'))))
    await act(async () => fireEvent.click(first))
    expect(dialog().getByText('Clipboard unavailable. Copy the link manually.')).toBeTruthy()
    expect(second.textContent).toBe('Copied')
  })

  it('revokes an invite, locking generation while it runs', async () => {
    const pending = deferred()
    invitesHook.revokeInvite.mockReturnValueOnce(pending.promise)
    invitesHook.invites = [invite('tok-one-aaaaaaaaaaaa')]
    renderHome()
    openInvites()

    fireEvent.click(dialog().getByRole('button', { name: 'Revoke invite' }))
    expect(invitesHook.revokeInvite).toHaveBeenCalledWith('tok-one-aaaaaaaaaaaa')
    expect(generateButton().textContent).toBe('Working…')

    await act(async () => pending.resolve())
    expect(generateButton().textContent).toBe('Generate invite link')
  })

  it('shows why an invite could not be revoked', async () => {
    invitesHook.revokeInvite.mockRejectedValueOnce(new Error('Gone.')).mockRejectedValueOnce('x')
    invitesHook.invites = [invite('tok-one-aaaaaaaaaaaa')]
    renderHome()
    openInvites()

    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Revoke invite' })))
    expect(dialog().getByText('Gone.')).toBeTruthy()
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Revoke invite' })))
    expect(dialog().getByText('Could not revoke invite.')).toBeTruthy()
    expect(generateButton().disabled).toBe(false)
  })
})

describe('GroupHome invite rows', () => {
  const rows = () => [...document.querySelectorAll('.invite-row')] as HTMLElement[]

  function renderRows(list: InviteCode[]) {
    invitesHook.invites = list
    renderHome()
    fireEvent.click(screen.getByRole('button', { name: 'Invite to group' }))
    return rows()
  }

  it('names each state, and offers copy and revoke only on an active invite', () => {
    const [active, redeemed, revoked, expired] = renderRows([
      invite('tok-active-aaaaaaaa'),
      invite('tok-redeemed-bbbbbb', { redeemedBy: 'p1', redeemedAt: NOW - HOUR }),
      invite('tok-revoked-cccccccc', { revoked: true }),
      invite('tok-expired-dddddddd', { expiresAt: NOW - 1 }),
    ])

    expect(active.className).toBe('invite-row invite-row-active')
    expect(active.querySelector('.invite-state')?.className).toBe('invite-state invite-state-active')
    expect(active.querySelector('.invite-state')?.textContent).toBe('Active')
    expect(within(active).getAllByRole('button').map((button) => button.textContent)).toEqual(['Copy link', 'Revoke'])

    expect([redeemed, revoked, expired].map((row) => row.className)).toEqual([
      'invite-row invite-row-redeemed',
      'invite-row invite-row-revoked',
      'invite-row invite-row-expired',
    ])
    expect([redeemed, revoked, expired].map((row) => row.querySelector('.invite-state')?.textContent)).toEqual([
      'Redeemed',
      'Revoked',
      'Expired',
    ])
    for (const row of [redeemed, revoked, expired]) {
      expect(within(row).queryAllByRole('button')).toHaveLength(0)
      expect(row.querySelector('.invite-expires')).toBeNull()
      expect(row.querySelector('.invite-row-actions')?.childElementCount).toBe(0)
    }
  })

  it('shows the first twelve characters of the token and the full link', () => {
    const [row] = renderRows([invite('abcdefghijklmnopqrstuvwxyz')])

    expect(row.querySelector('code.invite-token')?.textContent).toBe('abcdefghijkl…')
    const url = row.querySelector('input.invite-row-url') as HTMLInputElement
    expect(url.readOnly).toBe(true)
    expect(url.value).toBe(`${window.location.origin}/join/abcdefghijklmnopqrstuvwxyz`)
  })

  it('selects the whole link when the field is focused', () => {
    const [row] = renderRows([invite('abcdefghijklmnopqrstuvwxyz')])
    const url = row.querySelector('input.invite-row-url') as HTMLInputElement

    fireEvent.focus(url)
    expect([url.selectionStart, url.selectionEnd]).toEqual([0, url.value.length])
  })

  it.each([
    [3 * DAY + 5 * HOUR, '3d left'],
    [DAY, '1d left'],
    [DAY - 1, '23h left'],
    [2 * HOUR + 1, '2h left'],
    [30 * 60 * 1000, '1h left'],
    [1, '1h left'],
  ])('shows an active invite expiring in %d ms as %j', (remaining, label) => {
    const [row] = renderRows([invite('tok-active-aaaaaaaa', { expiresAt: NOW + remaining })])

    expect(row.querySelector('.invite-expires')?.textContent).toBe(label)
  })

  it('shows no expiry for an invite without one', () => {
    const [row] = renderRows([invite('tok-active-aaaaaaaa', { expiresAt: 0 })])

    expect(row.querySelector('.invite-state')?.textContent).toBe('Active')
    expect(row.querySelector('.invite-expires')).toBeNull()
  })
})

describe('GroupHome group delete', () => {
  const openDelete = () => fireEvent.click(screen.getByRole('button', { name: 'Delete group' }))

  it.each([
    ['an empty group', {}, 'This removes all members and can\'t be undone.', 'This permanently deletes The Group and everyone\'s membership.'],
    [
      'a group with an active campaign',
      { activeCampaign: campaign('a', 'active') },
      'This also deletes every campaign in the group and removes all members. This can\'t be undone.',
      'This permanently deletes The Group, all of its campaigns, and everyone\'s membership.',
    ],
    [
      'a group with a draft',
      { drafts: [campaign('d1', 'draft')] },
      'This also deletes every campaign in the group and removes all members. This can\'t be undone.',
      'This permanently deletes The Group, all of its campaigns, and everyone\'s membership.',
    ],
    [
      'a group with an inactive campaign',
      { inactiveCampaigns: [campaign('i1', 'inactive')] },
      'This also deletes every campaign in the group and removes all members. This can\'t be undone.',
      'This permanently deletes The Group, all of its campaigns, and everyone\'s membership.',
    ],
  ] as const)('warns about %s in both steps', (_name, overrides, firstWarning, secondWarning) => {
    renderHome({ group: overrides })
    openDelete()

    expect(dialog().getByRole('heading', { level: 3, name: 'Delete group' })).toBeTruthy()
    const firstStep = [...screen.getByRole('dialog').querySelectorAll('p')].map((node) => node.textContent)
    expect(firstStep).toEqual(['Delete The Group?', firstWarning])

    fireEvent.click(dialog().getByRole('button', { name: 'Delete' }))
    expect(dialog().getByRole('heading', { level: 3, name: 'Are you sure?' })).toBeTruthy()
    const secondStep = [...screen.getByRole('dialog').querySelectorAll('p')].map((node) => node.textContent?.replace(/\s+/g, ' '))
    expect(secondStep).toEqual([`${secondWarning} There is no undo.`])
  })

  it('cancels the first step and goes back from the second', () => {
    const props = renderHome()
    openDelete()

    fireEvent.click(dialog().getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    openDelete()
    fireEvent.click(dialog().getByRole('button', { name: 'Delete' }))
    fireEvent.click(dialog().getByRole('button', { name: 'Back' }))
    expect(dialog().getByRole('heading', { level: 3, name: 'Delete group' })).toBeTruthy()
    expect(props.onDeleteGroup).not.toHaveBeenCalled()
  })

  it('does not carry focus from the first Delete button to the final one', () => {
    renderHome()
    openDelete()
    const firstDelete = dialog().getByRole('button', { name: 'Delete' })
    firstDelete.focus()
    expect(document.activeElement).toBe(firstDelete)

    fireEvent.click(firstDelete)
    expect(document.activeElement).not.toBe(dialog().getByRole('button', { name: 'Delete everything' }))
  })

  it('deletes the group and stays busy afterwards, because the screen is leaving', async () => {
    const props = renderHome()
    openDelete()
    fireEvent.click(dialog().getByRole('button', { name: 'Delete' }))

    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Delete everything' })))
    expect(props.onDeleteGroup).toHaveBeenCalledWith('g1')
    const busyButton = dialog().getByRole('button', { name: 'Deleting…' }) as HTMLButtonElement
    expect(busyButton.disabled).toBe(true)
    expect(busyButton.className).toBe('danger')

    fireEvent.click(dialog().getByRole('button', { name: 'Back' }))
    expect(dialog().getByRole('heading', { level: 3, name: 'Are you sure?' })).toBeTruthy()
  })

  it('shows why the group could not be deleted and lets the user try again', async () => {
    const props = renderHome()
    props.onDeleteGroup.mockRejectedValueOnce(new Error('Not empty.')).mockRejectedValueOnce(0)
    openDelete()
    fireEvent.click(dialog().getByRole('button', { name: 'Delete' }))

    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Delete everything' })))
    expect(dialog().getByText('Not empty.').className).toBe('error')
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Delete everything' })))
    expect(dialog().getByText('Unable to delete group.')).toBeTruthy()

    fireEvent.click(dialog().getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('dialog').querySelector('.error')).toBeNull()
  })

  it('reopens on the first step without the error when the delete button is pressed again', async () => {
    const props = renderHome({ group: { drafts: [campaign('d1', 'draft')] } })
    props.onSetActiveCampaign.mockRejectedValueOnce(new Error('Taken.'))
    fireEvent.click(within(card('Campaign d1')).getByRole('button', { name: 'Set active' }))
    await act(async () => fireEvent.click(dialog().getByRole('button', { name: 'Set active' })))

    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }))
    const deleteDialog = within(screen.getAllByRole('dialog')[1])
    expect(deleteDialog.queryByText('Taken.')).toBeNull()

    props.onDeleteGroup.mockRejectedValueOnce(new Error('Not empty.'))
    fireEvent.click(deleteDialog.getByRole('button', { name: 'Delete' }))
    await act(async () => fireEvent.click(deleteDialog.getByRole('button', { name: 'Delete everything' })))
    expect(deleteDialog.getByText('Not empty.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }))
    expect(deleteDialog.getByRole('heading', { level: 3, name: 'Delete group' })).toBeTruthy()
    expect(deleteDialog.queryByText('Not empty.')).toBeNull()
  })

  it('shows, on its first step, an error from another action that fails while it is open', async () => {
    const pending = deferred()
    const props = renderHome({ group: { drafts: [campaign('d1', 'draft')] } })
    props.onSetActiveCampaign.mockReturnValueOnce(pending.promise.then(() => undefined))
    fireEvent.click(within(card('Campaign d1')).getByRole('button', { name: 'Set active' }))
    fireEvent.click(dialog().getByRole('button', { name: 'Set active' }))
    openDelete()

    await act(async () => pending.reject(new Error('Taken.')))
    const deleteDialog = within(screen.getAllByRole('dialog')[1])
    expect(deleteDialog.getByText('Taken.').className).toBe('error')
    expect(deleteDialog.getByRole('heading', { level: 3, name: 'Delete group' })).toBeTruthy()
  })

  it('moves to the second step even while another action is busy', async () => {
    const pending = deferred()
    const props = renderHome({ group: { drafts: [campaign('d1', 'draft')] } })
    props.onSetActiveCampaign.mockReturnValueOnce(pending.promise.then(() => undefined))
    fireEvent.click(within(card('Campaign d1')).getByRole('button', { name: 'Set active' }))
    fireEvent.click(dialog().getByRole('button', { name: 'Set active' }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete group' }))
    const deleteDialog = within(screen.getAllByRole('dialog')[1])
    fireEvent.click(deleteDialog.getByRole('button', { name: 'Cancel' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)

    const firstDelete = deleteDialog.getByRole('button', { name: 'Delete' }) as HTMLButtonElement
    expect(firstDelete.disabled).toBe(false)
    fireEvent.click(firstDelete)
    expect((deleteDialog.getByRole('button', { name: 'Deleting…' }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => pending.resolve())
  })
})
