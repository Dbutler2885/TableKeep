import { useState } from 'react'
import { Plus } from 'lucide-react'

type DialogProps = { onDirectEntry: () => void; onClose: () => void }

// The doors that exist so far; Import and Guided roll-up add theirs here.
function LubecNewCharacterDialog({ onDirectEntry, onClose }: DialogProps) {
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="lubec-new-character-title">
      <div className="confirm-modal lubec-new-character">
        <h3 id="lubec-new-character-title">New character</h3>
        <p>How does this kid come in?</p>
        <div className="lubec-doors">
          <button type="button" className="lubec-door" onClick={() => { onDirectEntry(); onClose() }}>
            <strong>Direct entry</strong>
            <span>Type in the base Stats and Saves, the class and its choice from a sheet you already have.</span>
          </button>
        </div>
        <div className="confirm-actions">
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/** The "New character" action and the dialog that offers the ways in. */
export function LubecNewCharacter({ onDirectEntry }: { onDirectEntry: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="lubec-new-btn" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden="true" /> New character
      </button>
      {open ? <LubecNewCharacterDialog onDirectEntry={onDirectEntry} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
