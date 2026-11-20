// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, renderHook } from '@testing-library/react'
import { useLubecFitWidth } from './lubecFitWidth'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// A sheet inside a pane of the given width, with a ResizeObserver that reports
// at once and on demand.
function sheetInPane(width: number) {
  const pane = document.createElement('div')
  const sheet = document.createElement('article')
  pane.append(sheet)
  let paneWidth = width
  Object.defineProperty(pane, 'clientWidth', { get: () => paneWidth })
  const resize: { notify: () => void } = { notify: () => undefined }
  const observed: Element[] = []
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize.notify = callback }
    observe(element: Element) { observed.push(element) }
    disconnect() {}
  })
  return { pane, sheet, observed, resizeTo: (next: number) => { paneWidth = next; resize.notify() } }
}

describe('useLubecFitWidth', () => {
  it("sets the sheet's fit width from its pane, and follows the pane as it resizes", () => {
    const { pane, sheet, observed, resizeTo } = sheetInPane(939)
    renderHook(() => useLubecFitWidth({ current: sheet }))

    expect(observed).toEqual([pane])
    expect(sheet.style.getPropertyValue('--lubec-fit-width')).toBe('0.85')

    resizeTo(1600)
    expect(sheet.style.getPropertyValue('--lubec-fit-width')).toBe('1')
  })
})
