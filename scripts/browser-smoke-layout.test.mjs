import { describe, expect, it } from 'vitest'
import { assertDesktopSheetFits } from './browser-smoke-layout.mjs'

const row = { right: 400, children: [{ top: 10, right: 200 }, { top: 10, right: 400 }] }

describe('desktop sheet layout assertions', () => {
  it('accepts a fitting sheet and one pixel of layout rounding in the action row', () => {
    expect(() => assertDesktopSheetFits('Core', 968, 968, row)).not.toThrow()
    expect(() => assertDesktopSheetFits('Core', 900, 968, { ...row, children: [row.children[0], { top: 11, right: 401 }] })).not.toThrow()
    expect(() => assertDesktopSheetFits('Core', 900, 968, { ...row, children: [] })).not.toThrow()
  })

  it.each([{ top: 12, right: 400 }, { top: 10, right: 402 }])('refuses wrapped or overflowing actions: %j', (child) => {
    expect(() => assertDesktopSheetFits('Core', 900, 968, { ...row, children: [row.children[0], child] })).toThrow('name-band actions wrap or overflow')
  })

  it('names the page and its measured height when it needs vertical scrolling', () => {
    expect(() => assertDesktopSheetFits('Gear', 980, 968, row)).toThrow('The Gear page is 980px tall in a 968px pane.')
  })
})
