import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import { makeId } from '../../character/characterFactories'
import { lubecAddCarrier, LUBEC_CARRIER_TYPES, type LubecCarrierKind } from '../../ruleSets/lubec/gear/carriers'
import type { LubecCarrier, LubecGear } from '../../ruleSets/lubec/gear/gearRecord'
import {
  LUBEC_CARRIER_KIND_LABELS,
  LUBEC_CARRIER_KIND_NOTES,
  LUBEC_LAST_POCKET,
  LUBEC_POCKET_MAX_SIZES,
  lubecCarrierDraftOf,
  lubecCarrierFormAt,
  lubecCarrierFormOf,
  lubecNewPocketRow,
  lubecOfferedKind,
  lubecPocketNote,
  type LubecCarrierForm,
  type LubecPocketRow,
} from './carrierForm'
import type { LubecCarrierOwner, LubecSharedActs, LubecSharedSeat } from './lubecSharedSeat'
import { lubecSharedAddedToast } from './sharedCarrierLabels'

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

type FormProps = { form: LubecCarrierForm; setForm: (form: LubecCarrierForm) => void; toast: (text: string) => void }

// The pockets, "+ Add a pocket", and the line that totals them. The last pocket stays.
function Pockets({ form, setForm, toast }: FormProps) {
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

function NameField({ form, setForm }: Pick<FormProps, 'form' | 'setForm'>) {
  return <label className="field"><span className="label">Name</span><input type="text" value={form.name} autoComplete="off" required onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
}

function TypeField({ form, setForm }: Pick<FormProps, 'form' | 'setForm'>) {
  return (
    <label className="field"><span className="label">What is it?</span>
      <select value={form.type} onChange={(e) => setForm(lubecCarrierFormAt(form, e.target.value))}>
        {LUBEC_CARRIER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
    </label>
  )
}

type KindProps = { kinds: readonly LubecCarrierKind[]; kind: LubecCarrierKind; onKind: (kind: LubecCarrierKind) => void }

// B's choice tiles, as the kind choice, where the sheet offers more than one.
function KindChoice({ kinds, kind, onKind }: KindProps) {
  if (kinds.length < 2) return null
  return (
    <fieldset className="field">
      <legend className="label">Who gets into it</legend>
      <div className="choices">
        {kinds.map((k) => (
          <label key={k}>
            <input type="radio" name="carrier-kind" checked={kind === k} onChange={() => onKind(k)} />
            <span>{LUBEC_CARRIER_KIND_LABELS[k]}<small>{LUBEC_CARRIER_KIND_NOTES[k]}</small></span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

type OwnerProps = { owners: readonly LubecCarrierOwner[]; ownerId: string; onOwner: (id: string) => void }

function OwnerField({ owners, ownerId, onOwner }: OwnerProps) {
  return (
    <label className="field"><span className="label">Owner</span>
      <select value={ownerId} onChange={(e) => onOwner(e.target.value)}>
        {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </label>
  )
}

type FrameProps = {
  eyebrow: string
  title: string
  button: string
  /** True while the form's write is in flight. */
  busy: boolean
  error: string | null
  onSubmit: () => void
  onClose: () => void
  children: ReactNode
}

// B's carrier dialog around its fields.
function CarrierFrame({ eyebrow, title, button, busy, error, onSubmit, onClose, children }: FrameProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit()
  }
  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  return (
    <div className="confirm-overlay lubec-gear-overlay" role="dialog" aria-modal="true" aria-labelledby={TITLE} onKeyDown={closeOnEscape}>
      <div className="carrier-sheet">
        <form className="sheet-form" noValidate onSubmit={submit}>
          <header>
            <div><div className="eyebrow">{eyebrow}</div><h2 id={TITLE}>{title}</h2></div>
            <button className="close" type="button" aria-label="Close" onClick={onClose}>×</button>
          </header>
          {children}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="actions"><button className="btn" type="submit" disabled={busy}>{button}</button></div>
        </form>
      </div>
    </div>
  )
}

/** Runs a dialog's write once at a time; what it returns, or a failure, is the dialog's error. */
function useCarrierWrite() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const write = async (task: () => Promise<string | null>) => {
    if (busy) return
    setBusy(true)
    const msg = await task().catch(() => 'Could not save that. Nothing changed.')
    setBusy(false)
    setError(msg)
  }
  return { busy, error, setError, write }
}

export type LubecCarrierDialogProps = {
  gear: LubecGear
  /** The kinds of carrier this sheet offers. */
  kinds: readonly LubecCarrierKind[]
  /** Commits the new carrier: the gear with it on, or kept apart when it is hidden. */
  onAdded: (gear: LubecGear, carrier: LubecCarrier, kind: LubecCarrierKind) => void
  onClose: () => void
  toast: (text: string) => void
  /** The seat that can add a shared carrier; null where only a personal one can be added. */
  shared?: LubecSharedSeat | null
}

type SharedAdd = { acts: LubecSharedActs; ownerId: string; onClose: () => void; toast: (text: string) => void }

async function addShared({ acts, ownerId, onClose, toast }: SharedAdd, form: LubecCarrierForm): Promise<string | null> {
  const added = await acts.add(lubecCarrierDraftOf(form), ownerId)
  if (!added.ok) return added.msg
  onClose()
  toast(lubecSharedAddedToast(added.carrier))
  return null
}

// A shared carrier needs a character to own it, so a viewer with none to name adds only a personal one.
const sharedActsOf = (shared: LubecSharedSeat | null) => (shared?.owners.length ? shared.acts : null)

const canOffer = (kind: LubecCarrierKind, acts: LubecSharedActs | null) => kind !== 'shared' || acts !== null

const firstOwnerOf = (shared: LubecSharedSeat | null) => shared?.owners[0]?.id ?? ''

/** The add-carrier form, and the write its kind calls for: the sheet's own commit, or the shared carrier's document. */
function useAddCarrier({ gear, kinds, onAdded, onClose, toast, shared = null }: LubecCarrierDialogProps) {
  const [form, setForm] = useState(() => lubecCarrierFormOf(LUBEC_CARRIER_TYPES[0].id))
  const [ownerId, setOwnerId] = useState(() => firstOwnerOf(shared))
  const { busy, error, setError, write } = useCarrierWrite()
  const acts = sharedActsOf(shared)
  const offered = kinds.filter((k) => canOffer(k, acts))
  const kind = lubecOfferedKind(form, offered)
  const addPersonal = () => {
    const r = lubecAddCarrier(gear, lubecCarrierDraftOf(form), makeId())
    if (r.ok) onAdded(r.gear, r.carrier, kind)
    else setError(r.msg)
  }
  const onSubmit = () => {
    const sharing = kind === 'shared' ? acts : null
    if (sharing) void write(() => addShared({ acts: sharing, ownerId, onClose, toast }, form))
    else addPersonal()
  }
  const setKind = (next: LubecCarrierKind) => setForm({ ...form, kind: next })
  return { form, setForm, kind, setKind, ownerId, setOwnerId, busy, error, offered, onSubmit }
}

/** B's add-carrier dialog: the kind, a preset, its name, its pockets, and who owns a shared one. */
export function LubecCarrierDialog(props: LubecCarrierDialogProps) {
  const { onClose, toast, shared } = props
  const { form, setForm, kind, setKind, ownerId, setOwnerId, busy, error, offered, onSubmit } = useAddCarrier(props)
  return (
    <CarrierFrame eyebrow="New carrier" title="Add a carrier" button="Add carrier" busy={busy} error={error} onSubmit={onSubmit} onClose={onClose}>
      <KindChoice kinds={offered} kind={kind} onKind={setKind} />
      <div className="field-pair">
        <TypeField form={form} setForm={setForm} />
        <NameField form={form} setForm={setForm} />
      </div>
      <Pockets form={form} setForm={setForm} toast={toast} />
      {kind === 'shared' && shared ? <OwnerField owners={shared.owners} ownerId={ownerId} onOwner={setOwnerId} /> : null}
    </CarrierFrame>
  )
}

type ChangeProps = {
  /** The carrier as it stands, as the form. */
  start: LubecCarrierForm
  /** Saves the change; a refusal comes back as the dialog's error. */
  onSave: (form: LubecCarrierForm) => Promise<string | null>
  onClose: () => void
  toast: (text: string) => void
}

/** The same dialog for a carrier that exists: its name and pockets. */
export function LubecCarrierChangeDialog({ start, onSave, onClose, toast }: ChangeProps) {
  const [form, setForm] = useState(start)
  const { busy, error, write } = useCarrierWrite()
  return (
    <CarrierFrame eyebrow="Shared carrier" title={`Change ${start.name}`} button="Save" busy={busy} error={error} onSubmit={() => void write(() => onSave(form))} onClose={onClose}>
      <NameField form={form} setForm={setForm} />
      <Pockets form={form} setForm={setForm} toast={toast} />
    </CarrierFrame>
  )
}
