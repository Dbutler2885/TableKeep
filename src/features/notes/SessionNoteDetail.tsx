import { useEffect, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Pencil, X } from 'lucide-react'
import type { Role, SessionNote, SessionNoteGeneratedSnapshot } from '../../types/app'

type SessionNoteDetailProps = {
  note: SessionNote
  role: Role | null
  onUpdate: (noteId: string, patch: Partial<SessionNote>) => void
}

type EditingSection =
  | { key: 'title' }
  | { key: 'overallSummary' }
  | { key: 'summaryMarkdown' }
  | { key: 'scene'; sceneIndex: number }
  | { key: 'cliffhangers' }

function buildGeneratedSnapshot(note: SessionNote): SessionNoteGeneratedSnapshot {
  return {
    title: note.title,
    summaryMarkdown: note.summaryMarkdown,
    overallSummary: note.overallSummary,
    scenes: note.scenes.map((scene) => ({
      name: scene.name,
      summary: scene.summary,
      details: [...scene.details],
    })),
    npcMentions: note.npcMentions.map((npc) => ({
      npcKey: npc.npcKey,
      name: npc.name,
      title: npc.title,
      action: npc.action,
      facts: [...npc.facts],
      linkedNpcId: npc.linkedNpcId,
    })),
    cliffhangers: [...note.cliffhangers],
    calendar: note.calendar.map((entry) => ({
      key: entry.key,
      action: entry.action,
      label: entry.label,
      dayComplete: entry.dayComplete,
      entries: [...entry.entries],
    })),
  }
}

function renderParagraphs(text: string) {
  return text.split('\n').filter(Boolean).map((paragraph, i) => (
    <p key={i}>{paragraph}</p>
  ))
}

