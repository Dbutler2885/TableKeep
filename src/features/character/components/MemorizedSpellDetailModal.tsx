import type { CharacterSpell } from '../../../types/app'

type Props = {
  spell: CharacterSpell | null
  description: React.ReactNode
  onClose: () => void
}

export function MemorizedSpellDetailModal({ spell, description, onClose }: Props) {
  if (!spell) return null
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="confirm-modal character-spell-detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="character-spell-detail-head">
          <h3>{spell.name}</h3>
          <p>Prepared spell details</p>
        </div>
        <div className="character-spell-detail-stat-grid">
          <div className="character-spell-detail-stat"><span>Level</span><strong>{spell.level}</strong></div>
          {spell.rangeText ? <div className="character-spell-detail-stat"><span>Range</span><strong>{spell.rangeText}</strong></div> : null}
          {spell.durationText ? <div className="character-spell-detail-stat"><span>Duration</span><strong>{spell.durationText}</strong></div> : null}
          {spell.targetText ? <div className="character-spell-detail-stat"><span>Target</span><strong>{spell.targetText}</strong></div> : null}
          {spell.areaText ? <div className="character-spell-detail-stat"><span>Area</span><strong>{spell.areaText}</strong></div> : null}
          {spell.savingThrowText ? <div className="character-spell-detail-stat"><span>Save</span><strong>{spell.savingThrowText}</strong></div> : null}
        </div>
        <div className="character-spell-detail-body">{description}</div>
        <div className="confirm-actions"><button type="button" onClick={onClose}>Close</button></div>
      </div>
    </div>
  )
}
