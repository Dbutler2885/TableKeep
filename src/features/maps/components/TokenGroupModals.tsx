import { ConfirmModal } from '../../common/ConfirmModal'
import type { DisbandCandidate, TokenGroupEditing } from '../hooks/useTokenCards'
import { pluralSuffix } from '../lib/pluralSuffix'

function disbandMessage(candidate: DisbandCandidate | null) {
  const count = candidate ? candidate.tokenIds.length : 0
  const name = candidate ? candidate.name : ''
  return `Ungroup the ${count} token${pluralSuffix(count)} in "${name}"? The tokens stay on the map; only the group is removed.`
}

export function DisbandTokenGroupModal({ grouping }: { grouping: TokenGroupEditing }) {
  return (
    <ConfirmModal
      open={grouping.disbandCandidate !== null}
      title="Disband Group?"
      message={disbandMessage(grouping.disbandCandidate)}
      confirmLabel="Disband"
      onCancel={() => grouping.setDisbandCandidate(null)}
      onConfirm={grouping.confirmDisband}
    />
  )
}

type MakeTokenGroupModalProps = {
  grouping: TokenGroupEditing
  count: number
  categoryLabel: string
}

// Names a new group for the selected tokens. Enter creates it and Escape abandons it.
export function MakeTokenGroupModal({ grouping, count, categoryLabel }: MakeTokenGroupModalProps) {
  if (!grouping.makeGroupOpen) return null
  return (
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Name token group"
      onClick={grouping.closeMakeGroup}
    >
      <div className="confirm-modal token-make-group-modal" onClick={(event) => event.stopPropagation()}>
        <h4 className="token-make-group-title">
          Group {count} token{pluralSuffix(count)}
        </h4>
        <p className="token-make-group-subtitle">Nested under {categoryLabel}.</p>
        <input
          type="text"
          className="token-make-group-input"
          autoFocus
          value={grouping.groupNameDraft}
          placeholder="Group name (e.g. Goblin Patrol)"
          onChange={(event) => grouping.setGroupNameDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') grouping.confirmMakeGroup()
            if (event.key === 'Escape') grouping.closeMakeGroup()
          }}
        />
        <div className="token-make-group-actions">
          <button
            type="button"
            className="token-make-group-cancel"
            onClick={grouping.closeMakeGroup}
          >
            Cancel
          </button>
          <button
            type="button"
            className="token-make-group-confirm"
            onClick={grouping.confirmMakeGroup}
            disabled={!grouping.groupNameDraft.trim()}
          >
            Create group
          </button>
        </div>
      </div>
    </div>
  )
}
