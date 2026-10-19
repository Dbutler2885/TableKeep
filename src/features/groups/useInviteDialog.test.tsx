// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { User } from 'firebase/auth'
import type { GroupRecord } from '../../types/app'

const invites = vi.hoisted(() => ({
  createInvite: vi.fn<(input: { groupId: string; groupName: string; createdByName: string }) => Promise<string>>(),
  revokeInvite: vi.fn<(token: string) => Promise<void>>(),
  groupIds: [] as Array<string | null>,
}))

vi.mock('../invites/useInvites', () => ({
  useGroupInvites: (_user: User, groupId: string | null) => {
    invites.groupIds.push(groupId)
    return { invites: [], createInvite: invites.createInvite, revokeInvite: invites.revokeInvite }
  },
}))

const { useInviteDialog } = await import('./useInviteDialog')

const group = { id: 'g1', name: 'The Group' } as GroupRecord

function setClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: writeText ? { writeText } : undefined })
}

const renderInvites = () => renderHook(() => useInviteDialog({ uid: 'gm-1' } as User, group, 'gmuser1'))

beforeEach(() => {
  invites.groupIds = []
  invites.createInvite.mockReset()
  invites.revokeInvite.mockReset()
  setClipboard(vi.fn(async () => undefined))
})

afterEach(() => {
  cleanup()
})

describe('useInviteDialog', () => {
  it('reads the group\'s invites only while open', () => {
    const { result } = renderInvites()
    expect(invites.groupIds.at(-1)).toBeNull()

    act(() => result.current.show())
    expect(invites.groupIds.at(-1)).toBe('g1')

    act(() => result.current.close())
    expect(invites.groupIds.at(-1)).toBeNull()
  })

  it('generates an invite as this user and copies its link', async () => {
    const writeText = vi.fn(async (_text: string) => undefined)
    setClipboard(writeText)
    invites.createInvite.mockResolvedValueOnce('tok-1')
    const { result } = renderInvites()

    await act(() => result.current.generate())

    expect(invites.createInvite).toHaveBeenCalledWith({ groupId: 'g1', groupName: 'The Group', createdByName: 'gmuser1' })
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/tok-1`)
    expect(result.current.copiedToken).toBe('tok-1')
    expect(result.current.busy).toBe(false)
  })

  it('generates without an error when the clipboard refuses', async () => {
    setClipboard(async () => Promise.reject(new Error('denied')))
    invites.createInvite.mockResolvedValueOnce('tok-1')
    const { result } = renderInvites()

    await act(() => result.current.generate())

    expect(result.current.copiedToken).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('shows why generating failed', async () => {
    invites.createInvite.mockRejectedValueOnce(new Error('Quota.')).mockRejectedValueOnce('x')
    const { result } = renderInvites()

    await act(() => result.current.generate())
    expect(result.current.error).toBe('Quota.')
    await act(() => result.current.generate())
    expect(result.current.error).toBe('Could not create invite.')
    expect(result.current.busy).toBe(false)
  })

  it('copies a link, or says the clipboard is unavailable', async () => {
    const { result } = renderInvites()

    await act(() => result.current.copyLink('tok-2'))
    expect(result.current.copiedToken).toBe('tok-2')

    setClipboard(async () => Promise.reject(new Error('denied')))
    await act(() => result.current.copyLink('tok-3'))
    expect(result.current.copiedToken).toBe('tok-2')
    expect(result.current.error).toBe('Clipboard unavailable. Copy the link manually.')
  })

  it('revokes an invite, or shows why it could not', async () => {
    invites.revokeInvite.mockResolvedValueOnce(undefined).mockRejectedValueOnce(null)
    const { result } = renderInvites()

    await act(() => result.current.revoke('tok-1'))
    expect(invites.revokeInvite).toHaveBeenCalledWith('tok-1')
    expect(result.current.error).toBeNull()

    await act(() => result.current.revoke('tok-1'))
    expect(result.current.error).toBe('Could not revoke invite.')
    expect(result.current.busy).toBe(false)
  })

  it('clears the error and copied mark when shown or closed', async () => {
    invites.createInvite.mockRejectedValueOnce(new Error('Quota.'))
    const { result } = renderInvites()
    await act(() => result.current.copyLink('tok-2'))
    await act(() => result.current.generate())

    act(() => result.current.show())
    expect([result.current.error, result.current.copiedToken]).toEqual([null, null])

    await act(() => result.current.copyLink('tok-2'))
    act(() => result.current.close())
    expect([result.current.open, result.current.copiedToken]).toEqual([false, null])
  })
})
