import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { autoScrollSpeed, createAutoScroller, stopAutoScroll, updateAutoScroll } from './npcAutoScroll'

const box = { top: 100, bottom: 400, scrollTop: 50, clientHeight: 300, scrollHeight: 1000 }

describe('autoScrollSpeed', () => {
  it('scrolls up near the top, faster deeper into the edge, capped at 16', () => {
    expect(autoScrollSpeed(box, 150)).toBe(-3)
    expect(autoScrollSpeed(box, 100)).toBe(-16)
    expect(autoScrollSpeed(box, 20)).toBe(-16)
  })

  it('scrolls down near the bottom the same way', () => {
    expect(autoScrollSpeed(box, 350)).toBe(3)
    expect(autoScrollSpeed(box, 400)).toBe(16)
    expect(autoScrollSpeed(box, 900)).toBe(16)
  })

  it('stays still in the middle, and at either end of the content', () => {
    expect(autoScrollSpeed(box, 250)).toBe(0)
    expect(autoScrollSpeed({ ...box, scrollTop: 0 }, 110)).toBe(0)
    expect(autoScrollSpeed({ ...box, scrollTop: 700 }, 390)).toBe(0)
  })
})

describe('the auto-scroller', () => {
  let frames: Map<number, FrameRequestCallback>
  let nextFrame: number

  const runFrame = () => {
    const pending = [...frames.entries()]
    frames.clear()
    pending.forEach(([, callback]) => callback(0))
  }

  const listAt = (scrollTop: number) => {
    const el = { scrollTop, clientHeight: 300, scrollHeight: 1000, getBoundingClientRect: () => ({ top: 100, bottom: 400 }) }
    return { current: el as unknown as HTMLElement }
  }

  beforeEach(() => {
    frames = new Map()
    nextFrame = 1
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(nextFrame, callback)
      return nextFrame++
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('scrolls a step per frame on one frame loop, until the pointer leaves the edge', () => {
    const scroller = createAutoScroller()
    const list = listAt(50)
    updateAutoScroll(scroller, list, 390)
    updateAutoScroll(scroller, list, 390)
    expect(frames.size).toBe(1)
    runFrame()
    runFrame()
    expect(list.current.scrollTop).toBe(78)
    updateAutoScroll(scroller, list, 250)
    expect(frames.size).toBe(0)
    expect(scroller.raf).toBeNull()
  })

  it('ends the loop when the list has gone or the speed has dropped to zero', () => {
    const scroller = createAutoScroller()
    const list: { current: HTMLElement | null } = listAt(50)
    updateAutoScroll(scroller, list, 105)
    list.current = null
    runFrame()
    expect(scroller.raf).toBeNull()
    expect(frames.size).toBe(0)

    const other = listAt(50)
    updateAutoScroll(scroller, other, 105)
    scroller.speed = 0
    runFrame()
    expect(other.current.scrollTop).toBe(50)
    expect(scroller.raf).toBeNull()
  })

  it('does nothing without a list, and stops on request', () => {
    const scroller = createAutoScroller()
    updateAutoScroll(scroller, { current: null }, 390)
    expect(frames.size).toBe(0)
    updateAutoScroll(scroller, listAt(50), 390)
    stopAutoScroll(scroller)
    expect(frames.size).toBe(0)
    expect(scroller).toEqual({ raf: null, speed: 0 })
    stopAutoScroll(scroller)
    expect(scroller).toEqual({ raf: null, speed: 0 })
  })
})
