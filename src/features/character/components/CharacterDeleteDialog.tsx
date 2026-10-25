import { ConfirmModal } from '../../common/ConfirmModal'

export type CharacterDeleteTarget = { id: string; name: string }

type Props = {
  target: CharacterDeleteTarget | null
  onConfirm: (target: CharacterDeleteTarget) => void
  onCancel: () => void
}

/** The confirmation every rule set's character tab asks before a character is deleted. */
export function CharacterDeleteDialog({ target, onConfirm, onCancel }: Props) {
  return (
    <ConfirmModal
      open={target !== null}
      title="Delete character?"
      message={`Are you sure you want to delete ${target?.name ?? 'this character'}? This cannot be undone.`}
      confirmLabel="Delete"
      onConfirm={() => {
        if (target) onConfirm(target)
      }}
      onCancel={onCancel}
    />
  )
}
