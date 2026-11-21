// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupPicker } from './GroupPicker'

vi.mock('../auth/DiscordConnection', () => ({ DiscordConnection: () => null }))
vi.mock('../auth/DiscordReturnNotice', () => ({ DiscordReturnNotice: () => null }))

afterEach(cleanup)

const picker = (loading: boolean) => (
  <GroupPicker username="demoGM1" groups={[]} loading={loading} onCreateGroup={async () => undefined} onSelectGroup={() => undefined} onSignOut={() => undefined} />
)

describe('the group picker before the groups arrive', () => {
  it('says it is opening the groups rather than that there are none', () => {
    render(picker(true))
    expect(screen.getByRole('status').textContent).toBe('Opening your groups…')
    expect(screen.queryByText('No groups yet')).toBeNull()
    expect(screen.queryByRole('button', { name: '+ Create a group' })).toBeNull()
  })

  it('offers to create a group once the answer really is none', () => {
    render(picker(false))
    expect(screen.getByText('No groups yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: '+ Create a group' })).toBeTruthy()
  })
})
