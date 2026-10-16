import type { SessionNote } from '../../types/app'
import { EditActions, EditButton, SectionEditToggle, type SectionEditProps } from './SessionNoteEditControls'
import { textareaRows } from './sessionNoteEditing'
import { getSessionDisplayTitle } from './sessionNoteUtils'

function renderParagraphs(text: string) {
  return text.split('\n').filter(Boolean).map((paragraph, i) => (
    <p key={i}>{paragraph}</p>
  ))
}

type SessionNoteTitleProps = SectionEditProps & {
  note: SessionNote
  draft: string
  onDraftChange: (draft: string) => void
}

export function SessionNoteTitle({ note, draft, onDraftChange, canEdit, editing, onBeginEdit, onSave, onCancel }: SessionNoteTitleProps) {
  if (editing) {
    return (
      <div className="session-inline-editor">
        <input
          className="session-inline-input session-note-title-input"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Optional custom session title"
          autoFocus
        />
        <EditActions onSave={onSave} onCancel={onCancel} />
      </div>
    )
  }

  return (
    <div className="session-heading-row">
      <h2 className="session-note-title">{getSessionDisplayTitle(note)}</h2>
      <EditButton canEdit={canEdit} label="Edit title" onClick={onBeginEdit} />
    </div>
  )
}

type SessionNoteSummaryProps = SectionEditProps & {
  text: string
  draft: string
  onDraftChange: (draft: string) => void
}

/** A summary section, shown only when there is summary text. */
export function SessionNoteSummary({ text, draft, onDraftChange, ...edit }: SessionNoteSummaryProps) {
  if (!text) return null

  return (
    <section className="monster-section-block">
      <div className="section-head">
        <h3 className="monster-section-title">Summary</h3>
        <SectionEditToggle {...edit} label="Edit summary" />
      </div>
      {edit.editing ? (
        <textarea
          className="session-inline-input session-inline-textarea"
          value={draft}
          rows={textareaRows(draft, 4)}
          onChange={(event) => onDraftChange(event.target.value)}
          autoFocus
        />
      ) : (
        <div className="session-note-summary">
          {renderParagraphs(text)}
        </div>
      )}
    </section>
  )
}

type SessionNoteCliffhangersProps = SectionEditProps & {
  cliffhangers: string[]
  drafts: string[]
  onDraftChange: (index: number, draft: string) => void
}

export function SessionNoteCliffhangers({ cliffhangers, drafts, onDraftChange, ...edit }: SessionNoteCliffhangersProps) {
  if (cliffhangers.length === 0) return null

  return (
    <section className="monster-section-block">
      <div className="section-head">
        <h3 className="monster-section-title">Cliffhangers</h3>
        <SectionEditToggle {...edit} label="Edit cliffhangers" />
      </div>
      {edit.editing ? (
        <ul className="session-cliffhangers">
          {drafts.map((cliffhanger, index) => (
            <li key={index}>
              <textarea
                className="session-inline-input session-inline-textarea"
                value={cliffhanger}
                rows={textareaRows(cliffhanger, 2)}
                onChange={(event) => onDraftChange(index, event.target.value)}
                autoFocus={index === 0}
              />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="session-cliffhangers">
          {cliffhangers.map((cliffhanger, i) => (
            <li key={i}>{cliffhanger}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
