import { FileUser } from 'lucide-react'
import type { TokenRecord } from '../lib/types'
import { npcSheetTokenNpcId, useNpcSheetOpener } from '../mapNpcSheet'

/**
 * The token row's "Open character sheet" button, beside the row's own
 * toggles, for the one selected NPC token in a rule set that keeps NPC sheets.
 */
export function NpcSheetTokenAction({ selectedTokens }: { selectedTokens: readonly TokenRecord[] }) {
  const open = useNpcSheetOpener()
  const npcId = npcSheetTokenNpcId(selectedTokens)
  if (!open || !npcId) return null
  return (
    <button
      type="button"
      className="token-toggle-btn map-icon-btn fast-tooltip"
      onClick={() => open(npcId)}
      aria-label="Open character sheet"
      data-tooltip="Character sheet"
    >
      <FileUser size={14} />
    </button>
  )
}
