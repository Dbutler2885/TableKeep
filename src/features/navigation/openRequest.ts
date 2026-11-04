import { useEffect } from 'react'

// A page can ask another tab to open one record when it arrives there: the
// Combat tab's repair links open the sheet that is missing a value. The
// request rides in this browser tab's session storage, so it needs no route
// and a page that never takes it ignores it.

export type OpenRequestKind = 'character' | 'npc'

const KEY = 'table-keep-open-request'

/** Ask the next page of this kind to open the record with `id`. */
export function requestOpen(kind: OpenRequestKind, id: string): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ kind, id }))
  } catch {
    // Without storage the link still changes tab; the GM picks the record by hand.
  }
}

function storedRequest(): { kind?: string; id?: string } | null {
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) ?? 'null') as { kind?: string; id?: string } | null
  } catch {
    return null
  }
}

/** The id a request asks this kind of page to open, once; null without one. */
export function takeOpenRequest(kind: OpenRequestKind): string | null {
  const request = storedRequest()
  if (request?.kind !== kind || !request.id) return null
  window.sessionStorage.removeItem(KEY)
  return request.id
}

/** Opens a requested record once the page's list has loaded. */
export function useOpenRequest(kind: OpenRequestKind, ready: boolean, open: (id: string) => void): void {
  useEffect(() => {
    if (!ready) return
    const id = takeOpenRequest(kind)
    if (id) open(id)
  }, [kind, ready, open])
}
