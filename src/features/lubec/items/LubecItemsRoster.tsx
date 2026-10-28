import type { LubecGmItem, LubecGmItemStatus } from '../../ruleSets/lubec/gear/gmItem'
import { LubecPicture } from '../gear/LubecGearArt'
import { lubecItemsGroups, lubecItemsRowLine, lubecItemsRowTags, type LubecItemsFilter, type LubecItemsGroup } from './gmItemsList'

type RosterProps = {
  /** The tab's items, or null while they load. */
  items: LubecGmItem[] | null
  filter: LubecItemsFilter
  onFilter: (filter: LubecItemsFilter) => void
  selectedId: string | null
  onSelect: (itemId: string) => void
  onAdd: () => void
}

const FILTERS: readonly (readonly [LubecItemsFilter, string])[] = [['all', 'All'], ['library', 'Campaign items'], ['dropped', 'Dropped']]

const EMPTY: Readonly<Record<LubecGmItemStatus, string>> = {
  library: 'No campaign items yet. Add one, or keep one that was dropped.',
  dropped: 'Nothing dropped. What players drop lands here.',
}

// The groups' colored bars: the campaign's own items in blue, what was dropped in rust.
const GROUP_TONE: Readonly<Record<LubecGmItemStatus, string>> = { library: 'blue', dropped: 'rust' }

// B's chips: All, or one of the two lists; each list's bar says how many it holds.
function FilterChips({ filter, onFilter }: { filter: LubecItemsFilter; onFilter: (f: LubecItemsFilter) => void }) {
  return (
    <fieldset className="field items-filter">
      <legend className="label">Show</legend>
      <div className="choices">
        {FILTERS.map(([value, label]) => (
          <label key={value}>
            <input type="radio" name="lubec-items-filter" value={value} checked={filter === value} onChange={() => onFilter(value)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

// B's row: the picture or kind icon, the name with who dropped it or where it came from, and the tags.
function ItemRow({ item, active, onSelect }: { item: LubecGmItem; active: boolean; onSelect: (itemId: string) => void }) {
  return (
    <button type="button" className={`row-item${active ? ' active' : ''}`} aria-current={active || undefined} onClick={() => onSelect(item.id)}>
      <LubecPicture item={item} frame="thumb" />
      <span>{item.name}<small>{lubecItemsRowLine(item)}</small></span>
      <span className="tags">{lubecItemsRowTags(item).map((tag) => <span key={tag.text} className={`tag ${tag.tone}`}>{tag.text}</span>)}</span>
    </button>
  )
}

function Group({ group, selectedId, onSelect }: { group: LubecItemsGroup; selectedId: string | null; onSelect: (itemId: string) => void }) {
  return (
    <section className={`panel ${GROUP_TONE[group.status]}`} aria-label={group.title}>
      <div className="section-head"><h2>{group.title}</h2><span className="count">{group.list.length}</span></div>
      <div className="row-list">
        {group.list.length
          ? group.list.map((item) => <ItemRow key={item.id} item={item} active={item.id === selectedId} onSelect={onSelect} />)
          : <p className="note">{EMPTY[group.status]}</p>}
      </div>
    </section>
  )
}

/** The tab's list: the chips, and the campaign items and dropped items in B's rows; the list scrolls, the page does not. */
export function LubecItemsRoster({ items, filter, onFilter, selectedId, onSelect, onAdd }: RosterProps) {
  return (
    <aside className="maps-sidebar monsters-sidebar lubec-items-roster">
      <div className="maps-sidebar-header">
        <h2>Items</h2>
        <button className="btn small" type="button" onClick={onAdd}>+ Add an item</button>
      </div>
      <FilterChips filter={filter} onFilter={onFilter} />
      {items === null
        ? <p className="note">Loading items...</p>
        : <div className="items-lists">{lubecItemsGroups(items, filter).map((group) => <Group key={group.status} group={group} selectedId={selectedId} onSelect={onSelect} />)}</div>}
    </aside>
  )
}
