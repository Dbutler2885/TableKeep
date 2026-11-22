import type { LubecItem } from '../../ruleSets/lubec/gear/gearRecord'
import { isLubecArt } from '../gear/gearArt'
import { LubecPicture } from '../gear/LubecGearArt'

/** The mock-up's default Dodgeball picture; an item's own artwork still wins. */
export function LubecFightPicture({ item }: { item: LubecItem }) {
  if (item.table !== 'dodgeball' || item.picturePath || isLubecArt(item.art)) {
    return <LubecPicture item={item} frame="pic" />
  }
  return <span className="pic">
    <svg className="ball" viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill="#a34229" stroke="#17282b" strokeWidth="2.4" />
      <path d="M5 17q15 7 30 0M5 24q15 7 30 0M20 4q-8 16 0 32M20 4q8 16 0 32" fill="none" stroke="#fff8e7" strokeWidth="1.6" />
    </svg>
  </span>
}
