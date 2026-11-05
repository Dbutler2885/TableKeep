// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { openPageOf, openPageWaiting, requestOpen, takeOpenRequest, useOpenRequest, useTakeOpenPage } from './openRequest'

beforeEach(() => window.sessionStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('open requests', () => {
  it('opens a requested record once, on the page of its kind, after its list loads', () => {
    requestOpen('npc', 'roy')
    expect(takeOpenRequest('character')).toBeNull()
    const open = vi.fn()
    const { rerender } = renderHook(({ ready }) => useOpenRequest('npc', ready, open), { initialProps: { ready: false } })
    expect(open).not.toHaveBeenCalled()
    rerender({ ready: true })
    expect(open).toHaveBeenCalledWith('roy')
    expect(takeOpenRequest('npc')).toBeNull()
  })

  it('carries a sheet page for the record it opens, taken once by the sheet that lands on it', () => {
    requestOpen('character', 'wayne', 'gear')
    expect([openPageWaiting('wayne'), openPageWaiting('dottie'), openPageOf('dottie')]).toEqual([true, false, null])
    const first = renderHook(() => useTakeOpenPage('wayne'))
    expect(first.result.current).toBe('gear')
    expect(openPageOf('wayne')).toBeNull()
    expect(renderHook(() => useTakeOpenPage('wayne')).result.current).toBeNull()
    requestOpen('character', 'wayne')
    expect(openPageWaiting('wayne')).toBe(false)
  })

  it('keeps a page when storage refuses to give it up', () => {
    requestOpen('npc', 'roy', 'gear')
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked') })
    expect(renderHook(() => useTakeOpenPage('roy')).result.current).toBe('gear')
  })

  it('ignores storage that refuses or holds something unreadable', () => {
    window.sessionStorage.setItem('table-keep-open-page', 'not json')
    expect(openPageWaiting('roy')).toBe(false)
    window.sessionStorage.setItem('table-keep-open-request', 'not json')
    expect(takeOpenRequest('npc')).toBeNull()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => requestOpen('character', 'wayne')).not.toThrow()
  })
})
