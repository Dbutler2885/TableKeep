import type { CharacterInventoryItem, ItemApprovalAction, ItemApprovalRequest, Role } from '../../types/app'
import { approvalTitle, flagSuffix, itemDisplayName, numericSuffix } from './approvalText'

type Decide = (request: ItemApprovalRequest) => Promise<void>

type Decision = {
  busy: boolean
  pendingCount: number
  onApprove: Decide
  onReject: Decide
}

type ApprovalPromptProps = {
  role: Role | null
  pendingRequests: ItemApprovalRequest[]
  busy: boolean
  onApprove: Decide
  onReject: Decide
}

// The GM decides the oldest pending player request first; the rest wait
// behind it.
export function ApprovalPrompt({ role, pendingRequests, busy, onApprove, onReject }: ApprovalPromptProps) {
  const showing = role === 'gm' && pendingRequests.length > 0
  if (!showing) return null
  const request = pendingRequests[0]
  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-modal">
        <h3>{approvalTitle(request.action)}</h3>
        {requestBody(request, { busy, pendingCount: pendingRequests.length, onApprove, onReject })}
      </div>
    </div>
  )
}

function requestBody(request: ItemApprovalRequest, decision: Decision) {
  if (request.action === 'ability_reroll') return abilityRerollBody(request, decision)
  if (request.action === 'learn_spell') return spellBody(request, decision)
  return itemBody(request, decision)
}

function decisionButtons(request: ItemApprovalRequest, decision: Decision) {
  return (
    <div className="confirm-actions">
      <button
        type="button"
        className="confirm-danger"
        disabled={decision.busy}
        onClick={() => void decision.onReject(request)}
      >
        Reject
      </button>
      <button
        type="button"
        disabled={decision.busy}
        onClick={() => void decision.onApprove(request)}
      >
        Approve
      </button>
    </div>
  )
}

function morePending(pendingCount: number) {
  return pendingCount > 1 ? (
    <p style={{ marginTop: 8, fontSize: '0.85em', opacity: 0.7 }}>
      +{pendingCount - 1} more pending
    </p>
  ) : null
}

function abilityRerollBody(request: ItemApprovalRequest, decision: Decision) {
  return (
    <>
      <p>
        <strong>{request.requestedByUsername}</strong> wants to re-roll ability scores for <strong>{request.characterName}</strong>.
      </p>
      {decisionButtons(request, decision)}
      {morePending(decision.pendingCount)}
    </>
  )
}

function spellBody(request: ItemApprovalRequest, decision: Decision) {
  const spellNames = request.spellNames ?? []
  return (
    <>
      <p>
        <strong>{request.requestedByUsername}</strong> wants to transcribe spell
        {spellNames.length === 1 ? '' : 's'} into <strong>{request.characterName}</strong>&apos;s spell book:
      </p>
      {spellNames.length > 0 ? (
        <p style={{ margin: '8px 0', fontWeight: 600 }}>{spellNames.join(', ')}</p>
      ) : (
        <p style={{ margin: '8px 0', fontWeight: 600 }}>(No spell names provided)</p>
      )}
      {decisionButtons(request, decision)}
      {morePending(decision.pendingCount)}
    </>
  )
}

function itemBody(request: ItemApprovalRequest, decision: Decision) {
  const item = request.item
  if (!item) return null
  return (
    <>
      <p>
        <strong>{request.requestedByUsername}</strong> wants to {request.action === 'sell' ? 'sell' : 'add'}
        {' '}a <strong>{item.kind}</strong> {request.action === 'sell' ? 'from' : 'to'} <strong>{request.characterName}</strong>:
      </p>
      <p style={{ margin: '8px 0', fontWeight: 600 }}>{itemDisplayName(item)}</p>
      {costLine(item, request.action)}
      {weaponStats(item)}
      {armourStats(item)}
      {quantityLine(item)}
      {itemNote(item.description)}
      {itemNote(item.notes)}
      {decisionButtons(request, decision)}
      {morePending(decision.pendingCount)}
    </>
  )
}

function costLine(item: CharacterInventoryItem, action: ItemApprovalAction) {
  return item.costGp > 0 ? (
    <p>{action === 'sell' ? `Sell for: ${item.costGp} gp` : `Cost: ${item.costGp} gp`}</p>
  ) : null
}

function weaponStats(item: CharacterInventoryItem) {
  return item.kind === 'weapon' && 'damageDiceCount' in item ? (
    <p style={{ fontSize: '0.9em' }}>
      Damage: {item.damageDiceCount}d{item.damageDiceSides}
      {numericSuffix(item.attackBonus, ` | Atk +${item.attackBonus}`)}
      {numericSuffix(item.damageBonus, ` | Dmg +${item.damageBonus}`)}
      {numericSuffix(item.rangeShort, ` | Range ${item.rangeShort}/${item.rangeMedium}/${item.rangeLong}`)}
      {flagSuffix(item.twoHanded, ' | Two-handed')}
      {flagSuffix(item.isMagic, ' | Magic')}
    </p>
  ) : null
}

function armourStats(item: CharacterInventoryItem) {
  return item.kind === 'armour' && 'armourClass' in item ? (
    <p style={{ fontSize: '0.9em' }}>
      AC: {item.armourClass}
      {item.armourType === 'shield' ? ' (Shield)' : ' (Body)'}
      {numericSuffix(item.magicMod, ` | Magic +${item.magicMod}`)}
      {flagSuffix(item.isMagic, ' | Magic')}
    </p>
  ) : null
}

function quantityLine(item: CharacterInventoryItem) {
  return item.kind === 'ammunition' || item.kind === 'consumable' ? (
    <p style={{ fontSize: '0.9em' }}>Qty: {item.qty}</p>
  ) : null
}

function itemNote(text: string | undefined) {
  return text ? <p style={{ fontSize: '0.9em', opacity: 0.8 }}>{text}</p> : null
}
