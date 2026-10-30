import { useEffect, useState } from 'react'

// Loaded on first use: every frame on the Gear page reaches this, and most never show an upload.
const urlOf = async (path: string) => (await import('../../common/mediaStorage')).resolveStoragePathUrl(path)

/** The URL of an item's uploaded picture, once it is known; null until then, or if it can't be had. Only the path is ever stored. */
export function useLubecPictureUrl(path: string | undefined): string | null {
  const [found, setFound] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (!path) return undefined
    let live = true
    urlOf(path).then((url) => {
      if (live && url) setFound({ path, url })
    }).catch(() => undefined)
    return () => { live = false }
  }, [path])
  return path && found?.path === path ? found.url : null
}
