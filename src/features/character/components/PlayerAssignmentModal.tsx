import type { CharacterRecord } from '../../../types/app'
import type { CampaignPlayerOption } from '../lib/characterTabTypes'

type Props = {
  open: boolean
  character: CharacterRecord | null
  busy: boolean
  options: CampaignPlayerOption[]
  targetUserId: string
  onTargetChange: (id: string) => void
  onClose: () => void
  onSubmit: () => void
}

export function PlayerAssignmentModal(props: Props) {
  if (!props.open || !props.character) return null
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={props.onClose}>
      <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Give to Player</h3>
        <p>Assign <strong>{props.character.name}</strong> to a player so it appears in their character list.</p>
        {props.options.length === 0 ? <p className="character-enc-help">No other active players are available.</p> : (
          <div className="character-grant-mobile-targets">
            {props.options.map((player) => (
              <label key={player.userId} className="character-grant-mobile-target">
                <span><strong>{player.username ?? player.userId}</strong></span>
                <input type="radio" name="player-assignment-target" value={player.userId} checked={props.targetUserId === player.userId} onChange={() => props.onTargetChange(player.userId)} disabled={props.busy} />
              </label>
            ))}
          </div>
        )}
        <div className="confirm-actions">
          <button type="button" onClick={props.onClose} disabled={props.busy}>Cancel</button>
          <button type="button" className="confirm-danger" onClick={props.onSubmit} disabled={props.busy || !props.targetUserId}>Give to Player</button>
        </div>
      </div>
    </div>
  )
}
