import { Crosshair } from 'lucide-react'
import type { NpcSummary } from '../lib/types'
import { sanitizeRichText } from '../../common/richText'

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
      {presentedNpc ? (
        <section className="map-npc-presented-panel">
          <div className="map-npc-presented-card">
            <div className="map-npc-presented-portrait">
              {presentedNpc.portraitUrl ? (
                <img
                  src={presentedNpc.portraitUrl}
                  alt={`${presentedNpc.name} portrait`}
                  className="map-npc-presented-image"
                  style={{ objectPosition: `${presentedNpc.portraitFocusX}% ${presentedNpc.portraitFocusY}%` }}
                />
              ) : null}
            </div>
            <div className="map-npc-presented-copy">
              <h4>{presentedNpc.name}</h4>
              {presentedNpc.title ? <p className="map-npc-presented-title">{presentedNpc.title}</p> : null}
              {presentedNpc.playerDescription ? <p>{presentedNpc.playerDescription}</p> : null}
              {presentedNpc.playerNotes ? (
                <div
                  className="map-npc-presented-notes npc-richtext-preview"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(presentedNpc.playerNotes) }}
                />
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
