import { Check, Pencil, X } from 'lucide-react'

export type SectionEditProps = {
  canEdit: boolean
  editing: boolean
  onBeginEdit: () => void
  onSave: () => void
  onCancel: () => void
}

type EditActionsProps = {
  onSave: () => void
  onCancel: () => void
}

export function EditActions({ onSave, onCancel }: EditActionsProps) {
  return (
    <div className="session-inline-editor-actions">
      <button type="button" className="modal-icon-btn" onClick={onCancel} aria-label="Cancel edit">
        <X size={16} />
      </button>
      <button type="button" className="modal-icon-btn confirm" onClick={onSave} aria-label="Save edit">
        <Check size={16} />
      </button>
    </div>
  )
}

type EditButtonProps = {
  canEdit: boolean
  label: string
  onClick: () => void
}

export function EditButton({ canEdit, label, onClick }: EditButtonProps) {
  if (!canEdit) return null
  return (
    <button type="button" className="session-text-edit-btn" onClick={onClick} aria-label={label} title={label}>
      <Pencil size={18} strokeWidth={2.2} />
    </button>
  )
}

/** Save and cancel while a section is being edited, otherwise its edit button. */
export function SectionEditToggle({ canEdit, editing, onBeginEdit, onSave, onCancel, label }: SectionEditProps & { label: string }) {
  return editing
    ? <EditActions onSave={onSave} onCancel={onCancel} />
    : <EditButton canEdit={canEdit} label={label} onClick={onBeginEdit} />
}
