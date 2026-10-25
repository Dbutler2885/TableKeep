// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lubecInkShift, type LubecInkMetrics } from './lubecInkCentre'

// A "1" in a tabular cell: 20 wide, its ink from 6 to 14, so already centred;
// and a "17": ink starting 6 in and ending 2 short of its 40.
const one: LubecInkMetrics = { width: 20, actualBoundingBoxLeft: -6, actualBoundingBoxRight: 14 }
const seventeen: LubecInkMetrics = { width: 40, actualBoundingBoxLeft: -6, actualBoundingBoxRight: 38 }

describe('lubecInkShift', () => {
  it('leaves text whose side bearings match where it is', () => {
    expect(lubecInkShift(one, 20)).toBe(0)
  })

  it('moves text toward its wider side bearing by half the difference, in em', () => {
    expect(lubecInkShift(seventeen, 20)).toBe(-0.1)
    expect(lubecInkShift({ width: 40, actualBoundingBoxLeft: -2, actualBoundingBoxRight: 34 }, 20)).toBe(0.1)
  })

  it('counts ink that reaches past the origin', () => {
    expect(lubecInkShift({ width: 30, actualBoundingBoxLeft: 1, actualBoundingBoxRight: 31 }, 10)).toBe(0)
  })
})

describe('centreLubecInk', () => {
  const measured: string[] = []
  const fonts: string[] = []

  beforeEach(() => {
    vi.resetModules()
    measured.length = 0
    fonts.length = 0
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubCanvas() {
    vi.stubGlobal('OffscreenCanvas', class {
      getContext() {
        return {
          set font(value: string) { fonts.push(value) },
          measureText(text: string) {
            measured.push(text)
            return seventeen
          },
        }
      }
    })
  }

  function element(text: string, style: Partial<CSSStyleDeclaration>) {
    const span = document.createElement('span')
    span.textContent = text
    Object.assign(span.style, style)
    document.body.append(span)
    return span
  }

  it('moves the element by its measured side bearings, in the font it is drawn in', async () => {
    stubCanvas()
    const { centreLubecInk } = await import('./lubecInkCentre')
    const span = element('17', { fontStyle: 'normal', fontWeight: '800', fontSize: '20px', fontFamily: 'Rockwell' })
    centreLubecInk(span)
    expect(fonts).toEqual(['normal 800 20px Rockwell'])
    expect(measured).toEqual(['17'])
    expect(span.style.left).toBe('-0.1em')
  })

  it('measures uppercased text as it is drawn', async () => {
    stubCanvas()
    const { centreLubecInk } = await import('./lubecInkCentre')
    centreLubecInk(element('Roll', { fontSize: '20px', textTransform: 'uppercase' }))
    expect(measured).toEqual(['ROLL'])
  })

  it('leaves the element where it is with no canvas to measure with', async () => {
    vi.stubGlobal('OffscreenCanvas', undefined)
    const { centreLubecInk } = await import('./lubecInkCentre')
    const span = element('17', { fontSize: '20px' })
    centreLubecInk(span)
    expect(span.style.left).toBe('')
  })
})
