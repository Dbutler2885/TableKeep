// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { requestOpen, takeOpenRequest, useOpenRequest } from './openRequest'

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

  it('ignores storage that refuses or holds something unreadable', () => {
    window.sessionStorage.setItem('table-keep-open-request', 'not json')
    expect(takeOpenRequest('npc')).toBeNull()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => requestOpen('character', 'wayne')).not.toThrow()
  })
})
