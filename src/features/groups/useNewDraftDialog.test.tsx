// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useBusyAction } from './useBusyAction'
import { useNewDraftDialog } from './useNewDraftDialog'

function renderNewDraft(create: (name: string, system: string) => Promise<void>) {
  return renderHook(() => {
    const busyAction = useBusyAction()
    return { busyAction, newDraft: useNewDraftDialog(busyAction, create) }
  })
}

afterEach(() => {
  cleanup()
})

describe('useNewDraftDialog', () => {
  it('creates the draft as given and closes on success', async () => {
    const create = vi.fn(async (_name: string, _system: string) => undefined)
    const { result } = renderNewDraft(create)
    act(() => result.current.newDraft.show())

    await act(() => result.current.newDraft.create('Next Run', 'vtm'))

    expect(create).toHaveBeenCalledWith('Next Run', 'vtm')
    expect(result.current.newDraft.open).toBe(false)
  })

  it('stays open with the error on failure, and cancelling clears it', async () => {
    const { result } = renderNewDraft(async () => Promise.reject(null))
    act(() => result.current.newDraft.show())

    await act(() => result.current.newDraft.create('Next Run', 'ose'))
    expect(result.current.newDraft.open).toBe(true)
    expect(result.current.busyAction.error).toBe('Unable to create campaign.')

    act(() => result.current.newDraft.cancel())
    expect(result.current.newDraft.open).toBe(false)
    expect(result.current.busyAction.error).toBeNull()
  })

  it('cannot be cancelled while creating', async () => {
    let finish!: () => void
    const { result } = renderNewDraft(() => new Promise<void>((resolve) => (finish = resolve)))
    act(() => result.current.newDraft.show())
    let creating!: Promise<void>
    act(() => {
      creating = result.current.newDraft.create('Next Run', 'ose')
    })

    act(() => result.current.newDraft.cancel())
    expect(result.current.newDraft.open).toBe(true)

    await act(async () => {
      finish()
      await creating
    })
    expect(result.current.newDraft.open).toBe(false)
  })
})
