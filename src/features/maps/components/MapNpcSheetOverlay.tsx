import { Fragment, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { NpcRecord } from '../../../types/app'
import type { CampaignScope } from '../../campaign/firestorePaths'
import { useMapNpcRecord } from '../hooks/useMapNpcRecord'
import { MapNpcSheetContext } from '../mapNpcSheet'

/** An NPC's character sheet, as its rule set shows it to the GM. */
export type NpcSheetFor = (npc: NpcRecord) => ReactNode

type MapNpcSheetOverlayProps = {
  scope: CampaignScope
  npcId: string
  sheetFor: NpcSheetFor
  onClose: () => void
}

function MapNpcSheetBody({ npc, sheetFor }: { npc: NpcRecord | null | undefined; sheetFor: NpcSheetFor }) {
  if (npc === undefined) return <p className="map-npc-sheet-note">Opening the sheet…</p>
  if (npc === null) return <p className="map-npc-sheet-note">This token's NPC has been deleted.</p>
  return <Fragment key={npc.id}>{sheetFor(npc)}</Fragment>
}

// The NPC's sheet over the map, nearly the whole window, with a bar above it
// naming the NPC and holding the close button.
function MapNpcSheetOverlay({ scope, npcId, sheetFor, onClose }: MapNpcSheetOverlayProps) {
  const npc = useMapNpcRecord(scope, npcId)
  return (
    <div className="confirm-overlay map-npc-sheet-overlay" role="dialog" aria-modal="true" aria-labelledby="map-npc-sheet-title">
      <div className="confirm-modal map-npc-sheet-modal">
        <header className="map-npc-sheet-header">
          <h3 id="map-npc-sheet-title">
            <span className="map-npc-sheet-kicker">Character sheet</span>{' '}
            <span className="map-npc-sheet-name">{npc?.name ?? ''}</span>
          </h3>
          <button type="button" className="map-edit-btn map-npc-sheet-close" onClick={onClose} aria-label="Close character sheet">
            <X size={16} />
          </button>
        </header>
        <div className="map-npc-sheet-body">
          <MapNpcSheetBody npc={npc} sheetFor={sheetFor} />
        </div>
      </div>
    </div>
  )
}

type MapNpcSheetProviderProps = {
  scope: CampaignScope
  /** The NPC sheet the viewer may open; absent where there is none, which leaves the map without the way to open one. */
  sheetFor: NpcSheetFor | undefined
  children: ReactNode
}

/**
 * Lets the map open an NPC's character sheet from its token, for a viewer
 * who may, and shows the open one over the map.
 */
export function MapNpcSheetProvider({ scope, sheetFor, children }: MapNpcSheetProviderProps) {
  const [npcId, setNpcId] = useState<string | null>(null)
  if (!sheetFor) return children
  return (
    <MapNpcSheetContext value={setNpcId}>
      {children}
      {npcId ? <MapNpcSheetOverlay key={npcId} scope={scope} npcId={npcId} sheetFor={sheetFor} onClose={() => setNpcId(null)} /> : null}
    </MapNpcSheetContext>
  )
}
