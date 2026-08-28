import type { CharacterRecord } from '../../../types/app'
import type { usePlayerAssignment } from '../hooks/usePlayerAssignment'

type Props = {
  character: CharacterRecord | null
  flow: ReturnType<typeof usePlayerAssignment>
}

export function PlayerAssignmentModal(props: Props) {
  const { flow } = props
  if (!flow.playerAssignmentOpen || !props.character) return null
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" onClick={flow.closePlayerAssignment}>
      <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
        <h3>Give to Player</h3>
        <p>Assign <strong>{props.character.name}</strong> to a player so it appears in their character list.</p>
        {flow.assignmentOptions.length === 0 ? <p className="character-enc-help">No other active players are available.</p> : (
          <div className="character-grant-mobile-targets">
            {flow.assignmentOptions.map((player) => (
              <label key={player.userId} className="character-grant-mobile-target">
                <span><strong>{player.username ?? player.userId}</strong></span>
                <input type="radio" name="player-assignment-target" value={player.userId} checked={flow.effectiveAssignmentTargetUserId === player.userId} onChange={() => flow.setAssignmentTargetUserId(player.userId)} disabled={flow.assignmentBusy} />
              </label>
            ))}
          </div>
        )}
        <div className="confirm-actions">
          <button type="button" onClick={flow.closePlayerAssignment} disabled={flow.assignmentBusy}>Cancel</button>
          <button type="button" className="confirm-danger" onClick={() => void flow.submitPlayerAssignment()} disabled={flow.assignmentBusy || !flow.effectiveAssignmentTargetUserId}>Give to Player</button>
        </div>
      </div>
    </div>
  )
}
