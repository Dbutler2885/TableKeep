import { useState } from 'react'
import type { Role, SessionNote, SessionNoteGeneratedSnapshot } from '../../types/app'
import { getSessionCardSubtitle, sanitizeSessionTitle } from './sessionNoteUtils'
import {
  editingSceneIndex,
  fallbackSummaryMarkdown,
  isEditingSection,
  replaceAt,
  toggleIndex,
  withSceneDraft,
  type EditingSection,
  type SceneDraft,
  type SummaryKey,
} from './sessionNoteEditing'
import { SessionNoteCliffhangers, SessionNoteSummary, SessionNoteTitle } from './SessionNoteSections'
import { SessionNoteScenes } from './SessionNoteScenes'

type OnUpdate = (noteId: string, patch: Partial<SessionNote>) => void

type SessionNoteDetailProps = {
  note: SessionNote
  role: Role | null
  onUpdate: OnUpdate
}

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

/** A GM edit, carrying the generated note it replaces the first time one is made. */
function editedPatch(note: SessionNote, patch: Partial<SessionNote>): Partial<SessionNote> {
  return {
    ...patch,
    generatedSnapshot: note.generatedSnapshot ?? buildGeneratedSnapshot(note),
    hasHumanEdits: true,
    editedAt: new Date(),
    editedBy: 'gm',
  }
}

/** Which section is being edited, and the drafts of its text, for the one note it is mounted for. */
function useSessionNoteEditing(note: SessionNote, onUpdate: OnUpdate) {
  const [editingSection, setEditingSection] = useState<EditingSection | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [summaryDraft, setSummaryDraft] = useState('')
  const [sceneDraft, setSceneDraft] = useState<SceneDraft>({ summary: '', details: [] })
  const [cliffhangerDrafts, setCliffhangerDrafts] = useState<string[]>([])

  const cancel = () => {
    setEditingSection(null)
  }

  const commitPatch = (patch: Partial<SessionNote>) => {
    onUpdate(note.id, editedPatch(note, patch))
    setEditingSection(null)
  }

  return {
    editingSection,
    cancel,
    title: {
      draft: titleDraft,
      setDraft: setTitleDraft,
      begin: () => {
        setTitleDraft(note.title)
        setEditingSection({ key: 'title' })
      },
      save: () => commitPatch({ title: sanitizeSessionTitle(titleDraft, note.sessionNumber) }),
    },
    summary: {
      draft: summaryDraft,
      setDraft: setSummaryDraft,
      begin: (key: SummaryKey) => {
        setSummaryDraft(note[key])
        setEditingSection({ key })
      },
      save: (key: SummaryKey) => commitPatch({ [key]: summaryDraft }),
    },
    scene: {
      draft: sceneDraft,
      setSummary: (summary: string) => setSceneDraft((current) => ({ ...current, summary })),
      setDetail: (detailIndex: number, detail: string) => setSceneDraft((current) => ({
        ...current,
        details: replaceAt(current.details, detailIndex, detail),
      })),
      begin: (sceneIndex: number) => {
        const scene = note.scenes[sceneIndex]
        setSceneDraft({
          summary: scene.summary,
          details: [...scene.details],
        })
        setEditingSection({ key: 'scene', sceneIndex })
      },
      save: (sceneIndex: number) => commitPatch({ scenes: withSceneDraft(note.scenes, sceneIndex, sceneDraft) }),
    },
    cliffhangers: {
      drafts: cliffhangerDrafts,
      setDraft: (index: number, draft: string) => setCliffhangerDrafts((current) => replaceAt(current, index, draft)),
      begin: () => {
        setCliffhangerDrafts([...note.cliffhangers])
        setEditingSection({ key: 'cliffhangers' })
      },
      save: () => commitPatch({ cliffhangers: cliffhangerDrafts }),
    },
  }
}

/**
 * State that should outlive a change of note lives here; everything that belongs to one note lives in the body,
 * which is keyed by the note's id so that switching notes discards an unsaved edit with its draft.
 * Open scenes are kept by position, and only for as long as this component stays mounted.
 * The key also replaces the body's DOM on a switch, so focus inside the old note's body is not kept.
 */
export function SessionNoteDetail({ note, role, onUpdate }: SessionNoteDetailProps) {
  const [expandedScenes, setExpandedScenes] = useState<Set<number>>(new Set())

  const toggleScene = (index: number) => {
    setExpandedScenes((prev) => toggleIndex(prev, index))
  }

  return (
    <SessionNoteBody
      key={note.id}
      note={note}
      role={role}
      onUpdate={onUpdate}
      expandedScenes={expandedScenes}
      onToggleScene={toggleScene}
    />
  )
}

type SessionNoteBodyProps = SessionNoteDetailProps & {
  expandedScenes: Set<number>
  onToggleScene: (index: number) => void
}

function SessionNoteBody({ note, role, onUpdate, expandedScenes, onToggleScene }: SessionNoteBodyProps) {
  const editor = useSessionNoteEditing(note, onUpdate)
  const { editingSection, cancel } = editor

  const canEdit = role === 'gm'
  const subtitle = getSessionCardSubtitle(note)

  const summaryEditing = (key: SummaryKey) => ({
    canEdit,
    editing: isEditingSection(editingSection, key),
    draft: editor.summary.draft,
    onDraftChange: editor.summary.setDraft,
    onBeginEdit: () => editor.summary.begin(key),
    onSave: () => editor.summary.save(key),
    onCancel: cancel,
  })

  return (
    <div className="session-note-detail">
      <SessionNoteTitle
        note={note}
        draft={editor.title.draft}
        onDraftChange={editor.title.setDraft}
        canEdit={canEdit}
        editing={isEditingSection(editingSection, 'title')}
        onBeginEdit={editor.title.begin}
        onSave={editor.title.save}
        onCancel={cancel}
      />

      {subtitle ? (
        <p className="session-note-number">{subtitle}</p>
      ) : null}

      <SessionNoteSummary text={note.overallSummary} {...summaryEditing('overallSummary')} />

      <SessionNoteScenes
        scenes={note.scenes}
        expandedScenes={expandedScenes}
        onToggleScene={onToggleScene}
        editing={{
          canEdit,
          editingIndex: editingSceneIndex(editingSection),
          draft: editor.scene.draft,
          onSummaryChange: editor.scene.setSummary,
          onDetailChange: editor.scene.setDetail,
          onBeginEdit: editor.scene.begin,
          onSave: editor.scene.save,
          onCancel: cancel,
        }}
      />

      <SessionNoteCliffhangers
        cliffhangers={note.cliffhangers}
        drafts={editor.cliffhangers.drafts}
        onDraftChange={editor.cliffhangers.setDraft}
        canEdit={canEdit}
        editing={isEditingSection(editingSection, 'cliffhangers')}
        onBeginEdit={editor.cliffhangers.begin}
        onSave={editor.cliffhangers.save}
        onCancel={cancel}
      />

      <SessionNoteSummary text={fallbackSummaryMarkdown(note)} {...summaryEditing('summaryMarkdown')} />
    </div>
  )
}
