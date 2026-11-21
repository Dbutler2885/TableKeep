// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GroupRecord } from '../../types/app'
import { GroupPicker } from './GroupPicker'

vi.mock('../auth/DiscordConnection', () => ({ DiscordConnection: () => <p>Discord connection</p> }))
vi.mock('../auth/DiscordReturnNotice', () => ({ DiscordReturnNotice: () => null }))

afterEach(cleanup)

const group = (id: string, name: string, active: string | null): GroupRecord => ({
  id, name, slug: id, activeCampaignId: active, activeCampaign: active ? { id: active, name: 'The Long Night' } as GroupRecord['activeCampaign'] : null,
  drafts: [], inactiveCampaigns: [], memberRole: 'admin',
})

type Props = Partial<Parameters<typeof GroupPicker>[0]>
const picker = (props: Props = {}) => (
  <GroupPicker username="demoGM1" groups={[]} loading={false} onCreateGroup={async () => undefined} onSelectGroup={() => undefined} onSignOut={() => undefined} {...props} />
)

describe('the group picker before the groups arrive', () => {
  it('says it is opening the groups rather than that there are none', () => {
    render(picker({ loading: true }))
    expect(screen.getByRole('status').textContent).toBe('Opening your groups…')
    expect(screen.queryByText('No groups yet')).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Create a group' })).toBeNull()
  })

  it('offers to create a group once the answer really is none', () => {
    render(picker())
    expect(screen.getByText('No groups yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Create a group' })).toBeTruthy()
  })
})

describe('choosing and creating a group', () => {
  it('lists each group with its role and active campaign, and opens the one chosen', () => {
    const onSelectGroup = vi.fn()
    render(picker({ groups: [group('a', 'Big Fight Lab', 'c1'), group('b', 'Knights', null)], onSelectGroup, discordUserId: 'u1' }))
    expect(screen.getByText('Discord connection')).toBeTruthy()
    expect(screen.getByText('Active campaign: The Long Night')).toBeTruthy()
    expect(screen.getByText('No active campaign')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Knights/ }))
    expect(onSelectGroup).toHaveBeenCalledWith('b')
  })

  it('creates a group under the name typed, then closes the dialog', async () => {
    const onCreateGroup = vi.fn(async () => undefined)
    render(picker({ groups: [group('a', 'Big Fight Lab', null)], onCreateGroup }))
    fireEvent.click(screen.getByRole('button', { name: 'Create a group' }))
    const create = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Night Shift' } })
    fireEvent.click(create)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(onCreateGroup).toHaveBeenCalledWith('Night Shift')
  })

  it('keeps the dialog open with the reason when creating fails, and Cancel closes it', async () => {
    render(picker({ onCreateGroup: async () => { throw new Error('Name taken.') } }))
    fireEvent.click(screen.getByRole('button', { name: '+ Create a group' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Night Shift' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(screen.getByText('Name taken.')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says it could not create the group when the failure has no message', async () => {
    render(picker({ onCreateGroup: async () => { throw 'offline' } }))
    fireEvent.click(screen.getByRole('button', { name: '+ Create a group' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Night Shift' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(screen.getByText('Unable to create group.')).toBeTruthy())
  })

  it('ignores Cancel while the group is still being created', () => {
    render(picker({ onCreateGroup: () => new Promise<void>(() => undefined) }))
    fireEvent.click(screen.getByRole('button', { name: '+ Create a group' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Night Shift' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
