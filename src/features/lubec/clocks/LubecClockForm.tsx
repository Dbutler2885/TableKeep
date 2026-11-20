import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import {
  cleanLubecClockFields, cleanLubecClockSharing, emptyLubecClockFields, hiddenLubecClockSharing, LUBEC_CLOCK_LIMITS, LUBEC_CLOCK_MAX_PIECES, lubecClockFieldsOf,
  lubecClockSharingOf, lubecFilledWithin, lubecPiecesLabel, type LubecClock, type LubecClockCharacter, type LubecClockFields, type LubecClockSharing,
} from './lubecClock'
import { LubecClockPie } from './LubecClockPie'
import { LubecClockSharingFields } from './LubecClockSharingFields'

const TITLE = 'lubec-clock-form-title'
const CANNOT_SAVE = 'Could not save that. Nothing changed.'
const CANNOT_DELETE = 'Could not delete that. Nothing changed.'

export type LubecClockFormProps = {
  /** The clock being edited, or null for a new one. */
  clock: LubecClock | null
  /** The players' characters the GM can show the clock to; null for a player, who cannot choose who sees a clock. */
  characters: readonly LubecClockCharacter[] | null
  /** Called with the checked fields, and who sees the clock when the GM is choosing. */
  onSubmit: (fields: LubecClockFields, sharing: LubecClockSharing | null) => Promise<void>
  onDelete: (clock: LubecClock) => Promise<void>
  onClose: () => void
}

type TextKey = Exclude<keyof LubecClockFields, 'pieces'>

type FieldProps = { id: string; label: string; hint?: string; placeholder?: string; fields: LubecClockFields; name: TextKey; rows?: number; onChange: (name: TextKey, value: string) => void; autoFocus?: boolean }

function TextField({ id, label, hint, placeholder, fields, name, rows, onChange, autoFocus }: FieldProps) {
  const common = { id, placeholder, value: fields[name], maxLength: LUBEC_CLOCK_LIMITS[name], onChange: (e: { target: { value: string } }) => onChange(name, e.target.value) }
  return (
    <label className="clock-field" htmlFor={id}>
      <span className="clock-label">{label}{hint ? <> <small>({hint})</small></> : null}</span>
      {rows ? <textarea rows={rows} {...common} /> : <input type="text" autoComplete="off" required autoFocus={autoFocus} {...common} />}
    </label>
  )
}

