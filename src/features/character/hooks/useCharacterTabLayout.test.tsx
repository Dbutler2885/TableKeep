// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useCharacterTabLayout } from './useCharacterTabLayout'

beforeEach(() => { window.innerWidth = 600 })
afterEach(cleanup)

const params = { grantMode: false, role: 'gm' as const, selectedCharacterId: '', embeddedMode: false }

describe('character tab layout', () => {
  it('honours grant mode only for a GM', () => {
    expect(renderHook(() => useCharacterTabLayout({ ...params, grantMode: true })).result.current.effectiveGrantMode).toBe(true)
    expect(renderHook(() => useCharacterTabLayout({ ...params, grantMode: true, role: 'player' })).result.current.effectiveGrantMode).toBe(false)
    expect(renderHook(() => useCharacterTabLayout({ ...params, grantMode: true, role: null })).result.current.effectiveGrantMode).toBe(false)
  })

  it.each([
    { name: 'nothing open', overrides: {}, detail: false },
    { name: 'a selected sheet', overrides: { selectedCharacterId: 'hero' }, detail: true },
    { name: 'GM grant mode', overrides: { grantMode: true }, detail: true },
    { name: 'player grant mode', overrides: { grantMode: true, role: 'player' as const }, detail: false },
  ])('keeps the detail pane when narrowing only with something open ($name)', ({ overrides, detail }) => {
    window.innerWidth = 1600
    const { result } = renderHook(() => useCharacterTabLayout({ ...params, ...overrides }))
    expect(result.current).toMatchObject({ effectiveShowListPane: true, effectiveShowDetailPane: true })
    window.innerWidth = 600
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(result.current).toMatchObject({ effectiveShowListPane: !detail, effectiveShowDetailPane: detail })
  })

  it('always shows only the detail pane when embedded', () => {
    expect(renderHook(() => useCharacterTabLayout({ ...params, embeddedMode: true })).result.current).toMatchObject({ effectiveShowListPane: false, effectiveShowDetailPane: true })
  })
})
