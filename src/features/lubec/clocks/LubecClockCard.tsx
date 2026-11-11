import { Pencil } from 'lucide-react'
import { lubecClockState, type LubecClock, type LubecClockState } from './lubecClock'
import { LubecClockPie } from './LubecClockPie'

export type LubecClockCardActions = {
  onToggle: (clock: LubecClock, index: number, filled: boolean) => void
  onEdit: (clock: LubecClock) => void
}

type Note = { key: string; label: string; text: string }

// The clock's notes, in the order the table reads them. A result the clock
// has reached is shown in its band instead, so it is not said twice.
function notesOf(clock: LubecClock, state: LubecClockState): Note[] {
  const notes: Note[] = [
    { key: 'increase', label: 'Fills when', text: clock.increase },
    { key: 'decrease', label: 'Empties when', text: clock.decrease },
    { key: 'whenFull', label: 'When full', text: state === 'full' ? '' : clock.whenFull },
    { key: 'whenEmpty', label: 'When empty', text: state === 'empty' ? '' : clock.whenEmpty },
  ]
  return notes.filter((note) => note.text)
}

function Notes({ notes }: { notes: Note[] }) {
  if (notes.length === 0) return null
  return (
    <dl className="clock-notes">
      {notes.map((note) => <div key={note.key} className={`clock-note ${note.key}`}><dt>{note.label}</dt><dd>{note.text}</dd></div>)}
    </dl>
  )
}

/** The band a full or empty clock carries: what happens now. */
function Result({ clock, state }: { clock: LubecClock; state: LubecClockState }) {
  if (state === 'running') return null
  const text = state === 'full' ? clock.whenFull : clock.whenEmpty
  return (
    <div className={`clock-result ${state}`}>
      <span className="clock-result-label">{state === 'full' ? 'Full' : 'Empty'}</span>
      {text ? <p>{text}</p> : null}
    </div>
  )
}

function Dial({ clock, actions }: { clock: LubecClock; actions: LubecClockCardActions }) {
  const count = clock.filled.length
  return (
    <div className="clock-dial">
      <LubecClockPie pieces={clock.pieces} filled={clock.filled} name={clock.name} onToggle={(index, filled) => actions.onToggle(clock, index, filled)} />
      <span className="clock-count" aria-label={`${count} of ${clock.pieces} filled`}><b>{count}</b> / {clock.pieces}</span>
    </div>
  )
}

/** One clock: its face and count, its name and notes, and its result once it is full or empty. */
export function LubecClockCard({ clock, actions }: { clock: LubecClock; actions: LubecClockCardActions }) {
  const state = lubecClockState(clock)
  return (
    <article className={`lubec-clock is-${state}`} aria-label={clock.name}>
      <Dial clock={clock} actions={actions} />
      <div className="clock-body">
        <header className="clock-head">
          <h3>{clock.name}</h3>
          <button type="button" className="clock-edit" aria-label={`Edit ${clock.name}`} onClick={() => actions.onEdit(clock)}>
            <Pencil size={14} aria-hidden="true" /><span>Edit</span>
          </button>
        </header>
        {clock.description ? <p className="clock-description">{clock.description}</p> : null}
        <Notes notes={notesOf(clock, state)} />
      </div>
      <Result clock={clock} state={state} />
    </article>
  )
}
