import type { ReactNode } from 'react'

type DialogShellProps = {
  className?: string
  children: ReactNode
}

/** The modal overlay every group home dialog sits in. */
export function DialogShell({ className = 'confirm-modal group-modal', children }: DialogShellProps) {
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className={className}>{children}</div>
    </div>
  )
}

type ConfirmBodyProps = {
  title: string
  children: ReactNode
  error: string | null
  busy: boolean
  cancelLabel?: string
  onCancel: () => void
  confirmLabel: string
  /** Shown on the confirm button while busy; without it the label never changes. */
  busyLabel?: string
  confirmClassName: 'primary' | 'danger'
  confirmDisabled?: boolean
  onConfirm: () => void
}

/** A confirmation's title, message, error and Cancel / confirm buttons, without the overlay. */
export function ConfirmBody({
  title,
  children,
  error,
  busy,
  cancelLabel = 'Cancel',
  onCancel,
  confirmLabel,
  busyLabel,
  confirmClassName,
  confirmDisabled,
  onConfirm,
}: ConfirmBodyProps) {
  return (
    <>
      <h3>{title}</h3>
      {children}
      {error ? <p className="error">{error}</p> : null}
      <div className="group-modal-actions">
        <button type="button" className="secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className={confirmClassName} onClick={onConfirm} disabled={confirmDisabled}>
          {busy && busyLabel ? busyLabel : confirmLabel}
        </button>
      </div>
    </>
  )
}

export function ConfirmDialog(props: ConfirmBodyProps) {
  return (
    <DialogShell>
      <ConfirmBody {...props} />
    </DialogShell>
  )
}
