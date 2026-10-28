import { useEffect, useState } from 'react'
import { lubecBackpackUrl, type LubecBackpackArt } from './backpackArt'

// URLs already looked up, so a pack seen once shows at once when it comes back.
const known = new Map<string, string>()

const keyOf = (name: LubecBackpackArt, thumb: boolean) => `${name}${thumb ? '.thumb' : ''}`

/** The URL of a pack's picture, or of its thumbnail, once it is known; null until then. */
export function useLubecBackpackUrl(name: LubecBackpackArt, thumb = false): string | null {
  const key = keyOf(name, thumb)
  const [found, setFound] = useState<{ key: string; url: string } | null>(null)
  useEffect(() => {
    if (known.has(key)) return undefined
    let live = true
    void lubecBackpackUrl(name, thumb).then((url) => {
      known.set(key, url)
      if (live) setFound({ key, url })
    })
    return () => { live = false }
  }, [key, name, thumb])
  return known.get(key) ?? (found?.key === key ? found.url : null)
}
