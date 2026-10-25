import { Check, Plus, Search, Tag, X } from 'lucide-react'
import type { NpcRecord } from '../../../types/app'
import type { NpcTagEditor } from '../hooks/useNpcTagEditor'
import { matchingTags } from '../lib/npcList'

function CurrentTagsSection({ selection, onRemove }: { selection: string[]; onRemove: (tag: string) => void }) {
  return (
    <section className="npc-tag-modal-section">
      <h4>Current Tags</h4>
      <div className="item-faction-tag-list">
        {selection.length > 0 ? selection.map((tag) => (
          <button key={tag} type="button" className="npc-tag-chip selected" onClick={() => onRemove(tag)}>
            <span>{tag}</span>
            <X size={12} />
          </button>
        )) : <p className="map-npc-scene-empty">No tags selected.</p>}
      </div>
    </section>
  )
}

type CreateTagSectionProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
}

function CreateTagSection({ value, onChange, onSubmit }: CreateTagSectionProps) {
  return (
    <section className="npc-tag-modal-section">
      <h4>Create Tag</h4>
      <div className="npc-tag-input-row">
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            onSubmit()
          }}
          placeholder="merchant"
        />
        <button
          type="button"
          className="monster-example-btn"
          onClick={() => onSubmit()}
          disabled={!value.trim()}
        >
          <Plus size={14} />
        </button>
      </div>
    </section>
  )
}

type AvailableTagsSectionProps = {
  allTags: string[]
  selection: string[]
  search: string
  onSearch: (search: string) => void
  onAdd: (tag: string) => void
}

// The campaign's tags not chosen yet; hidden while the campaign has none.
function AvailableTagsSection({ allTags, selection, search, onSearch, onAdd }: AvailableTagsSectionProps) {
  if (allTags.length === 0) return null
  const offered = matchingTags(allTags.filter((tag) => !selection.includes(tag)), search)
  return (
    <section className="npc-tag-modal-section">
      <h4>Available Tags</h4>
      <div className="npc-tag-search-row">
        <Search size={14} />
        <input
          type="text"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search tags"
        />
      </div>
      <div className="item-faction-tag-list">
        {offered.map((tag) => (
          <button key={tag} type="button" className="npc-tag-chip" onClick={() => onAdd(tag)}>
            <span>{tag}</span>
            <Plus size={12} />
          </button>
        ))}
      </div>
    </section>
  )
}

type NpcTagsModalProps = {
  editor: NpcTagEditor
  npc: NpcRecord | null
  allTags: string[]
}

// The tags dialog for the selected NPC. A click on the backdrop saves, as the
// tick does; Cancel and the X close without saving.
export function NpcTagsModal({ editor, npc, allTags }: NpcTagsModalProps) {
  if (!editor.open || !npc) return null
  const { draft } = editor
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={() => editor.save()}>
      <div className="confirm-modal npc-tag-modal" onClick={(event) => event.stopPropagation()}>
        <div className="npc-tag-modal-header">
          <div className="npc-tag-modal-title">
            <Tag size={18} />
            <h3>Manage Tags</h3>
          </div>
          <button type="button" className="map-edit-btn" onClick={() => editor.close()} aria-label="Close tags">
            <X size={16} />
          </button>
        </div>
        <p className="npc-tag-modal-subtitle">{npc.name || 'NPC'}</p>
        <CurrentTagsSection selection={draft.selection} onRemove={editor.removeTag} />
        <CreateTagSection value={draft.newTagInput} onChange={editor.setNewTagInput} onSubmit={editor.submitNewTag} />
        <AvailableTagsSection
          allTags={allTags}
          selection={draft.selection}
          search={draft.tagSearch}
          onSearch={editor.setTagSearch}
          onAdd={editor.addTag}
        />
        <div className="confirm-actions">
          <button type="button" onClick={() => editor.close()}>Cancel</button>
          <button type="button" onClick={() => editor.save()}>
            <Check size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
