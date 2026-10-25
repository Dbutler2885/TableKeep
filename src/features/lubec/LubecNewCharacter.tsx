import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { LubecImportedCharacter } from '../ruleSets/lubec/importFile'
import { LubecImportDoor } from './LubecImportDoor'

/** The ways a new character comes in, each starting a new draft. */
export type LubecDoors = {
  onDirectEntry: () => void
  onGuided: () => void
  onImport: (imported: LubecImportedCharacter) => void
}

type DialogProps = LubecDoors & { onClose: () => void }

type DoorListProps = { onChooseImport: () => void; onDirectEntry: () => void; onGuided: () => void; onCancel: () => void }

function LubecDoorList({ onChooseImport, onDirectEntry, onGuided, onCancel }: DoorListProps) {
  return (
    <>
      <p>How does this kid come in?</p>
      <div className="lubec-doors">
        <button type="button" className="lubec-door" onClick={onChooseImport}>
          <strong>Import a file</strong>
          <span>Bring in a character the Lubec sheet saved, as its file or its pasted character code.</span>
        </button>
        <button type="button" className="lubec-door" onClick={onDirectEntry}>
          <strong>Direct entry</strong>
          <span>Type in the base Stats and Saves, the class and its choice from a sheet you already have.</span>
        </button>
        <button type="button" className="lubec-door" onClick={onGuided}>
          <strong>Guided roll-up</strong>
          <span>Roll each Stat and Save, keep the scores or Swap the lowest, then choose a class and skills. Every die is saved as it lands.</span>
        </button>
      </div>
      <div className="confirm-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </>
  )
}

function LubecNewCharacterDialog({ onDirectEntry, onGuided, onImport, onClose }: DialogProps) {
  const [importing, setImporting] = useState(false)
  const andClose = (action: () => void) => () => { action(); onClose() }
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="lubec-new-character-title">
      <div className="confirm-modal lubec-new-character">
        <h3 id="lubec-new-character-title">New character</h3>
        {importing ? (
          <LubecImportDoor onImport={(imported) => { onImport(imported); onClose() }} onBack={() => setImporting(false)} onCancel={onClose} />
        ) : (
          <LubecDoorList
            onChooseImport={() => setImporting(true)}
            onDirectEntry={andClose(onDirectEntry)}
            onGuided={andClose(onGuided)}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  )
}

type NewCharacterProps = LubecDoors & {
  /** The action's label; "New character" unless named. */
  label?: string
}

/** The "New character" action and the dialog that offers the ways in. */
export function LubecNewCharacter({ label = 'New character', ...doors }: NewCharacterProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="lubec-new-btn" onClick={() => setOpen(true)}>
        <Plus size={14} aria-hidden="true" /> {label}
      </button>
      {open ? <LubecNewCharacterDialog {...doors} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
