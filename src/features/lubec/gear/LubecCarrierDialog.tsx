import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { makeId } from '../../character/characterFactories'
import { lubecAddCarrier, LUBEC_CARRIER_TYPES } from '../../ruleSets/lubec/gear/carriers'
import type { LubecCarrier, LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import {
  LUBEC_LAST_POCKET,
  LUBEC_POCKET_MAX_SIZES,
  lubecCarrierDraftOf,
  lubecCarrierFormOf,
  lubecNewPocketRow,
  lubecPocketNote,
  type LubecCarrierForm,
  type LubecPocketRow,
} from './carrierForm'

const TITLE = 'lubec-gear-carrier-title'

type RowProps = { row: LubecPocketRow; onRow: (row: LubecPocketRow) => void; onRemove: () => void }

// One pocket: its name, its slots and the largest thing it takes (B's `pocketRow`).
function PocketRow({ row, onRow, onRemove }: RowProps) {
  return (
    <div className="pocket-edit-row">
      <label className="field"><span className="label">Pocket</span><input type="text" value={row.name} autoComplete="off" onChange={(e) => onRow({ ...row, name: e.target.value })} /></label>
      <label className="field"><span className="label">Slots</span><input type="number" min={1} max={999} inputMode="numeric" value={row.slots} onChange={(e) => onRow({ ...row, slots: e.target.value })} /></label>
      <label className="field"><span className="label">Up to</span>
        <select value={row.max} onChange={(e) => onRow({ ...row, max: Number(e.target.value) })}>
          {LUBEC_POCKET_MAX_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <button type="button" className="x" aria-label="Remove this pocket" onClick={onRemove}>×</button>
    </div>
  )
}

type PocketsProps = { form: LubecCarrierForm; setForm: (form: LubecCarrierForm) => void; toast: (text: string) => void }

// The pockets, "+ Add a pocket", and the line that totals them. The last pocket stays.
function Pockets({ form, setForm, toast }: PocketsProps) {
  const setRows = (pockets: LubecPocketRow[]) => setForm({ ...form, pockets })
  const remove = (k: number) => (form.pockets.length === 1 ? toast(LUBEC_LAST_POCKET) : setRows(form.pockets.filter((_, n) => n !== k)))
  return (
    <fieldset className="field">
      <legend className="label">Pockets</legend>
      <div className="pocket-edit">
        {form.pockets.map((row, k) => (
          <PocketRow key={k} row={row} onRow={(next) => setRows(form.pockets.map((r, n) => (n === k ? next : r)))} onRemove={() => remove(k)} />
        ))}
      </div>
      <button className="btn line small" type="button" onClick={() => setRows([...form.pockets, lubecNewPocketRow()])}>+ Add a pocket</button>
      <p className="guess">{lubecPocketNote(form.pockets)}</p>
    </fieldset>
  )
}

export type LubecCarrierDialogProps = {
  gear: LubecGear
  /** Commits the gear with the new carrier. */
  onAdded: (gear: LubecGear, carrier: LubecCarrier) => void
  onClose: () => void
  toast: (text: string) => void
}

/** B's add-carrier dialog: a preset, its name, and its pockets. This one adds a personal carrier, kept on the character's own record. */
export function LubecCarrierDialog({ gear, onAdded, onClose, toast }: LubecCarrierDialogProps) {
  const [form, setForm] = useState(() => lubecCarrierFormOf(LUBEC_CARRIER_TYPES[0].id))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const r = lubecAddCarrier(gear, lubecCarrierDraftOf(form), makeId())
    if (r.ok) onAdded(r.gear, r.carrier)
    else setForm({ ...form, error: r.msg })
  }
  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  return (
    <div className="confirm-overlay lubec-gear-overlay" role="dialog" aria-modal="true" aria-labelledby={TITLE} onKeyDown={closeOnEscape}>
      <div className="carrier-sheet">
        <form className="sheet-form" noValidate onSubmit={submit}>
          <header>
            <div><div className="eyebrow">New carrier</div><h2 id={TITLE}>Add a carrier</h2></div>
            <button className="close" type="button" aria-label="Close" onClick={onClose}>×</button>
          </header>
          <label className="field"><span className="label">What is it?</span>
            <select value={form.type} onChange={(e) => setForm(lubecCarrierFormOf(e.target.value))}>
              {LUBEC_CARRIER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <label className="field"><span className="label">Name</span><input type="text" value={form.name} autoComplete="off" required onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <Pockets form={form} setForm={setForm} toast={toast} />
          {form.error ? <p className="form-error" role="alert">{form.error}</p> : null}
          <div className="actions"><button className="btn" type="submit">Add carrier</button></div>
        </form>
      </div>
    </div>
  )
}
