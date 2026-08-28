type Props = {
  open: boolean
  onAdd: (creationMode: 'new' | 'established') => void
  onClose: () => void
}

export function CreateCharacterModal({ open, onAdd, onClose }: Props) {
  if (!open) return null
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-modal character-create-modal">
        <h3>Create Character</h3>
        <p>Is this a brand new character or an established one?</p>
        <div className="character-create-modal-actions">
          <button type="button" onClick={() => { onAdd('new'); onClose() }}>New</button>
          <button type="button" onClick={() => { onAdd('established'); onClose() }}>Established</button>
        </div>
        <div className="confirm-actions">
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
