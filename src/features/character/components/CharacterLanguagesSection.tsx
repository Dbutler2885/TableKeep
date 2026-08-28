import { BlurSyncedTextarea } from './BlurSyncedTextarea'

type Props = {
  value: string
  canEdit: boolean
  onCommit: (value: string) => void
}

export function CharacterLanguagesSection({ value, canEdit, onCommit }: Props) {
  return (
    <section className="monster-section-block">
      <h3 className="monster-section-title">Languages</h3>
      <BlurSyncedTextarea
        className="character-sheet-textarea short"
        value={value}
        onCommit={onCommit}
        disabled={!canEdit}
      />
    </section>
  )
}
