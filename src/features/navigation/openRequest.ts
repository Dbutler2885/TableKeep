import { useEffect, useState } from 'react'

// A page can ask another tab to open one record when it arrives there: the
// Combat tab's repair links open the sheet that is missing a value. The
// request rides in this browser tab's session storage, so it needs no route
// and a page that never takes it ignores it.

export type OpenRequestKind = 'character' | 'npc'

const KEY = 'table-keep-open-request'
const PAGE_KEY = 'table-keep-open-page'

/** A sheet page a request lands on, and that the Combat tab sent it there. */
export type OpenPage = 'gear'

/** Ask the next page of this kind to open the record with `id`, on `page` when one is named. */
export function requestOpen(kind: OpenRequestKind, id: string, page?: OpenPage): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ kind, id }))
    window.sessionStorage.setItem(PAGE_KEY, JSON.stringify(page ? { id, page } : null))
  } catch {
    // Without storage the link still changes tab; the GM picks the record by hand.
  }
}

function storedPage(): { id?: string; page?: OpenPage } | null {
  try {
    return JSON.parse(window.sessionStorage.getItem(PAGE_KEY) ?? 'null') as { id?: string; page?: OpenPage } | null
  } catch {
    return null
  }
}

/** The page a request asks record `id` to open on, without taking it; null without one. */
export function openPageOf(id: string): OpenPage | null {
  const request = storedPage()
  // A page request is only ever stored with both its record and its page.
  return request?.id === id ? request.page! : null
}

/** Whether a request is waiting to open record `id` on a page of its own, without taking it. */
export const openPageWaiting = (id: string): boolean => openPageOf(id) !== null

/** A sheet that has opened on its requested page takes the request, so it opens there only once. */
export function useTakeOpenPage(id: string): OpenPage | null {
  const [page] = useState(() => openPageOf(id))
  useEffect(() => {
    if (!page) return
    try {
      window.sessionStorage.removeItem(PAGE_KEY)
    } catch {
      // Storage that refused the request has nothing to take.
    }
  }, [page])
  return page
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
