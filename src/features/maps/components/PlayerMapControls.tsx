import { Crosshair } from 'lucide-react'
import type { NpcSummary } from '../lib/types'
import { sanitizeRichText } from '../../common/richText'

// The NPC the GM is presenting, as the players see it.
function PresentedNpcPanel({ npc }: { npc: NpcSummary }) {
  return (
    <section className="map-npc-presented-panel">
      <div className="map-npc-presented-card">
        <div className="map-npc-presented-portrait">
          {npc.portraitUrl ? (
            <img
              src={npc.portraitUrl}
              alt={`${npc.name} portrait`}
              className="map-npc-presented-image"
              style={{ objectPosition: `${npc.portraitFocusX}% ${npc.portraitFocusY}%` }}
            />
          ) : null}
        </div>
        <div className="map-npc-presented-copy">
          <h4>{npc.name}</h4>
          {npc.title ? <p className="map-npc-presented-title">{npc.title}</p> : null}
          {npc.playerDescription ? <p>{npc.playerDescription}</p> : null}
          {npc.playerNotes ? (
            <div
              className="map-npc-presented-notes npc-richtext-preview"
              dangerouslySetInnerHTML={{ __html: sanitizeRichText(npc.playerNotes) }}
            />
          ) : null}
        </div>
      </div>
    </section>
  )
}

export function PlayerMapControls({
  cameraLock,
  onToggleCameraLock,
  presentedNpc,
  dark = false,
}: {
  cameraLock: boolean
  onToggleCameraLock: () => void
  presentedNpc?: NpcSummary | null
  dark?: boolean
}) {
  return (
    <div className={dark ? 'map-controls-body dark' : 'map-controls-body'}>
      <div className="map-icon-grid">
        <button
          type="button"
          className={cameraLock ? 'map-icon-btn fast-tooltip active' : 'map-icon-btn fast-tooltip'}
          onClick={onToggleCameraLock}
          data-tooltip="Camera lock"
          aria-label="Toggle camera lock"
        >
          <Crosshair size={16} />
        </button>
      </div>
      {presentedNpc ? <PresentedNpcPanel npc={presentedNpc} /> : null}
    </div>
  )
}
