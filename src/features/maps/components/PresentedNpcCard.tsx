import { sanitizeRichText } from '../../common/richText'
import type { NpcSummary } from '../lib/types'

function PresentedNpcNotes({ gmNotes }: { gmNotes: string }) {
  if (!gmNotes) return <p className="map-npc-presented-title">No GM notes.</p>
  return (
    <div
      className="map-npc-presented-notes npc-richtext-preview"
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(gmNotes) }}
    />
  )
}

// The NPC the GM is presenting to the players, with the GM's own notes on it.
export function PresentedNpcCard({ npc, gmNotes }: { npc: NpcSummary | null; gmNotes: string }) {
  if (!npc) return null
  return (
    <section className="map-npc-presented-panel map-npc-presented-panel-gm">
      <div className="map-npc-presented-card map-npc-presented-card-gm">
        <div className="map-npc-presented-portrait map-npc-presented-portrait-gm">
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
          <PresentedNpcNotes gmNotes={gmNotes} />
        </div>
      </div>
    </section>
  )
}
