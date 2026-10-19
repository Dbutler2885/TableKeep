import type { Campaign } from '../../types/app'
import { ConfirmDialog } from './GroupDialog'
import { NewDraftDialog } from './NewDraftDialog'
import { SetActiveDialog } from './SetActiveDialog'
import type { CampaignCandidate } from './useCampaignCandidate'
import type { NewDraft } from './useNewDraftDialog'

type CampaignDialogsProps = {
  activeCampaign: Campaign | null
  busy: boolean
  error: string | null
  newDraft: NewDraft
  setActive: CampaignCandidate
  deactivate: CampaignCandidate
  deleteInactive: CampaignCandidate
  deleteDraft: CampaignCandidate
}

/** Whichever campaign dialogs are open, in the order they stack. */
export function CampaignDialogs({
  activeCampaign,
  busy,
  error,
  newDraft,
  setActive,
  deactivate,
  deleteInactive,
  deleteDraft,
}: CampaignDialogsProps) {
  return (
    <>
      {newDraft.open ? (
        <NewDraftDialog busy={busy} error={error} onCancel={newDraft.cancel} onCreate={(name, system) => void newDraft.create(name, system)} />
      ) : null}

      {setActive.candidate ? (
        <SetActiveDialog
          campaign={setActive.candidate}
          activeCampaign={activeCampaign}
          busy={busy}
          error={error}
          onCancel={setActive.cancel}
          onConfirm={() => void setActive.confirm()}
        />
      ) : null}

      {deactivate.candidate ? (
        <ConfirmDialog
          title="Deactivate"
          error={error}
          busy={busy}
          onCancel={deactivate.cancel}
          confirmLabel="Deactivate"
          busyLabel="Deactivating…"
          confirmClassName="primary"
          confirmDisabled={busy}
          onConfirm={() => void deactivate.confirm()}
        >
          <p>Deactivate <strong>{deactivate.candidate.name}</strong>?</p>
        </ConfirmDialog>
      ) : null}

      {deleteInactive.candidate ? (
        <ConfirmDialog
          title="Delete campaign"
          error={error}
          busy={busy}
          onCancel={deleteInactive.cancel}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          confirmClassName="danger"
          confirmDisabled={busy}
          onConfirm={() => void deleteInactive.confirm()}
        >
          <p>Delete <strong>{deleteInactive.candidate.name}</strong> and all its data?</p>
        </ConfirmDialog>
      ) : null}

      {deleteDraft.candidate ? (
        <ConfirmDialog
          title="Delete draft"
          error={error}
          busy={busy}
          onCancel={deleteDraft.cancel}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          confirmClassName="danger"
          confirmDisabled={busy}
          onConfirm={() => void deleteDraft.confirm()}
        >
          <p>Delete <strong>{deleteDraft.candidate.name}</strong>?</p>
        </ConfirmDialog>
      ) : null}
    </>
  )
}
