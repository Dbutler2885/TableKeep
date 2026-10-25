import type { MouseEvent, TouchEvent, TouchEventHandler } from 'react'
import { ChessPawn, X } from 'lucide-react'
import { isActivationKey } from '../lib/bareMapInteractions'
import {
  gmTokenClassName,
  gmTokenNameClassName,
  isInPlayerLayer,
  playerTokenClassName,
  tokenDisplayName,
  tokenGlyphStyle,
  tokenNameStyle,
  tokenPositionStyle,
  type TokenLayerKind,
  type tokenLivePosition,
} from '../lib/mapTokenDisplay'
import type { renderTokenDimensions } from '../lib/tokenRenderGeometry'
import type { TokenRecord } from '../lib/types'
import { npcSheetDoubleClick, useNpcSheetOpener } from '../mapNpcSheet'

type TokenDimensions = ReturnType<typeof renderTokenDimensions>
type LivePosition = ReturnType<typeof tokenLivePosition>
type TokenMouseEvent = MouseEvent<HTMLButtonElement>
type TokenTouchEvent = TouchEvent<HTMLButtonElement>

// The token's image, or a pawn, turned and mirrored as the token is.
export function TokenGlyph({ token, dimensions }: { token: TokenRecord; dimensions: TokenDimensions }) {
  return (
    <span className="map-token-glyph" style={tokenGlyphStyle(token)}>
      {token.tokenImageUrl ? (
        <img
          src={token.tokenImageUrl}
          alt=""
          className="map-token-image"
          style={{ width: `${dimensions.width}px`, height: `${dimensions.height}px` }}
          draggable={false}
        />
      ) : (
        <ChessPawn size={dimensions.baseSize} />
      )}
    </span>
  )
}

// The small badge on a GM token that hides it from players or shows it again.
// Pressing it never starts a drag.
function TokenHideToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  const label = hidden ? 'Show token' : 'Hide token'
  return (
    <span
      role="button"
      tabIndex={0}
      className="map-token-hide-btn"
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onToggle()
      }}
      onKeyDown={(event) => {
        if (!isActivationKey(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        onToggle()
      }}
      aria-label={label}
      title={label}
    >
      <X size={10} />
    </span>
  )
}

export type GmTokenItemProps = {
  token: TokenRecord
  index: number
  visible: boolean
  position: LivePosition
  selected: boolean
  dimensions: TokenDimensions
  playerViewPreview: boolean
  onPress: (tokenId: string, event: TokenMouseEvent) => void
  onTouchStart: (tokenId: string, event: TokenTouchEvent) => void
  onTouchEnd: TouchEventHandler<HTMLButtonElement>
  onToggleHidden: (tokenId: string) => void
}

// One token on the GM's view of the map: drag it, hide it from players, see
// its name on hover unless it is revealed, and double-click an NPC's token to
// open its sheet where there is one.
export function GmTokenItem({ token, index, visible, position, selected, dimensions, playerViewPreview, onPress, onTouchStart, onTouchEnd, onToggleHidden }: GmTokenItemProps) {
  const openNpcSheet = useNpcSheetOpener()
  if (!visible) return null
  return (
    <button
      type="button"
      className={gmTokenClassName({ dragging: position.dragging, animating: position.animating, selected, hidden: token.hidden })}
      style={tokenPositionStyle(position, token.color)}
      onMouseDown={(event) => onPress(token.id, event)}
      onTouchStart={(event) => onTouchStart(token.id, event)}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onDoubleClick={npcSheetDoubleClick(openNpcSheet, token)}
      aria-label="Map token"
    >
      <TokenHideToggle hidden={token.hidden} onToggle={() => onToggleHidden(token.id)} />
      <TokenGlyph token={token} dimensions={dimensions} />
      {token.hidden && (
        <span className="map-token-hidden-badge" aria-hidden="true">H</span>
      )}
      <span className={gmTokenNameClassName(token, playerViewPreview)} style={tokenNameStyle(token)}>
        {tokenDisplayName(token, index)}
      </span>
    </button>
  )
}

export type PlayerTokenInteractions = {
  // The GM previewing the player view drags tokens; players select them.
  gmStreaming: boolean
  placing: boolean
  clearAnnotationPlacementTool: () => void
  startTokenDrag: (tokenId: string, event: TokenMouseEvent) => void
  handleTokenTouchStart: (tokenId: string, event: TokenTouchEvent) => void
  touchEnd: TouchEventHandler<HTMLButtonElement> | undefined
  togglePlayerTokenSelection: (tokenId: string) => void
}

function pressPlayerToken(interactions: PlayerTokenInteractions, tokenId: string, event: TokenMouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  if (interactions.placing) return
  interactions.clearAnnotationPlacementTool()
  if (interactions.gmStreaming) interactions.startTokenDrag(tokenId, event)
}

function clickPlayerToken(interactions: PlayerTokenInteractions, tokenId: string, event: TokenMouseEvent) {
  event.preventDefault()
  event.stopPropagation()
  interactions.clearAnnotationPlacementTool()
  if (!interactions.gmStreaming) interactions.togglePlayerTokenSelection(tokenId)
}

function touchPlayerToken(interactions: PlayerTokenInteractions, tokenId: string, event: TokenTouchEvent) {
  if (interactions.placing || !interactions.gmStreaming) return
  interactions.clearAnnotationPlacementTool()
  interactions.handleTokenTouchStart(tokenId, event)
}

type PlayerTokenItemProps = {
  token: TokenRecord
  index: number
  layer: TokenLayerKind
  gmEditing: boolean
  position: LivePosition
  selected: boolean
  dimensions: TokenDimensions
  isPartlyShown: (token: TokenRecord, position: LivePosition) => boolean
  interactions: PlayerTokenInteractions
}

// One token as players see it, in its layer, and under the fog only where some of
// it shows through.
export function PlayerTokenItem({ token, index, layer, gmEditing, position, selected, dimensions, isPartlyShown, interactions }: PlayerTokenItemProps) {
  if (!isInPlayerLayer(token, layer, gmEditing)) return null
  if (layer === 'under-fog' && !isPartlyShown(token, position)) return null
  const name = tokenDisplayName(token, index)
  return (
    <button
      type="button"
      className={playerTokenClassName(position.animating, selected)}
      style={tokenPositionStyle(position, token.color)}
      onMouseDown={(event) => pressPlayerToken(interactions, token.id, event)}
      onClick={(event) => clickPlayerToken(interactions, token.id, event)}
      onTouchStart={(event) => touchPlayerToken(interactions, token.id, event)}
      onTouchEnd={interactions.touchEnd}
      onTouchCancel={interactions.touchEnd}
      aria-label={name}
    >
      <TokenGlyph token={token} dimensions={dimensions} />
      {token.revealName ? (
        <span className="map-token-name" style={tokenNameStyle(token)}>
          {name}
        </span>
      ) : null}
    </button>
  )
}
