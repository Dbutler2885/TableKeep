import { CROPS, type LubecPackCrop } from './backpackSlots'
import { useLubecMediaQuery } from './useLubecMediaQuery'

// Phones get the closer crop of the pack, so the boxes stay big enough to read (B's PHONE query).
const PHONE = '(max-width: 560px)'

/** The crop of the backpack picture for this window: the close one on a phone, else the wide one. */
export function useLubecPackCrop(): LubecPackCrop {
  return useLubecMediaQuery(PHONE) ? CROPS.phone : CROPS.wide
}
