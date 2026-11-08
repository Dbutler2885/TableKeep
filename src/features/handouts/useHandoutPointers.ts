import { useEffect, useRef, type PointerEvent } from 'react'
import { gestureMediaView, type MediaPoint, type MediaSize, type MediaView } from './handoutViewport'

type Gesture = { view: MediaView; points: MediaPoint[] }
const pointerPosition = (event: PointerEvent<HTMLElement>): MediaPoint => {
  const rect = event.currentTarget.getBoundingClientRect()
  return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }
}

export function useHandoutPointers(view: MediaView, content: MediaSize, viewport: MediaSize, onChange: (view: MediaView) => void) {
  const viewRef = useRef(view)
  const points = useRef(new Map<number, MediaPoint>())
  const gesture = useRef<Gesture | null>(null)
  useEffect(() => { viewRef.current = view }, [view])
  const begin = () => { gesture.current = { view: viewRef.current, points: [...points.current.values()] } }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    points.current.set(event.pointerId, pointerPosition(event))
    event.currentTarget.setPointerCapture?.(event.pointerId)
    begin()
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!points.current.has(event.pointerId) || !gesture.current) return
    points.current.set(event.pointerId, pointerPosition(event))
    onChange(gestureMediaView(gesture.current.view, gesture.current.points, [...points.current.values()], content, viewport))
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    points.current.delete(event.pointerId)
    begin()
  }
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onLostPointerCapture: onPointerUp }
}
