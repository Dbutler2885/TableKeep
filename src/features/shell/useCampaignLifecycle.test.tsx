// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useCampaignLifecycle } from './useCampaignLifecycle'

const actions = () => ({
  setActiveCampaign: vi.fn(async () => undefined),
  deactivateCampaign: vi.fn(async () => undefined),
  deleteDraftCampaign: vi.fn(async () => undefined),
  deleteInactiveCampaign: vi.fn(async () => undefined),
})

function renderAt(path: string, campaignActions = actions()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/groups/:groupId" element={children} />
        <Route path="/groups/:groupId/campaigns/:campaignId/*" element={children} />
      </Routes>
    </MemoryRouter>
  )
  const view = renderHook(() => {
    const params = useParams()
    const location = useLocation()
    const handlers = useCampaignLifecycle({
      navigate: useNavigate(),
      selectedGroupId: params.groupId ?? null,
      selectedCampaignId: params.campaignId ?? null,
      ...campaignActions,
    })
    return { handlers, pathname: location.pathname }
  }, { wrapper })
  return { ...view, campaignActions }
}

afterEach(() => {
  cleanup()
})

describe('useCampaignLifecycle', () => {
  it('sets and deactivates a campaign without navigating', async () => {
    const { result, campaignActions } = renderAt('/groups/g1/campaigns/c1/maps')

    await act(() => result.current.handlers.handleSetActiveCampaign('g1', 'c1'))
    await act(() => result.current.handlers.handleDeactivateCampaign('g1', 'c1'))

    expect(campaignActions.setActiveCampaign).toHaveBeenCalledWith('g1', 'c1')
    expect(campaignActions.deactivateCampaign).toHaveBeenCalledWith('g1', 'c1')
    expect(result.current.pathname).toBe('/groups/g1/campaigns/c1/maps')
  })

  it('returns to the group home after deleting the draft the route shows', async () => {
    const { result, campaignActions } = renderAt('/groups/g1/campaigns/d1/notes')

    await act(() => result.current.handlers.handleDeleteDraftCampaign('g1', 'd1'))

    expect(campaignActions.deleteDraftCampaign).toHaveBeenCalledWith('g1', 'd1')
    expect(result.current.pathname).toBe('/groups/g1')
  })

  it('returns to the group home after deleting the inactive campaign the route shows', async () => {
    const { result, campaignActions } = renderAt('/groups/g1/campaigns/i1/notes')

    await act(() => result.current.handlers.handleDeleteInactiveCampaign('g1', 'i1'))

    expect(campaignActions.deleteInactiveCampaign).toHaveBeenCalledWith('g1', 'i1')
    expect(result.current.pathname).toBe('/groups/g1')
  })

  it('stays put after deleting a campaign the route does not show', async () => {
    const { result } = renderAt('/groups/g1/campaigns/c1/notes')

    await act(() => result.current.handlers.handleDeleteDraftCampaign('g1', 'd1'))
    await act(() => result.current.handlers.handleDeleteInactiveCampaign('g2', 'c1'))
    expect(result.current.pathname).toBe('/groups/g1/campaigns/c1/notes')
  })

  it('stays on the group home after deleting a campaign from it', async () => {
    const { result } = renderAt('/groups/g1')

    await act(() => result.current.handlers.handleDeleteDraftCampaign('g1', 'd1'))
    expect(result.current.pathname).toBe('/groups/g1')
  })

  it('does not navigate when the delete fails', async () => {
    const campaignActions = actions()
    campaignActions.deleteDraftCampaign.mockRejectedValueOnce(new Error('denied'))
    const { result } = renderAt('/groups/g1/campaigns/d1/notes', campaignActions)

    await expect(act(() => result.current.handlers.handleDeleteDraftCampaign('g1', 'd1'))).rejects.toThrow('denied')
    expect(result.current.pathname).toBe('/groups/g1/campaigns/d1/notes')
  })
})
