// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import type { Campaign, GroupRecord } from '../../types/app'
import { groupEntryPath, useGroupNavigation } from './useGroupNavigation'

const group = (id: string, activeCampaign: Campaign | null) => ({ id, activeCampaign }) as GroupRecord
const campaign = (id: string) => ({ id }) as Campaign

function renderAt(path: string, selectedGroupId: string | null, groups: GroupRecord[] = []) {
  const setDrawerOpen = vi.fn()
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  const view = renderHook(() => {
    const location = useLocation()
    const handlers = useGroupNavigation({
      groups,
      navigate: useNavigate(),
      selectedGroupId,
      setDrawerOpen,
      createGroup: async () => 'g-new',
      createCampaign: async () => 'c-new',
      deleteGroup: async () => undefined,
    })
    return { handlers, pathname: location.pathname }
  }, { wrapper })
  return { ...view, setDrawerOpen }
}

afterEach(() => {
  cleanup()
})

describe('groupEntryPath', () => {
  it('opens the active campaign of a group that has one', () => {
    expect(groupEntryPath([group('g1', campaign('c1'))], 'g1')).toBe('/groups/g1/campaigns/c1/character')
  })

  it('opens the home of a group without one, or of an unknown group', () => {
    expect(groupEntryPath([group('g1', null)], 'g1')).toBe('/groups/g1')
    expect(groupEntryPath([], 'g9')).toBe('/groups/g9')
  })
})

describe('useGroupNavigation', () => {
  it('closes the drawer after choosing a group', () => {
    const { result, setDrawerOpen } = renderAt('/groups', null, [group('g1', campaign('c1'))])

    act(() => result.current.handlers.handleSelectGroup('g1'))

    expect(result.current.pathname).toBe('/groups/g1/campaigns/c1/character')
    expect(setDrawerOpen).toHaveBeenCalledWith(false)
  })

  it('opens nothing without a selected group', () => {
    const { result } = renderAt('/groups', null)

    act(() => result.current.handlers.handleOpenCampaign('c1'))

    expect(result.current.pathname).toBe('/groups')
  })

  it('opens a campaign of the selected group', () => {
    const { result } = renderAt('/groups/g1', 'g1')

    act(() => result.current.handlers.handleOpenCampaign('c2'))

    expect(result.current.pathname).toBe('/groups/g1/campaigns/c2/character')
  })

  it('opens the active campaign of a group, if it has one', () => {
    const { result } = renderAt('/groups/g1', 'g1')

    act(() => result.current.handlers.openActiveCampaign(group('g1', null)))
    expect(result.current.pathname).toBe('/groups/g1')

    act(() => result.current.handlers.openActiveCampaign(group('g1', campaign('c3'))))
    expect(result.current.pathname).toBe('/groups/g1/campaigns/c3/character')
  })

  it('opens the group home after creating a group or campaign, and the picker after deleting a group', async () => {
    const { result } = renderAt('/groups/g1', 'g1')

    await act(() => result.current.handlers.handleCreateGroup('New Table'))
    expect(result.current.pathname).toBe('/groups/g-new')

    await act(() => result.current.handlers.handleCreateCampaign('g1', 'Next', 'ose'))
    expect(result.current.pathname).toBe('/groups/g1')

    await act(() => result.current.handlers.handleDeleteGroup('g1'))
    expect(result.current.pathname).toBe('/groups')
  })
})
