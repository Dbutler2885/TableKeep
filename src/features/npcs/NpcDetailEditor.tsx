import { Tag } from 'lucide-react'
import type { NpcRecord, Role } from '../../types/app'
import { EntityMediaEditor } from '../common/EntityMediaEditor'
import { RichTextEditor } from '../common/RichTextEditor'

type NpcDetailEditorProps = {
  npc: NpcRecord
  role: Role | null
  gmNotes: string
  onChange: (updates: Partial<Omit<NpcRecord, 'id'>>) => void
  onChangePlayerNotes: (value: string) => void
  onChangeGmNotes: (value: string) => void
  onOpenTags: () => void
  onUploadPortraitImage: (file: File) => Promise<{
    portraitPath?: string
    portraitUrl?: string | null
  }>
  onUploadTokenImage: (file: File) => Promise<{
    customImagePath?: string
    customImageUrl?: string
    customImageName?: string
  }>
}

export function NpcDetailEditor({
  npc,
  role,
  gmNotes,
  onChange,
  onChangePlayerNotes,
  onChangeGmNotes,
  onOpenTags,
  onUploadPortraitImage,
  onUploadTokenImage,
}: NpcDetailEditorProps) {
  return (
    <div className="monster-editor-grid character-editor-grid">
      <section className="monster-section-block">
        <div className="character-sheet-header-grid">
          <label className="character-header-field character-header-field-name">
            <span className="character-header-tag">Name</span>
            <input
              type="text"
              value={npc.name}
              onChange={(event) => onChange({ name: event.target.value })}
              disabled={role !== 'gm'}
            />
          </label>
          <label className="character-header-field character-header-field-title">
            <span className="character-header-tag">Title</span>
            <input
              type="text"
              value={npc.title}
              onChange={(event) => onChange({ title: event.target.value })}
              disabled={role !== 'gm'}
            />
          </label>
          {role === 'gm' ? (
            <label className="character-header-field character-header-field-align">
              <span className="character-header-tag">Players</span>
              <select
                value={npc.visibleToPlayers ? 'shown' : 'hidden'}
                onChange={(event) => onChange({ visibleToPlayers: event.target.value === 'shown' })}
              >
                <option value="hidden">Hidden</option>
                <option value="shown">Shown</option>
              </select>
            </label>
          ) : null}
          {role === 'gm' ? (
            <div className="character-header-field character-header-field-title">
              <div className="npc-tag-summary-row">
                <button type="button" className="map-edit-btn" onClick={onOpenTags} aria-label="Manage tags">
                  <Tag size={16} />
                </button>
                {npc.tags.length > 0 ? (
                  <div className="item-faction-tag-list">
                    {npc.tags.map((tag) => (
                      <span key={tag} className="item-tag">{tag}</span>
                    ))}
                  </div>
                ) : (
                  <p className="map-npc-scene-empty">No tags yet.</p>
                )}
              </div>
            </div>
          ) : npc.tags.length > 0 ? (
            <div className="character-header-field character-header-field-title">
              <span className="character-header-tag">Tags</span>
              <div className="item-faction-tag-list">
                {npc.tags.map((tag) => (
                  <span key={tag} className="item-tag">{tag}</span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="monster-section-block">
        <h3 className="monster-section-title">Portrait</h3>
        <div className="character-media-wrap">
          <EntityMediaEditor
            entityName={npc.name || 'npc'}
            portraitUrl={npc.portraitUrl}
            portraitFocusX={npc.portraitFocusX}
            portraitFocusY={npc.portraitFocusY}
            tokenIcon={npc.tokenIcon}
            onChange={onChange}
            onUploadPortraitImage={onUploadPortraitImage}
            onUploadTokenImage={onUploadTokenImage}
            portraitAltLabel="NPC portrait"
            tokenButtonAriaLabel="Edit NPC token icon"
            removePortraitMessage="Remove the portrait image from this NPC?"
          />
        </div>
      </section>

      <section className="monster-section-block">
        <h3 className="monster-section-title">Player Description</h3>
        <textarea
          className="monster-notes"
          value={npc.playerDescription}
          onChange={(event) => onChange({ playerDescription: event.target.value })}
          placeholder="Short player-facing description"
          disabled={role !== 'gm'}
        />
      </section>

      <section className="monster-section-block">
        <h3 className="monster-section-title">Player Notes</h3>
        <RichTextEditor
          value={npc.playerNotes}
          onChange={onChangePlayerNotes}
          placeholder="Player-facing notes"
          editable={role === 'gm' || role === 'player'}
        />
      </section>

      {role === 'gm' ? (
        <section className="monster-section-block">
          <h3 className="monster-section-title">GM Notes</h3>
          <RichTextEditor
            value={gmNotes}
            onChange={onChangeGmNotes}
            placeholder="Private GM notes"
            editable
          />
        </section>
      ) : null}
    </div>
  )
}
