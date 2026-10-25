import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { ConfirmModal } from '../common/ConfirmModal'
import type { LubecCharacterRecord, LubecDoor } from '../ruleSets/lubec/characterRecord'
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

/** A character in creation: which door made it, and deleting the draft for those who may. */
export function LubecDraftBar({ character, onDelete }: DraftBarProps) {
  const door = character.lubec.door
  return (
    <div className="lubec-draft-bar">
      <p className="lubec-draft-status">
        In creation{door ? <> &middot; {LUBEC_DOOR_NAMES[door]}</> : null}
      </p>
      {onDelete ? <LubecDeleteDraft character={character} onDelete={onDelete} /> : null}
    </div>
  )
}
