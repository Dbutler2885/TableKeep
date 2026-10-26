import { useSyncExternalStore } from 'react'
import { CROPS, type LubecPackCrop } from './backpackSlots'

// Phones get the closer crop of the pack, so the boxes stay big enough to read (B's PHONE query).
const PHONE = '(max-width: 560px)'

const phoneQuery = (): MediaQueryList | null => (typeof window.matchMedia === 'function' ? window.matchMedia(PHONE) : null)

function subscribe(onChange: () => void): () => void {
  const query = phoneQuery()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

const isPhone = (): boolean => phoneQuery()?.matches ?? false

/** The crop of the backpack picture for this window: the close one on a phone, else the wide one. */
export function useLubecPackCrop(): LubecPackCrop {
  return useSyncExternalStore(subscribe, isPhone, () => false) ? CROPS.phone : CROPS.wide
}
