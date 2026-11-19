import { useState } from 'react'
import { LUBEC_DEATH_TABLE, type LubecDeathReminder } from '../ruleSets/lubec/deathReminders'

// The GM's private Death Save prompt: every reminder not yet handled, with its
// reasons, and the adapted Death table for reference. It sits beside the page
// rather than over it, so a fight goes on while it is open. Marking a
// reminder handled rolls nothing and applies nothing; the GM resolves the
// Death Save privately, away from the app.

export type LubecDeathEntry = { key: string; who: string | null; reminder: LubecDeathReminder; onHandled: () => Promise<unknown> }

function ReminderRow({ entry }: { entry: LubecDeathEntry }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const handle = async () => {
    setBusy(true)
    setError(null)
    try { await entry.onHandled() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not mark it handled. Try again.') } finally { setBusy(false) }
  }
  return (
    <li className="lubec-death-reminder">
      {entry.who ? <strong>{entry.who}</strong> : null}
      <ul>{entry.reminder.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      <small>{entry.reminder.event}</small>
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void handle()}>{busy ? 'Saving...' : 'Mark handled'}</button>
    </li>
  )
}

export function LubecDeathTable() {
  return (
    <table className="lubec-death-table">
      <caption>Death table (d10)</caption>
      <tbody>{LUBEC_DEATH_TABLE.map((row) => <tr key={row.roll}><th scope="row">{row.roll}</th><td>{row.result}</td></tr>)}</tbody>
    </table>
  )
}

/** The GM's reminders, or nothing when none is waiting. */
export function LubecDeathReminders({ entries }: { entries: readonly LubecDeathEntry[] }) {
  if (!entries.length) return null
  return (
    <aside className="lubec-death-reminders" role="dialog" aria-modal="false" aria-label="Death Save due">
      <h3>Death Save due</h3>
      <ul>{entries.map((entry) => <ReminderRow key={entry.key} entry={entry} />)}</ul>
      <LubecDeathTable />
    </aside>
  )
}
