import type { TokenCards } from '../hooks/useTokenCards'
import { SelectedTokenControls, type SelectedTokenControlsProps } from './SelectedTokenControls'
import { TokenGroupBlock } from './TokenGroupBlock'

export type TokenCardsPanelProps = Omit<SelectedTokenControlsProps, 'selectedTokens' | 'sameCategory' | 'onMakeGroup'> & {
  cards: TokenCards
}

// The GM's token list: bulk controls for the selection, then every token by category.
export function TokenCardsPanel({ cards, ...controlProps }: TokenCardsPanelProps) {
  const toggleLabel = cards.collapsed ? 'Expand tokens' : 'Collapse tokens'
  return (
    <section className="token-cards-panel" aria-label="Token cards">
      <div className="token-cards-header">
        <h4 className="token-cards-title">Tokens</h4>
        <button
          type="button"
          className="token-cards-toggle fast-tooltip"
          onClick={cards.toggleCollapsed}
          aria-label={toggleLabel}
          data-tooltip={toggleLabel}
        >
          {cards.collapsed ? '+' : '-'}
        </button>
      </div>
      {!cards.collapsed ? (
        <div className="token-group-list">
          <SelectedTokenControls
            {...controlProps}
            selectedTokens={cards.selectedTokens}
            sameCategory={cards.sameCategory}
            onMakeGroup={cards.grouping.openMakeGroup}
          />
          {cards.tokenGroups.map((group) => (
            <TokenGroupBlock key={group.key} group={group} cards={cards} />
          ))}
        </div>
      ) : null}
    </section>
  )
}
