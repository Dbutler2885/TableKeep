import { useEffect, useState, type RefObject } from 'react'
import type { MediaSize } from './handoutViewport'

export function useHandoutElementSize(ref: RefObject<HTMLElement | null>): MediaSize {
  const [size, setSize] = useState<MediaSize>({ width: 0, height: 0 })
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}
