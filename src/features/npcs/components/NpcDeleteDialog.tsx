import type { NpcRecord } from '../../../types/app'

type NpcDeleteDialogProps = {
  npc: NpcRecord | null
  onCancel: () => void
  onConfirm: () => void
}

export function NpcDeleteDialog({ npc, onCancel, onConfirm }: NpcDeleteDialogProps) {
  if (!npc) return null
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-modal">
        <h3>Delete NPC</h3>
        <p>Delete <strong>{npc.name || 'this NPC'}</strong>?</p>
        <div className="confirm-actions">
          <button type="button" className="confirm-danger" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}
