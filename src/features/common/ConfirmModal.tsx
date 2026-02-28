export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  confirmDisabled = false,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  confirmDisabled?: boolean
}) {
  if (!open) return null

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-modal">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="confirm-danger"
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
