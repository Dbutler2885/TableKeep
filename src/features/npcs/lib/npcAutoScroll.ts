// Auto-scroll the NPC list while dragging near its top or bottom edge.

const EDGE = 60
const MAX_SPEED = 16

export type ScrollBox = {
  top: number
  bottom: number
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

export type AutoScroller = {
  raf: number | null
  speed: number
}

// The list is re-read on every frame, so scrolling stops if it unmounts.
export type ScrollList = { current: HTMLElement | null }

// Pixels per frame: negative scrolls up, positive scrolls down, faster the
// deeper the pointer is into the edge band, and zero when there is no room.
export function autoScrollSpeed(box: ScrollBox, clientY: number) {
  if (clientY < box.top + EDGE && box.scrollTop > 0) {
    return -Math.ceil(MAX_SPEED * Math.min(1, (box.top + EDGE - clientY) / EDGE))
  }
  if (clientY > box.bottom - EDGE && box.scrollTop + box.clientHeight < box.scrollHeight) {
    return Math.ceil(MAX_SPEED * Math.min(1, (clientY - (box.bottom - EDGE)) / EDGE))
  }
  return 0
}

export const createAutoScroller = (): AutoScroller => ({ raf: null, speed: 0 })

function stepAutoScroll(scroller: AutoScroller, list: ScrollList) {
  const el = list.current
  if (!el || scroller.speed === 0) {
    scroller.raf = null
    return
  }
  el.scrollTop += scroller.speed
  scroller.raf = requestAnimationFrame(() => stepAutoScroll(scroller, list))
}

function cancelFrame(scroller: AutoScroller) {
  if (scroller.raf != null) cancelAnimationFrame(scroller.raf)
  scroller.raf = null
}

function startFrames(scroller: AutoScroller, list: ScrollList) {
  if (scroller.raf == null) scroller.raf = requestAnimationFrame(() => stepAutoScroll(scroller, list))
}

export function updateAutoScroll(scroller: AutoScroller, list: ScrollList, clientY: number) {
  const el = list.current
  if (!el) return
  const { top, bottom } = el.getBoundingClientRect()
  scroller.speed = autoScrollSpeed({ top, bottom, scrollTop: el.scrollTop, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight }, clientY)
  if (scroller.speed !== 0) startFrames(scroller, list)
  else cancelFrame(scroller)
}

export function stopAutoScroll(scroller: AutoScroller) {
  cancelFrame(scroller)
  scroller.speed = 0
}
