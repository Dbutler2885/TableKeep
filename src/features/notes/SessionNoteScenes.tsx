import { ChevronDown, ChevronRight } from 'lucide-react'
import type { SessionScene } from '../../types/app'
import { SectionEditToggle } from './SessionNoteEditControls'
import { textareaRows, type SceneDraft } from './sessionNoteEditing'

export type SceneEditing = {
  canEdit: boolean
  editingIndex: number | null
  draft: SceneDraft
  onSummaryChange: (summary: string) => void
  onDetailChange: (detailIndex: number, detail: string) => void
  onBeginEdit: (sceneIndex: number) => void
  onSave: (sceneIndex: number) => void
  onCancel: () => void
}

type SessionNoteScenesProps = {
  scenes: SessionScene[]
  expandedScenes: Set<number>
  onToggleScene: (sceneIndex: number) => void
  editing: SceneEditing
}

export function SessionNoteScenes({ scenes, expandedScenes, onToggleScene, editing }: SessionNoteScenesProps) {
  if (scenes.length === 0) return null

  return (
    <section className="monster-section-block">
      <div className="section-head">
        <h3 className="monster-section-title">Scenes</h3>
      </div>
      <div className="session-scenes-list">
        {scenes.map((scene, index) => (
          <SceneCard
            key={index}
            scene={scene}
            index={index}
            expanded={expandedScenes.has(index)}
            onToggle={() => onToggleScene(index)}
            editing={editing}
          />
        ))}
      </div>
    </section>
  )
}

type SceneCardProps = {
  scene: SessionScene
  index: number
  expanded: boolean
  onToggle: () => void
  editing: SceneEditing
}

function SceneCard({ scene, index, expanded, onToggle, editing }: SceneCardProps) {
  const isEditing = editing.editingIndex === index

  return (
    <div className="session-scene-card">
      <div className="session-scene-header-row">
        <button
          type="button"
          className="session-scene-header"
          onClick={onToggle}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <strong>{scene.name || `Scene ${index + 1}`}</strong>
        </button>
        <SectionEditToggle
          canEdit={editing.canEdit}
          editing={isEditing}
          label={`Edit ${scene.name || `scene ${index + 1}`}`}
          onBeginEdit={() => editing.onBeginEdit(index)}
          onSave={() => editing.onSave(index)}
          onCancel={editing.onCancel}
        />
      </div>

      {isEditing
        ? <SceneEditor editing={editing} expanded={expanded} />
        : <SceneText scene={scene} expanded={expanded} />}
    </div>
  )
}

function SceneEditor({ editing, expanded }: { editing: SceneEditing; expanded: boolean }) {
  const { draft } = editing

  return (
    <div className="session-inline-editor">
      <textarea
        className="session-inline-input session-inline-textarea"
        value={draft.summary}
        rows={textareaRows(draft.summary, 3)}
        onChange={(event) => editing.onSummaryChange(event.target.value)}
        autoFocus
      />
      {expanded && draft.details.length > 0 ? (
        <ul className="session-scene-details">
          {draft.details.map((detail, detailIndex) => (
            <li key={detailIndex}>
              <textarea
                className="session-inline-input session-inline-textarea"
                value={detail}
                rows={textareaRows(detail, 2)}
                onChange={(event) => editing.onDetailChange(detailIndex, event.target.value)}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function SceneText({ scene, expanded }: { scene: SessionScene; expanded: boolean }) {
  return (
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
  )
}
