// The Clocks tab of a Lubec campaign: the campaign's clocks, which the whole
// table sees live and anyone may make, edit, fill and empty. There is no GM
// gate; the table trusts itself.

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { db } from '../../../firebase'
import { LubecRoughFilter } from '../LubecRoughFilter'
import type { LubecClock, LubecClockFields } from './lubecClock'
import { LubecClockCard, type LubecClockCardActions } from './LubecClockCard'
import { LubecClockForm } from './LubecClockForm'
import { createLubecClock, deleteLubecClock, saveLubecClock, setLubecClockFill, stepLubecClock, type LubecClockRecords } from './lubecClockWrites'
import { useLubecClocks } from './useLubecClocks'
import './lubecClocks.css'

export type LubecClocksTabProps = {
  campaignId: string
  groupId: string
  setError: (message: string) => void
}

const CANNOT_SAVE = 'Could not save that. Nothing changed.'

// Which form is open: a new clock's, or the clock being edited's.
type OpenForm = { clock: LubecClock | null }

function EmptyClocks() {
  return (
    <div className="clocks-empty">
      <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" /></svg>
      <p>No clocks yet.</p>
      <p className="clocks-empty-hint">Press + to make one.</p>
    </div>
  )
}

function ClockList({ clocks, actions }: { clocks: LubecClock[] | null; actions: LubecClockCardActions }) {
  if (clocks === null) return <p className="clocks-loading" role="status">Loading clocks...</p>
  if (clocks.length === 0) return <EmptyClocks />
  return (
    <div className="clock-list">
      {clocks.map((clock) => <LubecClockCard key={clock.id} clock={clock} actions={actions} />)}
    </div>
  )
}

// A fill or a step that the rules refuse, say because someone else filled the last piece first, leaves the clock as it is and says so.
function useFillActions(records: LubecClockRecords, onEdit: (clock: LubecClock) => void) {
  const [error, setError] = useState<string | null>(null)
  const attempt = (write: Promise<void>) => {
    setError(null)
    write.catch(() => setError(CANNOT_SAVE))
  }
  const actions: LubecClockCardActions = {
    onFill: (clock, filled) => attempt(setLubecClockFill(records, clock, filled)),
    onStep: (clock, step) => attempt(stepLubecClock(records, clock, step)),
    onEdit,
  }
  return { error, actions }
}

// The clock as it is now, so an edit saved after someone filled it keeps their fill; the opened copy if it has gone.
const liveClock = (clocks: LubecClock[] | null, opened: LubecClock) => clocks?.find((clock) => clock.id === opened.id) ?? opened

// The open form and its writes; each closes the form once it goes through.
function useClockForm(records: LubecClockRecords, clocks: LubecClock[] | null) {
  const [form, setForm] = useState<OpenForm | null>(null)
  const close = () => setForm(null)
  const submit = async (fields: LubecClockFields) => {
    const opened = form?.clock
    if (opened) await saveLubecClock(records, liveClock(clocks, opened), fields)
    else await createLubecClock(records, fields)
    close()
  }
  const remove = async (clock: LubecClock) => {
    await deleteLubecClock(records, clock)
    close()
  }
  return { form, open: (clock: LubecClock | null) => setForm({ clock }), close, submit, remove }
}

type ClockForm = ReturnType<typeof useClockForm>

function FormOver({ clockForm }: { clockForm: ClockForm }) {
  const { form, submit, remove, close } = clockForm
  if (!form) return null
  return <LubecClockForm key={form.clock?.id ?? 'new'} clock={form.clock} onSubmit={submit} onDelete={remove} onClose={close} />
}

function ClocksHead({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="clocks-head">
      <h2 id="lubec-clocks-heading">Clocks</h2>
      <button type="button" className="clocks-add" aria-label="Create a clock" title="Create a clock" onClick={onAdd}>
        <Plus size={26} aria-hidden="true" />
      </button>
    </div>
  )
}

/** The Clocks tab: a + to make a clock, and every clock in the campaign. */
export function LubecClocksTab({ campaignId, groupId, setError }: LubecClocksTabProps) {
  const records: LubecClockRecords = { db, scope: { campaignId, groupId } }
  const clocks = useLubecClocks(records.scope, setError)
  const clockForm = useClockForm(records, clocks)
  const fills = useFillActions(records, clockForm.open)
  return (
    <div className="lubec-clocks">
      <LubecRoughFilter />
      <section className="clocks-section" aria-labelledby="lubec-clocks-heading">
        <ClocksHead onAdd={() => clockForm.open(null)} />
        {fills.error ? <p className="clocks-error" role="alert">{fills.error}</p> : null}
        <ClockList clocks={clocks} actions={fills.actions} />
      </section>
      <FormOver clockForm={clockForm} />
    </div>
  )
}
