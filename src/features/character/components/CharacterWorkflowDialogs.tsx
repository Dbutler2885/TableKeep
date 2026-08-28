import type { useCharacterRoster } from '../hooks/useCharacterRoster'
import { ConfirmModal } from '../../common/ConfirmModal'

type DeleteTarget = { id: string; name: string }

type Props = {
  rosterFlow: ReturnType<typeof useCharacterRoster>
  isGuidedCreation: boolean
  reallocationClassRequiredOpen: boolean
  setReallocationClassRequiredOpen: (open: boolean) => void
  storeClassRequiredOpen: boolean
  setStoreClassRequiredOpen: (open: boolean) => void
  hpClassRequiredOpen: boolean
  setHpClassRequiredOpen: (open: boolean) => void
  deleteTarget: DeleteTarget | null
  onConfirmDelete: (target: DeleteTarget) => void
  onCancelDelete: () => void
}

export function CharacterWorkflowDialogs(props: Props) {
  const {
    finalizeConfirmOpen, setFinalizeConfirmOpen, finalizeCharacter,
    holySymbolRequiredOpen, setHolySymbolRequiredOpen,
  } = props.rosterFlow
  return (
    <>
      <ConfirmModal
        open={finalizeConfirmOpen}
        title="Finalize character?"
        message={props.isGuidedCreation
          ? 'This character will leave guided creation mode and use the normal sheet.'
          : 'This will finalize the imported established character. Item changes will require GM approval after this.'}
        confirmLabel="Finalize"
        onConfirm={finalizeCharacter}
        onCancel={() => setFinalizeConfirmOpen(false)}
      />
      <ConfirmModal
        open={holySymbolRequiredOpen}
        title="Holy Symbol Required"
        message="You need to purchase a Holy Symbol to finalize your character."
        confirmLabel="OK"
        onConfirm={() => setHolySymbolRequiredOpen(false)}
        onCancel={() => setHolySymbolRequiredOpen(false)}
      />
      <ConfirmModal
        open={props.reallocationClassRequiredOpen}
        title="Class Required"
        message="Please choose class before reallocation."
        confirmLabel="OK"
        onConfirm={() => props.setReallocationClassRequiredOpen(false)}
        onCancel={() => props.setReallocationClassRequiredOpen(false)}
      />
      <ConfirmModal
        open={props.storeClassRequiredOpen}
        title="Class Required"
        message="Please choose class before buying equipment."
        confirmLabel="OK"
        onConfirm={() => props.setStoreClassRequiredOpen(false)}
        onCancel={() => props.setStoreClassRequiredOpen(false)}
      />
      <ConfirmModal
        open={props.hpClassRequiredOpen}
        title="Class Required"
        message="To Roll for HP, set class to determine Hit Dice"
        confirmLabel="OK"
        onConfirm={() => props.setHpClassRequiredOpen(false)}
        onCancel={() => props.setHpClassRequiredOpen(false)}
      />
      <ConfirmModal
        open={props.deleteTarget !== null}
        title="Delete character?"
        message={`Are you sure you want to delete ${props.deleteTarget?.name ?? 'this character'}? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (props.deleteTarget) props.onConfirmDelete(props.deleteTarget)
        }}
        onCancel={props.onCancelDelete}
      />
    </>
  )
}
