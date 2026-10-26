import { useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { lubecStockSuggestions } from '../../ruleSets/lubec/gear/stock'
import type { LubecSupplyName } from './gearLabels'
import { suggestLine } from './itemLabels'
import type { LubecItemFields } from './itemForm'
import { LubecPicture } from './LubecGearArt'
import { lubecSuggestKey, type LubecSuggest } from './suggestKeys'
import type { LubecStockEntry } from './stockEntries'

type NameProps = {
  fields: LubecItemFields
  onName: (name: string) => void
  /** Stock suggestions under the name; null while editing, which offers none. */
  stock: readonly LubecStockEntry[] | null
  supplyName: LubecSupplyName
  onPick: (entry: LubecStockEntry) => void
  onBrowse: (query: string) => void
}

function SuggestList({ list, at, top, supplyName, onPick }: { list: readonly LubecStockEntry[]; at: number; top: number; supplyName: LubecSupplyName; onPick: (k: number) => void }) {
  return (
    <ul className="suggest" id="lubec-stock-suggest" role="listbox" aria-label="Stock items" style={{ top }} onMouseDown={(e) => e.preventDefault()}>
      {list.map((x, k) => (
        <li key={x.sid} role="option" id={`lubec-sug-${k}`} aria-selected={k === at} onClick={() => onPick(k)}>
          <LubecPicture item={x} frame="thumb" />
          <span>{x.name}<small>{suggestLine(x, supplyName)}</small></span>
          {x.from === 'campaign' ? <span className="tag ghost">Campaign</span> : <span />}
        </li>
      ))}
      <li role="option" id={`lubec-sug-${list.length}`} className="all" aria-selected={at === list.length} onClick={() => onPick(list.length)}>Browse all stock</li>
    </ul>
  )
}

type SuggestMoves = { move: (at: number) => void; pick: (at: number) => void; close: () => void }

// A key while the suggestions are open; with none open, every key is the input's own.
function onSuggestKey(e: KeyboardEvent<HTMLInputElement>, s: LubecSuggest | null, last: number, moves: SuggestMoves) {
  const r = s && lubecSuggestKey(e.key, s.at, last)
  if (!r) return
  e.preventDefault()
  e.stopPropagation()
  if (r.act === 'close') moves.close()
  else moves[r.act](r.at)
}

const suggestionsFor = (s: LubecSuggest | null, stock: NameProps['stock'], fields: LubecItemFields) =>
  (s && stock ? lubecStockSuggestions(stock, fields.name, fields.kind) : [])

const activeRow = (s: LubecSuggest | null) => (s && s.at >= 0 ? `lubec-sug-${s.at}` : undefined)

/** The name, with stock suggestions under it as the player types, picked with the arrow keys or a tap (B's combobox). */
export function LubecNameField({ fields, onName, stock, supplyName, onPick, onBrowse }: NameProps) {
  const [suggest, setSuggest] = useState<LubecSuggest | null>(null)
  const list = suggestionsFor(suggest, stock, fields)
  const shown = list.length ? suggest : null
  const pick = (k: number) => {
    setSuggest(null)
    if (k < list.length) onPick(list[k])
    else onBrowse(fields.name)
  }
  const type = (e: ChangeEvent<HTMLInputElement>) => {
    onName(e.target.value)
    setSuggest({ at: -1, top: e.target.offsetTop + e.target.offsetHeight + 3 })
  }
  const moves = { move: (at: number) => setSuggest((now) => now && { ...now, at }), pick, close: () => setSuggest(null) }
  return (
    <>
      <label className="field"><span className="label">Name</span>
        <input type="text" autoComplete="off" placeholder="Flashlight, or type to search stock" role="combobox" aria-autocomplete="list" aria-expanded={shown !== null}
          aria-controls="lubec-stock-suggest" aria-activedescendant={activeRow(shown)}
          value={fields.name} onChange={type} onKeyDown={(e) => onSuggestKey(e, shown, list.length, moves)} onBlur={() => setSuggest(null)} />
      </label>
      {shown ? <SuggestList list={list} at={shown.at} top={shown.top} supplyName={supplyName} onPick={pick} /> : null}
    </>
  )
}
