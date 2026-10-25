import { useState } from 'react'
import { ChessPawn, Minus, Plus } from 'lucide-react'
import type { buildWholePartyTokenPlacementSources } from '../lib/tokenPlacementSources'
import { partyPlacementControlsAvailable } from '../lib/tokenPlacementSources'
import type { getTokenPlacementDisplay } from '../lib/tokenPlacementQueue'
import { NonPartyPlacementGroup, type NonPartyPlacementGroupProps } from './NonPartyPlacementGroup'
import { PlacementSourceIcon } from './PlacementSourceIcon'

type PlacementDisplay = ReturnType<typeof getTokenPlacementDisplay>
type PartySources = ReturnType<typeof buildWholePartyTokenPlacementSources>

export type TokenPlacementPanelProps = NonPartyPlacementGroupProps & {
  placementDisplay: PlacementDisplay
  partyPlacementSources: PartySources
  onStartWholePartyPlacement: () => void
  onCancelPlacement: () => void
}

function placementRemainingLabel(display: PlacementDisplay) {
  return display.remaining > 1 ? `${display.remaining} left` : ''
}

type PlacementActiveBlockProps = { display: PlacementDisplay; tokenColor: string; onCancel: () => void }

function PlacementActiveBlock({ display, tokenColor, onCancel }: PlacementActiveBlockProps) {
  const remaining = placementRemainingLabel(display)
  return (
    <div className="map-placement-active-block">
      <span className="map-section-label">Placing:</span>
      <div className="map-placement-active">
        {display.current ? <PlacementSourceIcon source={display.current} fallbackColor={tokenColor} /> : (
          <span className="token-row-icon" aria-hidden>
            <ChessPawn size={14} />
          </span>
        )}
        <div className="map-placement-active-main">
          <span className="map-placement-active-name">{display.current?.name || 'Token'}</span>
          {remaining ? <span className="map-placement-active-meta">{remaining}</span> : null}
        </div>
        <button type="button" className="monster-example-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}

type PartyPlacementGroupProps = Pick<TokenPlacementPanelProps, 'partyPlacementSources' | 'tokenColor' | 'onStartWholePartyPlacement' | 'onStartSinglePlacement'>

function PartyPlacementList({ partyPlacementSources, tokenColor, onStartSinglePlacement }: Omit<PartyPlacementGroupProps, 'onStartWholePartyPlacement'>) {
  return (
    <div className="token-list">
      {partyPlacementSources.map((source) => (
        <div key={source.id} className="token-row map-placement-row">
          <PlacementSourceIcon source={source} fallbackColor={tokenColor} />
          <span className="map-placement-source-name">{source.name}</span>
          <button type="button" className="monster-example-btn" onClick={() => onStartSinglePlacement(source)}>
            Place
          </button>
        </div>
      ))}
      {partyPlacementSources.length === 0 ? <p className="map-npc-scene-empty">No party characters.</p> : null}
    </div>
  )
}

function PartyPlacementGroup(props: PartyPlacementGroupProps) {
  const [collapsed, setCollapsed] = useState(true)
  return (
    <div className="map-placement-group">
      <div className="map-placement-group-header">
        <span className="map-section-label">Party</span>
        <div className="map-placement-group-actions">
          <button
            type="button"
            className="monster-example-btn"
            onClick={props.onStartWholePartyPlacement}
            disabled={!partyPlacementControlsAvailable(props.partyPlacementSources)}
          >
            Whole Party
          </button>
          <button
            type="button"
            className="map-icon-btn map-placement-collapse-btn fast-tooltip fast-tooltip-left"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? 'Show party token sources' : 'Hide party token sources'}
            data-tooltip={collapsed ? 'Show party' : 'Hide party'}
          >
            {collapsed ? <Plus size={13} /> : <Minus size={13} />}
          </button>
        </div>
      </div>
      {!collapsed ? <PartyPlacementList {...props} /> : null}
    </div>
  )
}

// Where the GM picks what to put on the map: what is being placed now, the party,
// and everyone else.
export function TokenPlacementPanel(props: TokenPlacementPanelProps) {
  return (
    <section className="map-token-placement-panel" aria-label="Place tokens">
      <div className="token-cards-header">
        <h4 className="token-cards-title">Place tokens</h4>
      </div>
      {props.placementDisplay.active ? (
        <PlacementActiveBlock display={props.placementDisplay} tokenColor={props.tokenColor} onCancel={props.onCancelPlacement} />
      ) : null}
      <PartyPlacementGroup {...props} />
      <NonPartyPlacementGroup {...props} />
    </section>
  )
}