function PiecesPicker({ pieces, onPick }: { pieces: number; onPick: (pieces: number) => void }) {
  return (
    <fieldset className="clock-pieces">
      <legend className="clock-label">Pieces</legend>
      <div className="piece-stops">
        {Array.from({ length: LUBEC_CLOCK_MAX_PIECES }, (_, i) => i + 1).map((n) => (
          <label key={n} title={lubecPiecesLabel(n)}>
            <input type="radio" name="lubec-clock-pieces" value={n} checked={pieces === n} aria-label={lubecPiecesLabel(n)} onChange={() => onPick(n)} />
            <span aria-hidden="true">{n}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Delete asks once more in place, since the clock goes for the whole table. */
function DeleteButton({ clock, busy, onDelete }: { clock: LubecClock; busy: boolean; onDelete: () => void }) {
  const [asking, setAsking] = useState(false)
  if (!asking) return <button type="button" className="clock-btn line danger" disabled={busy} onClick={() => setAsking(true)}>Delete</button>
  return (
    <div className="clock-confirm" role="group" aria-label={`Delete ${clock.name}?`}>
      <span>Delete for everyone?</span>
      <button type="button" className="clock-btn danger" disabled={busy} onClick={onDelete}>Yes, delete</button>
      <button type="button" className="clock-btn line" disabled={busy} onClick={() => setAsking(false)}>Keep it</button>
    </div>
  )
}

function Frame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }
  return (
    <div className="confirm-overlay lubec-clock-overlay" role="dialog" aria-modal="true" aria-labelledby={TITLE} onKeyDown={closeOnEscape}>
      <div className="lubec-clock-sheet">
        <header className="clock-sheet-head">
          <div><div className="clock-eyebrow">Clocks</div><h2 id={TITLE}>{title}</h2></div>
          <button className="clock-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        </header>
        {children}
      </div>
    </div>
  )
}

/** Runs one write at a time; a failure stays on the form as its error. */
function useFormWrite() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (write: () => Promise<void>, failure: string) => {
    setBusy(true)
    setError(null)
    try {
      await write()
    } catch {
      setError(failure)
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

type Write = ReturnType<typeof useFormWrite>

/** The form's foot: Delete when editing, then Cancel and the save. */
function FormFoot({ clock, write, onDelete, onClose }: Pick<LubecClockFormProps, 'clock' | 'onDelete' | 'onClose'> & { write: Write }) {
  return (
    <div className="clock-form-foot">
      {clock ? <DeleteButton clock={clock} busy={write.busy} onDelete={() => void write.run(() => onDelete(clock), CANNOT_DELETE)} /> : null}
      <span className="clock-form-gap" />
      <button type="button" className="clock-btn line" onClick={onClose}>Cancel</button>
      <button type="submit" className="clock-btn" disabled={write.busy}>{clock ? 'Save' : 'Create clock'}</button>
    </div>
  )
}

/** The pie as the clock will look, with the filled pieces it keeps when its size changes. */
function Preview({ clock, pieces }: { clock: LubecClock | null; pieces: number }) {
  return (
    <div className="clock-preview" aria-hidden="true">
      <LubecClockPie pieces={pieces} filled={lubecFilledWithin(clock?.filled ?? [], pieces)} />
      <span className="clock-count">{lubecPiecesLabel(pieces)}</span>
    </div>
  )
}

// The fields and who sees the clock as they stand, checked before they are written.
type Checked = { ok: true; fields: LubecClockFields; sharing: LubecClockSharing | null } | { ok: false; error: string }

function checked(fields: LubecClockFields, sharing: LubecClockSharing, characters: LubecClockFormProps['characters']): Checked {
  const cleaned = cleanLubecClockFields(fields)
  if (!cleaned.ok) return cleaned
  if (!characters) return { ok: true, fields: cleaned.fields, sharing: null }
  const shared = cleanLubecClockSharing(sharing, characters)
  return shared.ok ? { ok: true, fields: cleaned.fields, sharing: shared.sharing } : shared
}

function useClockFields({ clock, characters, onSubmit }: Pick<LubecClockFormProps, 'clock' | 'characters' | 'onSubmit'>, write: Write) {
  const [fields, setFields] = useState<LubecClockFields>(() => (clock ? lubecClockFieldsOf(clock) : emptyLubecClockFields()))
  const [sharing, setSharing] = useState<LubecClockSharing>(() => (clock ? lubecClockSharingOf(clock) : hiddenLubecClockSharing()))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (write.busy) return
    const result = checked(fields, sharing, characters)
    if (!result.ok) return write.setError(result.error)
    void write.run(() => onSubmit(result.fields, result.sharing), CANNOT_SAVE)
  }
  const set = (patch: Partial<LubecClockFields>) => setFields((was) => ({ ...was, ...patch }))
  const share = (patch: Partial<LubecClockSharing>) => setSharing((was) => ({ ...was, ...patch }))
  return { fields, set, sharing, share, submit }
}

/** Who sees the clock: the GM's choice, or, for a player, a word on who will. */
function Sharing({ clock, characters, sharing, share }: { clock: LubecClock | null; characters: LubecClockFormProps['characters']; sharing: LubecClockSharing; share: (patch: Partial<LubecClockSharing>) => void }) {
  if (characters) return <LubecClockSharingFields sharing={sharing} characters={characters} onChange={share} />
  return clock ? null : <p className="clock-sharing-note">Everyone in the campaign sees the clocks you make.</p>
}

/** Making a clock and editing one: the same form, with Delete when editing. */
export function LubecClockForm({ clock, characters, onSubmit, onDelete, onClose }: LubecClockFormProps) {
  const write = useFormWrite()
  const { fields, set, sharing, share, submit } = useClockFields({ clock, characters, onSubmit }, write)
  const field = { fields, onChange: (name: TextKey, value: string) => set({ [name]: value }) }
  return (
    <Frame title={clock ? 'Edit clock' : 'Create a clock'} onClose={onClose}>
      <form className="clock-form" noValidate onSubmit={submit}>
        <div className="clock-form-top">
          <div className="clock-form-fields">
            <TextField id="lubec-clock-name" label="Name" name="name" autoFocus {...field} />
            <TextField id="lubec-clock-description" label="Description" hint="optional" name="description" rows={3} {...field} />
          </div>
          <Preview clock={clock} pieces={fields.pieces} />
        </div>
        <PiecesPicker pieces={fields.pieces} onPick={(pieces) => set({ pieces })} />
        <div className="clock-form-notes">
          <TextField id="lubec-clock-increase" label="Fills when" placeholder="What moves it on" name="increase" rows={2} {...field} />
          <TextField id="lubec-clock-decrease" label="Empties when" placeholder="What winds it back" name="decrease" rows={2} {...field} />
          <TextField id="lubec-clock-full" label="When full" placeholder="What happens then" name="whenFull" rows={2} {...field} />
          <TextField id="lubec-clock-empty" label="When empty" placeholder="What happens then" name="whenEmpty" rows={2} {...field} />
        </div>
        <Sharing clock={clock} characters={characters} sharing={sharing} share={share} />
        {write.error ? <p className="clock-form-error" role="alert">{write.error}</p> : null}
        <FormFoot clock={clock} write={write} onDelete={onDelete} onClose={onClose} />
      </form>
    </Frame>
  )
}
