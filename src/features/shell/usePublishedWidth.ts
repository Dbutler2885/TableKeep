import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Keeps an element's width in a custom property on the document while it is
 * mounted, so what is fixed over the page (the demo notice, a sheet's page tabs
 * along the foot, the Lubec gear toasts) can clear the campaign sidebar, whose
 * width is set by its content.
 */
export function usePublishedWidth(ref: RefObject<HTMLElement | null>, property: string, enabled: boolean) {
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const publish = () => root.style.setProperty(property, `${element.getBoundingClientRect().width}px`)
    const observer = new ResizeObserver(publish)
    observer.observe(element)
    publish()
    return () => {
      observer.disconnect()
      root.style.removeProperty(property)
    }
  }, [ref, property, enabled])
}
