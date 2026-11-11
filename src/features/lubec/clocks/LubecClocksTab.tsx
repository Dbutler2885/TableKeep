// The Clocks tab of a Lubec campaign: the campaign's clocks, live. The GM
// sees every clock and chooses who else sees each one, as with handouts. A
// player sees the clocks shown to them and may fill, empty, edit and delete
// those without asking anyone; a clock a player makes is the whole table's.

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { db } from '../../../firebase'
import { LubecRoughFilter } from '../LubecRoughFilter'
import type { Role } from '../../../types/app'
import { lubecClockAudience, sharedLubecClockSharing, type LubecClock, type LubecClockCharacter, type LubecClockFields, type LubecClockSharing } from './lubecClock'
import { LubecClockCard, type LubecClockCardActions } from './LubecClockCard'
import { LubecClockForm } from './LubecClockForm'
import { createLubecClock, deleteLubecClock, saveLubecClock, setLubecClockPiece, type LubecClockRecords } from './lubecClockWrites'
import { useLubecClockCharacters, useLubecClocks } from './useLubecClocks'
import './lubecClocks.css'

export type LubecClocksTabProps = {
  campaignId: string
  groupId: string
  role: Role | null
  userId: string
  gmUserId: string
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

type ClockListProps = { clocks: LubecClock[] | null; actions: LubecClockCardActions; audienceOf: (clock: LubecClock) => string | null }

function ClockList({ clocks, actions, audienceOf }: ClockListProps) {
  if (clocks === null) return <p className="clocks-loading" role="status">Loading clocks...</p>
  if (clocks.length === 0) return <EmptyClocks />
  return (
    <div className="clock-list">
      {clocks.map((clock) => <LubecClockCard key={clock.id} clock={clock} actions={actions} audience={audienceOf(clock)} />)}
    </div>
  )
}

// A piece the rules refuse to fill or empty, say because someone cut the clock smaller meanwhile, stays as it was, and the tab says so.
function useFillActions(records: LubecClockRecords, onEdit: (clock: LubecClock) => void) {
  const [error, setError] = useState<string | null>(null)
  const attempt = (write: Promise<void>) => {
    setError(null)
    write.catch(() => setError(CANNOT_SAVE))
  }
  const actions: LubecClockCardActions = {
    onToggle: (clock, index, filled) => attempt(setLubecClockPiece(records, clock, index, filled)),
    onEdit,
  }
  return { error, actions }
}

// The clock as it is now, so an edit saved after someone filled a piece keeps it; the opened copy if it has gone.
const liveClock = (clocks: LubecClock[] | null, opened: LubecClock) => clocks?.find((clock) => clock.id === opened.id) ?? opened

// The open form and its writes; each closes the form once it goes through.
function useClockForm(records: LubecClockRecords, clocks: LubecClock[] | null) {
  const [form, setForm] = useState<OpenForm | null>(null)
  const close = () => setForm(null)
  // A player passes no sharing: an edit leaves who sees the clock alone, and a new clock is the whole table's.
  const submit = async (fields: LubecClockFields, sharing: LubecClockSharing | null) => {
    const opened = form?.clock
    if (opened) await saveLubecClock(records, liveClock(clocks, opened), fields, sharing)
    else await createLubecClock(records, fields, sharing ?? sharedLubecClockSharing())
    close()
  }
  const remove = async (clock: LubecClock) => {
    await deleteLubecClock(records, clock)
    close()
  }
  return { form, open: (clock: LubecClock | null) => setForm({ clock }), close, submit, remove }
}

type ClockForm = ReturnType<typeof useClockForm>

function FormOver({ clockForm, characters }: { clockForm: ClockForm; characters: LubecClockCharacter[] | null }) {
  const { form, submit, remove, close } = clockForm
  if (!form) return null
  return <LubecClockForm key={form.clock?.id ?? 'new'} clock={form.clock} characters={characters} onSubmit={submit} onDelete={remove} onClose={close} />
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

// The GM's view of who sees each clock and whom it can be shown to; a player has neither.
function useSharing({ campaignId, groupId, gmUserId }: LubecClocksTabProps, isGm: boolean) {
  const characters = useLubecClockCharacters({ campaignId, groupId }, isGm, gmUserId)
  return {
    characters: isGm ? characters : null,
    audienceOf: (clock: LubecClock) => (isGm ? lubecClockAudience(clock, characters) : null),
  }
}

/** The Clocks tab: a + to make a clock, and every clock this viewer may see. */
export function LubecClocksTab(props: LubecClocksTabProps) {
  const { campaignId, groupId, role, userId, setError } = props
  const isGm = role === 'gm'
  const records: LubecClockRecords = { db, scope: { campaignId, groupId } }
  const clocks = useLubecClocks(records.scope, { isGm, userId }, setError)
  const sharing = useSharing(props, isGm)
  const clockForm = useClockForm(records, clocks)
  const fills = useFillActions(records, clockForm.open)
  return (
    <div className="lubec-clocks">
      <LubecRoughFilter />
      <section className="clocks-section" aria-labelledby="lubec-clocks-heading">
        <ClocksHead onAdd={() => clockForm.open(null)} />
        {fills.error ? <p className="clocks-error" role="alert">{fills.error}</p> : null}
        <ClockList clocks={clocks} actions={fills.actions} audienceOf={sharing.audienceOf} />
      </section>
      <FormOver clockForm={clockForm} characters={sharing.characters} />
    </div>
  )
}
