// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LubecInk } from './LubecInk'

// Each text's ink sits wholly to the left of its 40-wide advance by its own length in px.
const measured: string[] = []

beforeEach(() => {
  measured.length = 0
  vi.stubGlobal('OffscreenCanvas', class {
    getContext() {
      return {
        font: '',
        measureText(text: string) {
          measured.push(text)
          return { width: 40, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 40 - 2 * text.length }
        },
      }
    }
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('LubecInk', () => {
  it('shows its text centred by its ink, and measures it again when the text changes', () => {
    const { container, rerender } = render(<div style={{ fontSize: '10px' }}><LubecInk text="17" /></div>)
    const ink = container.querySelector('.lubec-ink') as HTMLSpanElement
    expect(ink.textContent).toBe('17')
    expect(ink.style.left).toBe('0.2em')
    rerender(<div style={{ fontSize: '10px' }}><LubecInk text="100" /></div>)
    expect(ink.style.left).toBe('0.3em')
    expect(measured).toEqual(['17', '100'])
  })
})
