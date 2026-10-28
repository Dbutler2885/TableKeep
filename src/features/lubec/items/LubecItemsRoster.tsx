import type { LubecGmItem, LubecGmItemStatus } from '../../ruleSets/lubec/gear/gmItem'
import { LubecPicture } from '../gear/LubecGearArt'
import { lubecItemsGroups, lubecItemsRowLine, lubecItemsRowTags, type LubecItemsFilter, type LubecItemsGroup } from './gmItemsList'
import { DroppedBulkBar, DroppedRowCheck, DroppedSelectAll, type LubecDroppedPicks } from './LubecDroppedPicks'

type RosterProps = {
  /** The tab's items, or null while they load. */
  items: LubecGmItem[] | null
  filter: LubecItemsFilter
  onFilter: (filter: LubecItemsFilter) => void
  selectedId: string | null
  onSelect: (itemId: string) => void
  onAdd: () => void
  /** The dropped items' checkboxes; campaign items have none. */
  picks: LubecDroppedPicks
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

type RowProps = { item: LubecGmItem; active: boolean; onSelect: (itemId: string) => void }

// B's row: the picture or kind icon, the name with who dropped it or where it came from, and the tags.
function ItemRow({ item, active, onSelect }: RowProps) {
  return (
    <button type="button" className={`row-item${active ? ' active' : ''}`} aria-current={active || undefined} onClick={() => onSelect(item.id)}>
      <LubecPicture item={item} frame="thumb" />
      <span>{item.name}<small>{lubecItemsRowLine(item)}</small></span>
      <span className="tags">{lubecItemsRowTags(item).map((tag) => <span key={tag.text} className={`tag ${tag.tone}`}>{tag.text}</span>)}</span>
    </button>
  )
}

// A dropped item's row, with its checkbox beside it.
function PickedRow({ picks, ...row }: RowProps & { picks: LubecDroppedPicks }) {
  const picked = picks.selection.selectedIds.has(row.item.id)
  return (
    <div className={`row-pick${picked ? ' picked' : ''}`}>
      <DroppedRowCheck item={row.item} selection={picks.selection} />
      <ItemRow {...row} />
    </div>
  )
}

type GroupProps = { group: LubecItemsGroup; selectedId: string | null; onSelect: (itemId: string) => void; picks: LubecDroppedPicks | null }

function GroupHead({ group, picks }: Pick<GroupProps, 'group' | 'picks'>) {
  return (
    <div className="section-head">
      <h2>{group.title}</h2>
      <span className="head-actions">
        <span className="count">{group.list.length}</span>
        {picks && group.list.length ? <DroppedSelectAll title={group.title} selection={picks.selection} /> : null}
      </span>
    </div>
  )
}

function Group({ group, selectedId, onSelect, picks }: GroupProps) {
  const row = (item: LubecGmItem) => {
    const props = { item, active: item.id === selectedId, onSelect }
    return picks ? <PickedRow key={item.id} {...props} picks={picks} /> : <ItemRow key={item.id} {...props} />
  }
  return (
    <section className={`panel ${GROUP_TONE[group.status]}`} aria-label={group.title}>
      <GroupHead group={group} picks={picks} />
      {picks ? <DroppedBulkBar {...picks} /> : null}
      <div className="row-list">
        {group.list.length ? group.list.map(row) : <p className="note">{EMPTY[group.status]}</p>}
      </div>
    </section>
  )
}

/** The tab's list: the chips, and the campaign items and dropped items in B's rows; the list scrolls, the page does not. */
export function LubecItemsRoster({ items, filter, onFilter, selectedId, onSelect, onAdd, picks }: RosterProps) {
  return (
    <aside className="maps-sidebar monsters-sidebar lubec-items-roster">
      <div className="maps-sidebar-header">
        <h2>Items</h2>
        <button className="btn small" type="button" onClick={onAdd}>+ Add an item</button>
      </div>
      <FilterChips filter={filter} onFilter={onFilter} />
      {items === null
        ? <p className="note">Loading items...</p>
        : (
            <div className="items-lists">
              {lubecItemsGroups(items, filter).map((group) => (
                <Group key={group.status} group={group} selectedId={selectedId} onSelect={onSelect} picks={group.status === 'dropped' ? picks : null} />
              ))}
            </div>
          )}
    </aside>
  )
}
