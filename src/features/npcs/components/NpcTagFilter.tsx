import { useState } from 'react'
import { Search, Tag } from 'lucide-react'
import { matchingTags } from '../lib/npcList'

type NpcTagFilterProps = {
  tagFilter: string
  tagsInUse: string[]
  onChange: (tagFilter: string) => void
}

function TagFilterOption({ label, active, onChoose }: { label: string; active: boolean; onChoose: () => void }) {
  return (
    <button
      type="button"
      className={active ? 'npc-tag-filter-option active' : 'npc-tag-filter-option'}
      onClick={onChoose}
    >
      {label}
    </button>
  )
}

type NpcTagFilterMenuProps = NpcTagFilterProps & {
  search: string
  onSearch: (search: string) => void
}

// "All tags" is offered only while the search is blank.
function NpcTagFilterMenu({ tagFilter, tagsInUse, onChange, search, onSearch }: NpcTagFilterMenuProps) {
  const searching = search.trim() !== ''
  const matches = matchingTags(tagsInUse, search)
  return (
    <div className="npc-tag-filter-menu">
      <div className="npc-tag-filter-search">
        <Search size={14} />
        <input
          type="text"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search tags"
        />
      </div>
      <div className="npc-tag-filter-options">
        {searching ? null : <TagFilterOption label="All tags" active={tagFilter === 'all'} onChoose={() => onChange('all')} />}
        {matches.map((tag) => (
          <TagFilterOption key={tag} label={tag} active={tagFilter === tag} onChoose={() => onChange(tag)} />
        ))}
        {searching && matches.length === 0 ? (
          <div className="npc-tag-filter-empty">No matching tags</div>
        ) : null}
      </div>
    </div>
  )
}

// The roster's tag filter: a searchable menu of the tags on listed NPCs.
export function NpcTagFilter({ tagFilter, tagsInUse, onChange }: NpcTagFilterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const choose = (tag: string) => {
    onChange(tag)
    setOpen(false)
  }
  return (
    <div className="npc-tag-filter-wrapper">
      <Tag size={16} className="npc-tag-filter-icon" />
      <button
        type="button"
        className="npc-tag-filter-trigger"
        onClick={() => {
          setOpen((current) => !current)
          setSearch('')
        }}
      >
        {tagFilter === 'all' ? 'All tags' : tagFilter}
      </button>
      {open ? (
        <>
          <NpcTagFilterMenu tagFilter={tagFilter} tagsInUse={tagsInUse} onChange={choose} search={search} onSearch={setSearch} />
          <div
            className="npc-tag-filter-backdrop"
            onClick={() => setOpen(false)}
          />
        </>
      ) : null}
    </div>
  )
}
