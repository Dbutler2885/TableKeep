import { Minus, Plus, X } from 'lucide-react'
import type { TokenCards } from '../hooks/useTokenCards'
import { partitionNamedGroups, type TokenGroup } from '../lib/tokenListGroups'
import type { TokenRecord } from '../lib/types'
import { TokenListRow } from './TokenListRow'

type TokenGroupBlockProps = { group: TokenGroup; cards: TokenCards }

function allSelected(tokens: TokenRecord[], selectedIds: Set<string>) {
  return tokens.every((token) => selectedIds.has(token.id))
}

type TokenSubgroupProps = TokenGroupBlockProps & { name: string; tokens: TokenRecord[] }

function TokenSubgroupHeader({ group, cards, name, tokens }: TokenSubgroupProps) {
  const subgroupKey = `${group.key}:${name}`
  const collapsed = cards.collapsedSubgroups.isOn(subgroupKey)
  const subgroupAllSelected = allSelected(tokens, cards.selectedIds)
  return (
    <div className="token-subgroup-header">
      <span className="token-subgroup-title">{name}</span>
      <span className="token-subgroup-count">{tokens.length}</span>
      <button
        type="button"
        className="token-subgroup-collapse fast-tooltip"
        onClick={() => cards.collapsedSubgroups.toggle(subgroupKey)}
        aria-label={collapsed ? `Expand ${name} group` : `Minimize ${name} group`}
        data-tooltip={collapsed ? 'Expand group' : 'Minimize group'}
      >
        {collapsed ? <Plus size={12} /> : <Minus size={12} />}
      </button>
      <button
        type="button"
        className="token-subgroup-ungroup fast-tooltip"
        onClick={() =>
          cards.grouping.setDisbandCandidate({ name, tokenIds: tokens.map((token) => token.id) })
        }
        aria-label={`Disband ${name} group`}
        data-tooltip="Disband group"
      >
        <X size={12} />
      </button>
      <label className="token-subgroup-check-label">
        <input
          type="checkbox"
          checked={subgroupAllSelected}
          onChange={() => cards.selection.setTokensSelected(tokens, !subgroupAllSelected)}
          aria-label={subgroupAllSelected ? `Deselect all ${name} tokens` : `Select all ${name} tokens`}
        />
      </label>
    </div>
  )
}

function TokenRows({ group, cards, tokens }: TokenGroupBlockProps & { tokens: TokenRecord[] }) {
  return tokens.map((token) => (
    <TokenListRow
      key={token.id}
      token={token}
      index={group.tokens.indexOf(token)}
      groupLabel={group.label}
      selected={cards.selectedIds.has(token.id)}
      names={cards.names}
      onToggle={cards.selection.toggleToken}
    />
  ))
}

function TokenSubgroup(props: TokenSubgroupProps) {
  const collapsed = props.cards.collapsedSubgroups.isOn(`${props.group.key}:${props.name}`)
  return (
    <div className="token-subgroup">
      <TokenSubgroupHeader {...props} />
      {collapsed ? null : <TokenRows {...props} />}
    </div>
  )
}

function TokenGroupList({ group, cards }: TokenGroupBlockProps) {
  const { named, loose } = partitionNamedGroups(group.tokens)
  return (
    <div className="token-list">
      {named.map(([name, tokens]) => (
        <TokenSubgroup key={`group-${name}`} group={group} cards={cards} name={name} tokens={tokens} />
      ))}
      <TokenRows group={group} cards={cards} tokens={loose} />
    </div>
  )
}

function TokenGroupHeader({ group, cards }: TokenGroupBlockProps) {
  const collapsed = cards.collapsedGroups.isOn(group.key)
  const groupAllSelected = allSelected(group.tokens, cards.selectedIds)
  return (
    <div className="token-group-header">
      <h5 className="token-group-title">{group.label}</h5>
      <div className="token-group-actions">
        <span className="token-group-count">{group.tokens.length}</span>
        <button
          type="button"
          className="token-group-collapse-btn fast-tooltip"
          onClick={() => cards.collapsedGroups.toggle(group.key)}
          aria-label={collapsed ? `Expand ${group.label} tokens` : `Minimize ${group.label} tokens`}
          data-tooltip={collapsed ? 'Expand category' : 'Minimize category'}
        >
          {collapsed ? <Plus size={13} /> : <Minus size={13} />}
        </button>
        <label className="token-group-check-label">
          <input
            type="checkbox"
            checked={groupAllSelected}
            onChange={() => cards.selection.setTokensSelected(group.tokens, !groupAllSelected)}
            aria-label={groupAllSelected ? `Deselect all ${group.label} tokens` : `Select all ${group.label} tokens`}
          />
        </label>
      </div>
    </div>
  )
}

// One category of the token list, with its named groups first and then the rest.
export function TokenGroupBlock({ group, cards }: TokenGroupBlockProps) {
  return (
    <section className="token-group-block" aria-label={group.label}>
      <TokenGroupHeader group={group} cards={cards} />
      {!cards.collapsedGroups.isOn(group.key) ? <TokenGroupList group={group} cards={cards} /> : null}
    </section>
  )
}
