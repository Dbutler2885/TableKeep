import { useState, type FormEvent, type KeyboardEvent } from 'react'
import type { LubecItemSize } from '../../ruleSets/lubec/gear/gearRecord'
import type { LubecItemDraft } from '../../ruleSets/lubec/gear/stacks'
import { countNote, SIZE_HINT } from './gearLabels'

/** Adds the draft at `dest`; returns why not, or null once it is added. */
export type LubecGearAddSubmit = (dest: string, draft: LubecItemDraft) => string | null

type AddFormProps = { dest: string; onSubmit: LubecGearAddSubmit; onClose: () => void }

const SIZES: readonly LubecItemSize[] = [0, 1, 2, 4, 8]

type Fields = { name: string; note: string; size: LubecItemSize; qty: string; per: string; dest: string }

const clampCount = (raw: string, least: number, empty: number) => Math.max(least, Math.min(999, Math.round(Number(raw) || empty)))

// The count as the form reads it: at most 999, and at least one to a slot (B's countNow).
const countOf = (fields: Fields) => ({ qty: clampCount(fields.qty, 0, 0), per: clampCount(fields.per, 1, 1) })

// Choosing Small sends a backpack thing to small stuff, and any other size brings it back to the main pocket (B's change handler).
function destForSize(dest: string, size: LubecItemSize): string {
  if (size === 0 && dest.startsWith('backpack#')) return 'backpack#small'
  return size !== 0 && dest === 'backpack#small' ? 'backpack#0' : dest
}

// A plain Thing: a name, a description, a size and a count. Normal weight; the rest of the form comes with the item card.
function draftOf(fields: Fields): LubecItemDraft {
  const { qty, per } = countOf(fields)
  return { kind: 'thing', name: fields.name.trim(), note: fields.note.trim(), size: fields.size, weight: 'normal', qty, ...(fields.size > 0 ? { per } : {}) }
}

function SizePick({ size, onSize }: { size: LubecItemSize; onSize: (size: LubecItemSize) => void }) {
  return (
    <fieldset className="field size-pick">
      <legend className="label">Size in slots, per item</legend>
      <div className="seg-row">
        {SIZES.map((value) => (
          <label key={value}>
            <input type="radio" name="size" value={value} checked={size === value} onChange={() => onSize(value)} />
            <span>{value === 0 ? 'Small' : value}</span>
          </label>
        ))}
      </div>
      <p className="field-note" aria-live="polite">{SIZE_HINT[size]}</p>
    </fieldset>
  )
}

function CountPick({ fields, onChange }: { fields: Fields; onChange: (changes: Partial<Fields>) => void }) {
  const { qty, per } = countOf(fields)
  const note = countNote(qty, per, fields.size)
  return (
    <div className="count-pick">
      <div className="count-row">
        <label className="field"><span className="label">How many in all</span><input type="number" min="0" max="999" inputMode="numeric" value={fields.qty} onChange={(e) => onChange({ qty: e.target.value })} /></label>
        {fields.size > 0 ? (
          <label className="field">
            <span className="label">{fields.size > 1 ? `Fit in ${fields.size} slots` : 'Fit in one slot'}</span>
            <input type="number" min="1" max="999" inputMode="numeric" value={fields.per} onChange={(e) => onChange({ per: e.target.value })} />
          </label>
        ) : null}
      </div>
      <p className={`field-note${note.warn ? ' warn' : ''}`} aria-live="polite">{note.text}</p>
    </div>
  )
}

const closeOnEscape = (onClose: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Escape') onClose()
}

/** B's add form, cut down to a plain Thing: name, description, size and count. It adds at the place it was opened from. */
export function LubecGearAddForm({ dest, onSubmit, onClose }: AddFormProps) {
  const [fields, setFields] = useState<Fields>({ name: '', note: '', size: dest.endsWith('#small') ? 0 : 1, qty: '1', per: '1', dest })
  const [error, setError] = useState<string | null>(null)
  const change = (changes: Partial<Fields>) => setFields((now) => ({ ...now, ...changes }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(onSubmit(fields.dest, draftOf(fields)))
  }
  return (
    <div className="confirm-overlay lubec-gear-overlay" role="dialog" aria-modal="true" aria-labelledby="lubec-gear-add-title" onKeyDown={closeOnEscape(onClose)}>
      <form className="item-sheet sheet-form" noValidate onSubmit={submit}>
        <header>
          <div><div className="eyebrow">New item</div><h2 id="lubec-gear-add-title">Add an item</h2></div>
          <button className="close" type="button" aria-label="Close" onClick={onClose}>×</button>
        </header>
        <label className="field"><span className="label">Name</span><input type="text" autoComplete="off" placeholder="Flashlight" value={fields.name} onChange={(e) => change({ name: e.target.value })} autoFocus /></label>
        <label className="field"><span className="label">Description</span><textarea rows={2} placeholder="What it looks like, where it came from" value={fields.note} onChange={(e) => change({ note: e.target.value })} /></label>
        <SizePick size={fields.size} onSize={(size) => change({ size, dest: destForSize(fields.dest, size) })} />
        <CountPick fields={fields} onChange={change} />
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="sheet-foot">
          <div className="actions">
            <button className="btn line" type="button" onClick={onClose}>Cancel</button>
            <button className="btn" type="submit">Add it</button>
          </div>
        </div>
      </form>
    </div>
  )
}
