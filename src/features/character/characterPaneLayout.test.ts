import { describe, expect, it } from 'vitest'
import { CHARACTER_SINGLE_PANE_MAX_WIDTH } from '../../constants/layout'
import { isSinglePaneWidth, paneViewAfterResize } from './characterPaneLayout'

describe('isSinglePaneWidth', () => {
  it('treats the breakpoint itself as single pane', () => {
    expect(isSinglePaneWidth(CHARACTER_SINGLE_PANE_MAX_WIDTH)).toBe(true)
    expect(isSinglePaneWidth(CHARACTER_SINGLE_PANE_MAX_WIDTH + 1)).toBe(false)
  })

  it('collapses well before true mobile widths', () => {
    expect(isSinglePaneWidth(1000)).toBe(true)
    expect(isSinglePaneWidth(1600)).toBe(false)
  })
})

describe('paneViewAfterResize', () => {
  it('keeps the sheet when collapsing with one open', () => {
    expect(paneViewAfterResize({ wasSinglePane: false, isSinglePane: true, hasOpenDetail: true })).toBe('detail')
  })

  it('falls back to the roster when collapsing with nothing open', () => {
    expect(paneViewAfterResize({ wasSinglePane: false, isSinglePane: true, hasOpenDetail: false })).toBe('list')
  })

  it('parks on the roster when expanding back to two panes', () => {
    expect(paneViewAfterResize({ wasSinglePane: true, isSinglePane: false, hasOpenDetail: true })).toBe('list')
  })

  it('leaves the current view alone when the mode does not change', () => {
    expect(paneViewAfterResize({ wasSinglePane: true, isSinglePane: true, hasOpenDetail: true })).toBeNull()
    expect(paneViewAfterResize({ wasSinglePane: true, isSinglePane: true, hasOpenDetail: false })).toBeNull()
    expect(paneViewAfterResize({ wasSinglePane: false, isSinglePane: false, hasOpenDetail: true })).toBeNull()
  })
})
