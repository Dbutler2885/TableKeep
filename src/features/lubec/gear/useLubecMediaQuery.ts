import { useCallback, useSyncExternalStore } from 'react'

const mediaQuery = (query: string): MediaQueryList | null => (typeof window.matchMedia === 'function' ? window.matchMedia(query) : null)

/** Whether the window matches `query` now, kept current as it changes. False where the browser has no media queries. */
export function useLubecMediaQuery(query: string): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const list = mediaQuery(query)
    list?.addEventListener('change', onChange)
    return () => list?.removeEventListener('change', onChange)
  }, [query])
  return useSyncExternalStore(subscribe, () => mediaQuery(query)?.matches ?? false, () => false)
}
