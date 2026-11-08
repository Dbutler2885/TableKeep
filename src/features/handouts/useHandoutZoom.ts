import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { constrainMediaView, initialMediaView, mediaWheelFactor, zoomMediaAt, type MediaView } from './handoutViewport'
import { useHandoutElementSize } from './useHandoutElementSize'
import { useHandoutPointers } from './useHandoutPointers'

export function useHandoutZoom(width: number, height: number, resetKey: string | number) {
  const stageRef = useRef<HTMLDivElement>(null)
  const viewport = useHandoutElementSize(stageRef)
  const [saved, setSaved] = useState({ key: resetKey, view: initialMediaView() })
  const view = constrainMediaView(saved.key === resetKey ? saved.view : initialMediaView(), { width, height }, viewport)
  const change = useCallback((next: MediaView) => setSaved({ key: resetKey, view: next }), [resetKey])
  const update = useCallback((action: (view: MediaView) => MediaView) => {
    setSaved((current) => ({ key: resetKey, view: action(current.key === resetKey ? current.view : initialMediaView()) }))
  }, [resetKey])
  const zoom = useCallback((factor: number) => update((current) => zoomMediaAt(current, current.scale * factor, { x: 0, y: 0 }, { width, height }, viewport)), [height, update, viewport, width])
  const reset = () => change(initialMediaView())
  const pointers = useHandoutPointers(view, { width, height }, viewport, change)
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = stage.getBoundingClientRect()
      const anchor = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
      const factor = mediaWheelFactor(event.deltaY, event.deltaMode, event.ctrlKey, rect.height)
      update((current) => zoomMediaAt(current, current.scale * factor, anchor, { width, height }, viewport))
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [height, update, viewport, width])
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const factors: Record<string, number> = { '+': 1.25, '=': 1.25, '-': 0.8 }
    const factor = factors[event.key]
    if (factor) { event.preventDefault(); zoom(factor) }
    if (event.key === '0') { event.preventDefault(); reset() }
  }
  return { view, stageRef, pointers, onKeyDown, zoom, reset }
}
