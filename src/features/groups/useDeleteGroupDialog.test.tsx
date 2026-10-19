// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useBusyAction } from './useBusyAction'
import { useDeleteGroupDialog } from './useDeleteGroupDialog'

function renderDelete(deleteGroup: () => Promise<void>) {
  return renderHook(() => {
    const busyAction = useBusyAction()
    return { busyAction, dialog: useDeleteGroupDialog(busyAction, deleteGroup) }
  })
}

afterEach(() => {
  cleanup()
})

describe('useDeleteGroupDialog', () => {
  it('opens on the first step, advances, goes back and cancels', () => {
    const { result } = renderDelete(async () => undefined)

    act(() => result.current.dialog.show())
    expect([result.current.dialog.open, result.current.dialog.confirming]).toEqual([true, false])

    act(() => result.current.dialog.advance())
    expect(result.current.dialog.confirming).toBe(true)

    act(() => result.current.dialog.back())
    expect(result.current.dialog.confirming).toBe(false)

    act(() => result.current.dialog.cancel())
    expect(result.current.dialog.open).toBe(false)
  })

  it('reopens on the first step without the last error', async () => {
    const { result } = renderDelete(async () => Promise.reject(new Error('Not empty.')))
    act(() => result.current.dialog.show())
    act(() => result.current.dialog.advance())
    await act(() => result.current.dialog.confirm())
    expect(result.current.busyAction.error).toBe('Not empty.')

    act(() => result.current.dialog.show())

    expect(result.current.dialog.confirming).toBe(false)
    expect(result.current.busyAction.error).toBeNull()
  })

  it('stays busy after deleting, and then neither goes back nor cancels', async () => {
    const deleteGroup = vi.fn(async () => undefined)
    const { result } = renderDelete(deleteGroup)
    act(() => result.current.dialog.show())
    act(() => result.current.dialog.advance())

    await act(() => result.current.dialog.confirm())
    expect(deleteGroup).toHaveBeenCalledTimes(1)
    expect(result.current.busyAction.busy).toBe(true)

    act(() => result.current.dialog.back())
    act(() => result.current.dialog.cancel())
    expect([result.current.dialog.open, result.current.dialog.confirming]).toEqual([true, true])
  })

  it('falls back to its own message when the failure is not an Error', async () => {
    const { result } = renderDelete(async () => Promise.reject('x'))

    await act(() => result.current.dialog.confirm())

    expect(result.current.busyAction.error).toBe('Unable to delete group.')
    expect(result.current.busyAction.busy).toBe(false)
  })
})
