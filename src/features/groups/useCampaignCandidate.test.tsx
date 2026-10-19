// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { Campaign } from '../../types/app'
import { useBusyAction } from './useBusyAction'
import { useCampaignCandidate } from './useCampaignCandidate'

const campaign = { id: 'd1', name: 'Draft', status: 'draft', groupId: 'g1' } as Campaign

function renderCandidate(act: (campaignId: string) => Promise<void>) {
  return renderHook(() => {
    const busyAction = useBusyAction()
    return { busyAction, candidate: useCampaignCandidate(busyAction, act, 'Unable to do it.') }
  })
}

afterEach(() => {
  cleanup()
})

describe('useCampaignCandidate', () => {
  it('asks about a campaign, clearing any error', async () => {
    const { result } = renderCandidate(async () => Promise.reject(new Error('Locked.')))
    act(() => result.current.candidate.ask(campaign))
    await act(() => result.current.candidate.confirm())
    expect(result.current.busyAction.error).toBe('Locked.')

    act(() => result.current.candidate.ask(campaign))

    expect(result.current.candidate.candidate).toBe(campaign)
    expect(result.current.busyAction.error).toBeNull()
  })

  it('acts on the campaign and lets it go on success', async () => {
    const run = vi.fn(async (_campaignId: string) => undefined)
    const { result } = renderCandidate(run)
    act(() => result.current.candidate.ask(campaign))

    await act(() => result.current.candidate.confirm())

    expect(run).toHaveBeenCalledWith('d1')
    expect(result.current.candidate.candidate).toBeNull()
    expect(result.current.busyAction.busy).toBe(false)
  })

  it('keeps the campaign and falls back to its own message on failure', async () => {
    const { result } = renderCandidate(async () => Promise.reject('nope'))
    act(() => result.current.candidate.ask(campaign))

    await act(() => result.current.candidate.confirm())

    expect(result.current.candidate.candidate).toBe(campaign)
    expect(result.current.busyAction.error).toBe('Unable to do it.')
  })

  it('does nothing when confirmed with no campaign asked about', async () => {
    const run = vi.fn(async (_campaignId: string) => undefined)
    const { result } = renderCandidate(run)

    await act(() => result.current.candidate.confirm())

    expect(run).not.toHaveBeenCalled()
    expect(result.current.busyAction.busy).toBe(false)
  })

  it('cancels only while not busy', async () => {
    let finish!: () => void
    const { result } = renderCandidate(() => new Promise<void>((resolve) => (finish = resolve)))
    act(() => result.current.candidate.ask(campaign))
    let confirming!: Promise<void>
    act(() => {
      confirming = result.current.candidate.confirm()
    })

    act(() => result.current.candidate.cancel())
    expect(result.current.candidate.candidate).toBe(campaign)

    await act(async () => {
      finish()
      await confirming
    })
    act(() => result.current.candidate.ask(campaign))
    act(() => result.current.candidate.cancel())
    expect(result.current.candidate.candidate).toBeNull()
  })
})
