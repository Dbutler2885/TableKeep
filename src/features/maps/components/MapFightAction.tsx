import { Swords } from 'lucide-react'
import type { TokenRecord } from '../lib/types'
import { useMapFight } from '../mapFight'

/**
 * The map's Fight action for the selected tokens, beside the viewer's other
 * map controls, in a rule set with a fight modal.
 */
export function MapFightAction({ tokens, className }: { tokens: readonly TokenRecord[]; className: string }) {
  const fight = useMapFight(tokens)
  if (!fight) return null
  return (
    <button type="button" className={`${className} fast-tooltip`} onClick={fight} aria-label="Fight" data-tooltip="Fight">
      <Swords size={16} />
    </button>
  )
}
