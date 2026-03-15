import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { SessionNote } from '../../types/app'

type SessionNoteDetailProps = {
  note: SessionNote
}

export function SessionNoteDetail({ note }: SessionNoteDetailProps) {
  const [expandedScenes, setExpandedScenes] = useState<Set<number>>(new Set())

  const toggleScene = (index: number) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <div className="session-note-detail">
      <h2 className="session-note-title">{note.title || 'Untitled Session'}</h2>
      {note.sessionNumber != null ? (
        <p className="session-note-number">Session {note.sessionNumber}</p>
      ) : null}

      {note.overallSummary ? (
        <section className="monster-section-block">
          <div className="section-head">
            <h3 className="monster-section-title">Summary</h3>
          </div>
          <div className="session-note-summary">
            {note.overallSummary.split('\n').filter(Boolean).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </section>
      ) : null}

      {note.scenes.length > 0 ? (
        <section className="monster-section-block">
          <div className="section-head">
            <h3 className="monster-section-title">Scenes</h3>
          </div>
          <div className="session-scenes-list">
            {note.scenes.map((scene, index) => {
              const expanded = expandedScenes.has(index)
              return (
                <div key={index} className="session-scene-card">
                  <button
                    type="button"
                    className="session-scene-header"
                    onClick={() => toggleScene(index)}
                  >
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <strong>{scene.name || `Scene ${index + 1}`}</strong>
                  </button>
                  <p className="session-scene-summary">{scene.summary}</p>
                  {expanded && scene.details.length > 0 ? (
                    <ul className="session-scene-details">
                      {scene.details.map((detail, di) => (
                        <li key={di}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {note.cliffhangers.length > 0 ? (
        <section className="monster-section-block">
          <div className="section-head">
            <h3 className="monster-section-title">Cliffhangers</h3>
          </div>
          <ul className="session-cliffhangers">
            {note.cliffhangers.map((cliffhanger, i) => (
              <li key={i}>{cliffhanger}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {!note.overallSummary && note.summaryMarkdown ? (
        <section className="monster-section-block">
          <div className="section-head">
            <h3 className="monster-section-title">Summary</h3>
          </div>
          <div className="session-note-summary">
            {note.summaryMarkdown.split('\n').filter(Boolean).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
