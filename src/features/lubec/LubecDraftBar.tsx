import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ConfirmModal } from '../common/ConfirmModal'
import type { LubecCharacterRecord, LubecDoor } from '../ruleSets/lubec/characterRecord'
import { LubecFinalize } from './LubecFinalize'
import { lubecCharacterName } from './lubecNames'

const LUBEC_DOOR_NAMES: Readonly<Record<LubecDoor, string>> = {
  direct: 'Direct entry',
  import: 'Imported',
  guided: 'Guided roll-up',
}

type DraftBarProps = {
  character: LubecCharacterRecord
  /** Deletes the draft; null when the viewer may not. */
  onDelete: (() => void) | null
  /** Puts the draft in use; null when the viewer may not. */
  onFinalize: (() => void) | null
}

function LubecDeleteDraft({ character, onDelete }: { character: LubecCharacterRecord; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <button type="button" className="lubec-delete-draft" onClick={() => setConfirming(true)}>
        <Trash2 size={14} aria-hidden="true" /> Delete draft
      </button>
      <ConfirmModal
        open={confirming}
        title="Delete draft"
        message={`Permanently delete ${lubecCharacterName(character)}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => { setConfirming(false); onDelete() }}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}

/** A character in creation: which door made it, and finalizing or deleting the draft for those who may. */
export function LubecDraftBar({ character, onDelete, onFinalize }: DraftBarProps) {
  const door = character.lubec.door
  return (
    <div className="lubec-draft-bar">
      <p className="lubec-draft-status">
        In creation{door ? <> &middot; {LUBEC_DOOR_NAMES[door]}</> : null}
      </p>
      <div className="lubec-draft-actions">
        {onDelete ? <LubecDeleteDraft character={character} onDelete={onDelete} /> : null}
        {onFinalize ? <LubecFinalize character={character} onFinalize={onFinalize} /> : null}
      </div>
    </div>
  )
}
