import { ConfirmBody, DialogShell } from './GroupDialog'

type DeleteGroupDialogProps = {
  groupName: string
  hasCampaigns: boolean
  confirming: boolean
  busy: boolean
  error: string | null
  onCancel: () => void
  onAdvance: () => void
  onBack: () => void
  onConfirm: () => void
}

/**
 * Asks twice before deleting the group. Each step is keyed so its buttons are
 * built afresh: focus on the first Delete button must not carry over to
 * "Delete everything", where a second Enter would delete the group.
 */
export function DeleteGroupDialog({
  groupName,
  hasCampaigns,
  confirming,
  busy,
  error,
  onCancel,
  onAdvance,
  onBack,
  onConfirm,
}: DeleteGroupDialogProps) {
  return (
    <DialogShell>
      {confirming ? (
        <ConfirmBody
          key="confirm"
          title="Are you sure?"
          error={error}
          busy={busy}
          cancelLabel="Back"
          onCancel={onBack}
          confirmLabel="Delete everything"
          busyLabel="Deleting…"
          confirmClassName="danger"
          confirmDisabled={busy}
          onConfirm={onConfirm}
        >
          <p>
            This permanently deletes <strong>{groupName}</strong>
            {hasCampaigns ? ', all of its campaigns,' : ''} and everyone's membership.
            There is no undo.
          </p>
        </ConfirmBody>
      ) : (
        <ConfirmBody
          key="ask"
          title="Delete group"
          error={error}
          busy={busy}
          onCancel={onCancel}
          confirmLabel="Delete"
          confirmClassName="danger"
          onConfirm={onAdvance}
        >
          <p>Delete <strong>{groupName}</strong>?</p>
          {hasCampaigns ? (
            <p>This also deletes every campaign in the group and removes all members. This can't be undone.</p>
          ) : (
            <p>This removes all members and can't be undone.</p>
          )}
        </ConfirmBody>
      )}
    </DialogShell>
  )
}
