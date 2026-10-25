import { useState } from 'react'
import type { LubecCharacterRecord } from '../ruleSets/lubec/characterRecord'
import { lubecRollUpIncomplete } from '../ruleSets/lubec/guidedRollUp'
import { lubecHoles } from '../ruleSets/lubec/holes'
import { lubecRuleWarnings } from '../ruleSets/lubec/ruleChecks'
import { lubecCharacterName } from './lubecNames'

type NoticeListProps = { title: string; notices: readonly string[] }

function LubecNoticeList({ title, notices }: NoticeListProps) {
  if (notices.length === 0) return null
  return (
    <section className="lubec-finalize-notices" aria-label={title}>
      <h4>{title}</h4>
      <ul>{notices.map((notice, index) => <li key={`${index}-${notice}`}>{notice}</li>)}</ul>
    </section>
  )
}

type DialogProps = { character: LubecCharacterRecord; onFinalize: () => void; onCancel: () => void }

// Rule warnings are worked out from the record each time the dialog opens, so
// they follow every edit to the draft; only the import notes are stored.
function LubecFinalizeDialog({ character, onFinalize, onCancel }: DialogProps) {
  const sheet = character.lubec
  const warnings = lubecRuleWarnings(sheet).map(({ message }) => message)
  const holes = lubecHoles(sheet)
  const incomplete = lubecRollUpIncomplete(sheet)
  const clear = incomplete.length + warnings.length + holes.length + sheet.importNotes.length === 0
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="lubec-finalize-title">
      <div className="confirm-modal lubec-finalize">
        <h3 id="lubec-finalize-title">Finalize {lubecCharacterName(character)}</h3>
        <p>
          This puts the character in use, for good. Base Stats and Saves, class, class choice and skills are locked
          after this, and only the GM can correct them.
        </p>
        {clear ? <p className="lubec-finalize-clear">Nothing to warn about.</p> : null}
        <LubecNoticeList title="Still incomplete" notices={incomplete} />
        <LubecNoticeList title="Rule warnings" notices={warnings} />
        <LubecNoticeList title="Missing values" notices={holes} />
        <LubecNoticeList title="Import notes" notices={sheet.importNotes} />
        <div className="confirm-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
          <button type="button" className="confirm-button" onClick={onFinalize}>Finalize</button>
        </div>
      </div>
    </div>
  )
}

/** The Finalize button on a character in creation, and the dialog that lists what is still wrong before it goes into use. */
export function LubecFinalize({ character, onFinalize }: { character: LubecCharacterRecord; onFinalize: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="confirm-button" onClick={() => setOpen(true)}>Finalize</button>
      {open ? (
        <LubecFinalizeDialog character={character} onFinalize={() => { setOpen(false); onFinalize() }} onCancel={() => setOpen(false)} />
      ) : null}
    </>
  )
}
