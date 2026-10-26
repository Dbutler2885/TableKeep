import { useState } from 'react'
import { KIND_NAMES } from '../../ruleSets/lubec/gear/gearRules'
import type { LubecItemKind } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecSupplyName } from './gearLabels'
import { KIND_BLURB, stockLine } from './itemLabels'
import { LubecTilePicture } from './LubecGearArt'
import { LubecSheetHead } from './LubecSheetHead'
import { hasCampaignStock, KIND_IDS, lubecStockSections, STOCK_FROM_NAMES, type LubecStockEntry, type LubecStockFilter, type LubecStockFrom } from './stockEntries'

type PickerProps = {
  entries: readonly LubecStockEntry[]
  /** The search it opens with: the name typed so far. With none, it opens on the kind being made. */
  query: string
  kind: LubecItemKind
  supplyName: LubecSupplyName
  onPick: (entry: LubecStockEntry) => void
  onBack: () => void
  onClose: () => void
}

type RadioRowProps<T extends string> = { legend: string; name: string; value: T; options: readonly (readonly [T, string])[]; onPick: (value: T) => void; className: string }

function RadioRow<T extends string>({ legend, name, value, options, onPick, className }: RadioRowProps<T>) {
  return (
    <fieldset className="field">
      <legend className="label">{legend}</legend>
      <div className={className}>
        {options.map(([v, label]) => <label key={v}><input type="radio" name={name} value={v} checked={value === v} onChange={() => onPick(v)} /><span>{label}</span></label>)}
      </div>
    </fieldset>
  )
}

const KIND_OPTIONS: readonly (readonly [LubecItemKind | '', string])[] = [['', 'All'], ...KIND_IDS.map((k) => [k, KIND_NAMES[k]] as const)]
const FROM_OPTIONS: readonly (readonly [LubecStockFrom | '', string])[] = [['', 'All'], ['game', STOCK_FROM_NAMES.game], ['campaign', STOCK_FROM_NAMES.campaign]]

function Tile({ x, supplyName, onPick }: { x: LubecStockEntry; supplyName: LubecSupplyName; onPick: () => void }) {
  return (
    <button type="button" className="stock-tile" onClick={onPick}>
      <LubecTilePicture item={x} />
      <span className="k">{STOCK_FROM_NAMES[x.from]}</span>
      <span>{x.name}<br /><small>{stockLine(x, supplyName)}</small></span>
    </button>
  )
}

function Sections({ entries, filter, supplyName, onPick }: Pick<PickerProps, 'entries' | 'supplyName' | 'onPick'> & { filter: LubecStockFilter }) {
  const sections = lubecStockSections(entries, filter)
  if (!sections.length) return <p className="stock-empty">Nothing in stock matches. Go back and make it by hand.</p>
  return sections.map(({ kind, list }) => (
    <section key={kind} className="stock-sec">
      <div className="section-head"><h3>{KIND_NAMES[kind]}</h3><span className="count">{KIND_BLURB[kind]}</span></div>
      {list.length
        ? <div className="stock-grid">{list.map((x) => <Tile key={`${x.from}-${x.sid}`} x={x} supplyName={supplyName} onPick={() => onPick(x)} />)}</div>
        : <p className="stock-empty">Nothing here matches.</p>}
    </section>
  ))
}

// Rule T1: the game's stock, and this campaign's, the campaign items in the GM's Items tab. Picking copies (Rule T2).
const pickerNote = (campaign: boolean) =>
  `Lubec 1977 is the game's stock, made ahead of time.${campaign ? " This campaign is the campaign items in the GM's Items tab." : ''} Picking one copies its picture and numbers into the form; change anything after.`

/** Browsing stock: a search, a kind and a source, and the entries in tiles by kind (B's stock mode of the item sheet). */
export function LubecStockPicker({ entries, query, kind, supplyName, onPick, onBack, onClose }: PickerProps) {
  const [filter, setFilter] = useState<LubecStockFilter>({ query, kind: query ? '' : kind, from: '' })
  const set = (changes: Partial<LubecStockFilter>) => setFilter((now) => ({ ...now, ...changes }))
  const campaign = hasCampaignStock(entries)
  return (
    <div className="sheet-form stock-mode">
      <LubecSheetHead eyebrow="Stock items" title="Pick from stock" onClose={onClose} />
      <p className="note">{pickerNote(campaign)}</p>
      <div className="stock-tools">
        <label className="field"><span className="label">Search</span><input type="text" autoComplete="off" placeholder="bat, rounds, helmet" value={filter.query} onChange={(e) => set({ query: e.target.value })} /></label>
        <RadioRow legend="Kind" name="stock-kind" value={filter.kind} options={KIND_OPTIONS} onPick={(k) => set({ kind: k })} className="choices six stock-kinds" />
        {campaign ? <RadioRow legend="From" name="stock-from" value={filter.from} options={FROM_OPTIONS} onPick={(from) => set({ from })} className="choices stock-from" /> : null}
      </div>
      <div className="stack"><Sections entries={entries} filter={filter} supplyName={supplyName} onPick={onPick} /></div>
      <div className="sheet-foot"><button className="btn line wide" type="button" onClick={onBack}>Back to the form</button></div>
    </div>
  )
}
