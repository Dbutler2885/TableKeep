import { useEffect, type RefObject } from 'react'

/** How an open box was dismissed: Escape hands focus back to its opener, a press outside leaves focus where it went. */
export type Dismissal = 'escape' | 'outside'

/** While `open`, Escape anywhere or a press outside `box` calls `close`. */
export function useDismissOnOutside(box: RefObject<Element | null>, open: boolean, close: (how: Dismissal) => void) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close('escape') }
    const onPress = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) close('outside') }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPress)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPress)
    }
  }, [box, open, close])
}