export function SessionNoteDetail({ note, role, onUpdate }: SessionNoteDetailProps) {
  const [expandedScenes, setExpandedScenes] = useState<Set<number>>(new Set())
  const [editingSection, setEditingSection] = useState<EditingSection | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [summaryDraft, setSummaryDraft] = useState('')
  const [sceneDraft, setSceneDraft] = useState<{ summary: string; details: string[] }>({ summary: '', details: [] })
  const [cliffhangerDrafts, setCliffhangerDrafts] = useState<string[]>([])

  const canEdit = role === 'gm'

  useEffect(() => {
    setEditingSection(null)
    setTitleDraft('')
    setSummaryDraft('')
    setSceneDraft({ summary: '', details: [] })
    setCliffhangerDrafts([])
  }, [note.id])

  const toggleScene = (index: number) => {
    setExpandedScenes((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const cancelEditing = () => {
    setEditingSection(null)
  }

  const commitPatch = (patch: Partial<SessionNote>) => {
    onUpdate(note.id, {
      ...patch,
      generatedSnapshot: note.generatedSnapshot ?? buildGeneratedSnapshot(note),
      hasHumanEdits: true,
      editedAt: new Date(),
      editedBy: 'gm',
    })
    setEditingSection(null)
  }

  const renderActionButtons = (onSave: () => void) => (
    <div className="session-inline-editor-actions">
      <button type="button" className="modal-icon-btn" onClick={cancelEditing} aria-label="Cancel edit">
        <X size={16} />
      </button>
      <button type="button" className="modal-icon-btn confirm" onClick={onSave} aria-label="Save edit">
        <Check size={16} />
      </button>
    </div>
  )

  const renderEditButton = (onClick: () => void, label: string) => (
    canEdit ? (
      <button type="button" className="session-text-edit-btn" onClick={onClick} aria-label={label} title={label}>
        <Pencil size={18} strokeWidth={2.2} />
      </button>
    ) : null
  )

  return (
    <div className="session-note-detail">
      {editingSection?.key === 'title' ? (
        <div className="session-inline-editor">
          <input
            className="session-inline-input session-note-title-input"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            autoFocus
          />
          {renderActionButtons(() => commitPatch({ title: titleDraft }))}
        </div>
      ) : (
        <div className="session-heading-row">
          <h2 className="session-note-title">{note.title || 'Untitled Session'}</h2>
          {renderEditButton(() => {
            setTitleDraft(note.title)
            setEditingSection({ key: 'title' })
          }, 'Edit title')}
        </div>
      )}

      {note.sessionNumber != null ? (
        <p className="session-note-number">Session {note.sessionNumber}</p>
      ) : null}

      {note.overallSummary ? (
        <section className="monster-section-block">
          <div className="section-head">
            <h3 className="monster-section-title">Summary</h3>
            {editingSection?.key === 'overallSummary'
              ? renderActionButtons(() => commitPatch({ overallSummary: summaryDraft }))
              : renderEditButton(() => {
                  setSummaryDraft(note.overallSummary)
                  setEditingSection({ key: 'overallSummary' })
                }, 'Edit summary')}
          </div>
          {editingSection?.key === 'overallSummary' ? (
            <textarea
              className="session-inline-input session-inline-textarea"
              value={summaryDraft}
              rows={Math.max(4, summaryDraft.split('\n').length)}
              onChange={(event) => setSummaryDraft(event.target.value)}
              autoFocus
            />
          ) : (
            <div className="session-note-summary">
              {renderParagraphs(note.overallSummary)}
            </div>
          )}
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
              const editing = editingSection?.key === 'scene' && editingSection.sceneIndex === index

              return (
                <div key={index} className="session-scene-card">
                  <div className="session-scene-header-row">
                    <button
                      type="button"
                      className="session-scene-header"
                      onClick={() => toggleScene(index)}
                    >
                      {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <strong>{scene.name || `Scene ${index + 1}`}</strong>
                    </button>
                    {editing
                      ? renderActionButtons(() => {
                          const scenes = note.scenes.map((entry, sceneIndex) => (
                            sceneIndex === index
                              ? {
                                  ...entry,
                                  summary: sceneDraft.summary,
                                  details: sceneDraft.details,
                                }
                              : entry
                          ))
                          commitPatch({ scenes })
                        })
                      : renderEditButton(() => {
                          setSceneDraft({
                            summary: scene.summary,
                            details: [...scene.details],
                          })
                          setEditingSection({ key: 'scene', sceneIndex: index })
                        }, `Edit ${scene.name || `scene ${index + 1}`}`)}
                  </div>

                  {editing ? (
                    <div className="session-inline-editor">
                      <textarea
                        className="session-inline-input session-inline-textarea"
                        value={sceneDraft.summary}
                        rows={Math.max(3, sceneDraft.summary.split('\n').length)}
                        onChange={(event) => setSceneDraft((current) => ({ ...current, summary: event.target.value }))}
                        autoFocus
                      />
                      {expanded && sceneDraft.details.length > 0 ? (
                        <ul className="session-scene-details">
                          {sceneDraft.details.map((detail, detailIndex) => (
                            <li key={detailIndex}>
                              <textarea
                                className="session-inline-input session-inline-textarea"
                                value={detail}
                                rows={Math.max(2, detail.split('\n').length)}
                                onChange={(event) => setSceneDraft((current) => ({
                                  ...current,
                                  details: current.details.map((item, itemIndex) => (
                                    itemIndex === detailIndex ? event.target.value : item
                                  )),
                                }))}
                              />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <p className="session-scene-summary">{scene.summary}</p>
                      {expanded && scene.details.length > 0 ? (
                        <ul className="session-scene-details">
                          {scene.details.map((detail, di) => (
                            <li key={di}>{detail}</li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
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
            {editingSection?.key === 'cliffhangers'
              ? renderActionButtons(() => commitPatch({ cliffhangers: cliffhangerDrafts }))
              : renderEditButton(() => {
                  setCliffhangerDrafts([...note.cliffhangers])
                  setEditingSection({ key: 'cliffhangers' })
                }, 'Edit cliffhangers')}
          </div>
          {editingSection?.key === 'cliffhangers' ? (
            <ul className="session-cliffhangers">
              {cliffhangerDrafts.map((cliffhanger, index) => (
                <li key={index}>
                  <textarea
                    className="session-inline-input session-inline-textarea"
                    value={cliffhanger}
                    rows={Math.max(2, cliffhanger.split('\n').length)}
                    onChange={(event) => setCliffhangerDrafts((current) => (
                      current.map((entry, cliffhangerIndex) => (
                        cliffhangerIndex === index ? event.target.value : entry
                      ))
                    ))}
                    autoFocus={index === 0}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="session-cliffhangers">
              {note.cliffhangers.map((cliffhanger, i) => (
                <li key={i}>{cliffhanger}</li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {!note.overallSummary && note.summaryMarkdown ? (
        <section className="monster-section-block">
          <div className="section-head">
            <h3 className="monster-section-title">Summary</h3>
            {editingSection?.key === 'summaryMarkdown'
              ? renderActionButtons(() => commitPatch({ summaryMarkdown: summaryDraft }))
              : renderEditButton(() => {
                  setSummaryDraft(note.summaryMarkdown)
                  setEditingSection({ key: 'summaryMarkdown' })
                }, 'Edit summary')}
          </div>
          {editingSection?.key === 'summaryMarkdown' ? (
            <textarea
              className="session-inline-input session-inline-textarea"
              value={summaryDraft}
              rows={Math.max(4, summaryDraft.split('\n').length)}
              onChange={(event) => setSummaryDraft(event.target.value)}
              autoFocus
            />
          ) : (
            <div className="session-note-summary">
              {renderParagraphs(note.summaryMarkdown)}
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}
