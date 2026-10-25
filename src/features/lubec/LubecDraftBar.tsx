import type { LubecCharacterRecord, LubecDoor } from '../ruleSets/lubec/characterRecord'
import { LubecFinalize } from './LubecFinalize'

const LUBEC_DOOR_NAMES: Readonly<Record<LubecDoor, string>> = {
  direct: 'Direct entry',
  import: 'Imported',
  guided: 'Guided roll-up',
}

type DraftBarProps = {
  character: LubecCharacterRecord
  /** Asks to delete the draft; null when the viewer may not. */
  onDelete: (() => void) | null
  /** Puts the draft in use; null when the viewer may not. */
  onFinalize: (() => void) | null
}

/**
 * A character in creation: which door made it, in the prototype's phase chip,
 * then the decision tray's buttons to delete or finalize the draft for those who may.
 */
export function LubecDraftBar({ character, onDelete, onFinalize }: DraftBarProps) {
  const door = character.lubec.door
  return (
    <div className="lubec-draft-bar">
      <p className="phase-chip">
        In creation{door ? <> &middot; {LUBEC_DOOR_NAMES[door]}</> : null}
      </p>
      {onDelete ? <button type="button" className="action-button" onClick={onDelete}>Delete draft</button> : null}
      {onFinalize ? <LubecFinalize character={character} onFinalize={onFinalize} /> : null}
    </div>
  )
}
