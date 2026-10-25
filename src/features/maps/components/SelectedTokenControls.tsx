import type { ReactNode } from 'react'
import { ALargeSmall, Binoculars, EyeOff, FlipHorizontal, FlipVertical, RotateCw, Tag, Trash2, User, Users } from 'lucide-react'
import { IconValueSlider } from '../../common/IconValueSlider'
import { activeClassName } from '../lib/activeClassName'
import { TOKEN_SIZE_MAX, TOKEN_SIZE_MIN } from '../lib/constants'
import { bulkTokenValues, everyTokenHas } from '../lib/selectedTokenSummary'
import { normalizeTokenRotation } from '../lib/tokenRotation'
import type { TokenRecord } from '../lib/types'
import { NpcSheetTokenAction } from './NpcSheetTokenAction'

export type TokenFieldUpdates = Partial<
  Pick<
    TokenRecord,
    | 'color'
    | 'size'
    | 'sizeScale'
    | 'rotationDeg'
    | 'flipHorizontal'
    | 'flipVertical'
    | 'viewDistance'
    | 'viewDistanceScale'
    | 'party'
    | 'name'
    | 'revealName'
    | 'hidden'
    | 'group'
  >
>

export type SelectedTokenControlsProps = {
  selectedTokens: TokenRecord[]
  tokenColor: string
  sameCategory: boolean
  onMakeGroup: () => void
  onRequestDeleteTokens: (tokenIds: string[]) => void
  onUpdateToken: (tokenId: string, updates: TokenFieldUpdates) => Promise<void>
  onUpdateTokenSize: (tokenId: string, size: number) => Promise<void>
  onUpdateTokenViewDistance: (tokenId: string, viewDistance: number) => Promise<void>
  tokenViewDistanceSliderValue: (token: TokenRecord) => number
}

function updateEach(tokens: TokenRecord[], update: (token: TokenRecord) => Promise<void>) {
  void Promise.all(tokens.map(update))
}

type SelectedTokenActionsProps = Pick<SelectedTokenControlsProps, 'selectedTokens' | 'sameCategory' | 'onMakeGroup' | 'onRequestDeleteTokens' | 'onUpdateToken'> & {
  color: string
}

// The selected-token row: delete, recolour and group the selection.
function SelectedTokenActions({ selectedTokens, color, sameCategory, onMakeGroup, onRequestDeleteTokens, onUpdateToken }: SelectedTokenActionsProps) {
  const none = selectedTokens.length === 0
  return (
    <div className="token-group-bulk-actions">
      <button
        type="button"
        className="token-group-delete fast-tooltip"
        onClick={() => onRequestDeleteTokens(selectedTokens.map((token) => token.id))}
        disabled={none}
        aria-label="Delete selected tokens"
        data-tooltip="Delete selected tokens"
      >
        <Trash2 size={14} />
      </button>
      <input
        type="color"
        value={color}
        disabled={none}
        onChange={(event) => {
          const nextColor = event.target.value
          updateEach(selectedTokens, (token) => onUpdateToken(token.id, { color: nextColor }))
        }}
        aria-label="Selected token color"
      />
      {sameCategory ? (
        <button
          type="button"
          className="token-group-make-group fast-tooltip"
          onClick={onMakeGroup}
          aria-label="Group selected tokens"
          data-tooltip="Make group"
        >
          <Users size={14} />
        </button>
      ) : null}
    </div>
  )
}

type TokenFlagToggleProps = {
  on: boolean
  disabled: boolean
  label: string
  tooltip: string
  onToggle: (next: boolean) => void
  children: ReactNode
}

function TokenFlagToggle({ on, disabled, label, tooltip, onToggle, children }: TokenFlagToggleProps) {
  return (
    <button
      type="button"
      className={activeClassName('token-toggle-btn map-icon-btn fast-tooltip', on)}
      onClick={() => onToggle(!on)}
      disabled={disabled}
      aria-label={label}
      data-tooltip={tooltip}
    >
      {children}
    </button>
  )
}

type SelectedTokenTogglesProps = Pick<SelectedTokenControlsProps, 'selectedTokens' | 'onUpdateToken' | 'tokenViewDistanceSliderValue'>

function SelectedTokenToggles({ selectedTokens, onUpdateToken, tokenViewDistanceSliderValue }: SelectedTokenTogglesProps) {
  const disabled = selectedTokens.length === 0
  const setFlag = (updates: (token: TokenRecord) => TokenFieldUpdates) => {
    updateEach(selectedTokens, (token) => onUpdateToken(token.id, updates(token)))
  }
  return (
    <div className="token-row-toggles token-group-bulk-toggles">
      <TokenFlagToggle
        on={everyTokenHas(selectedTokens, 'flipHorizontal')}
        disabled={disabled}
        label="Toggle selected horizontal mirror"
        tooltip="Mirror horizontal"
        onToggle={(flipHorizontal) => setFlag(() => ({ flipHorizontal }))}
      >
        <FlipHorizontal size={14} />
      </TokenFlagToggle>
      <TokenFlagToggle
        on={everyTokenHas(selectedTokens, 'flipVertical')}
        disabled={disabled}
        label="Toggle selected vertical mirror"
        tooltip="Mirror vertical"
        onToggle={(flipVertical) => setFlag(() => ({ flipVertical }))}
      >
        <FlipVertical size={14} />
      </TokenFlagToggle>
      <TokenFlagToggle
        on={everyTokenHas(selectedTokens, 'party')}
        disabled={disabled}
        label="Toggle selected party tokens"
        tooltip="Party token"
        onToggle={(party) => setFlag((token) => (party ? { party, viewDistance: tokenViewDistanceSliderValue(token) } : { party }))}
      >
        <User size={14} />
      </TokenFlagToggle>
      <TokenFlagToggle
        on={everyTokenHas(selectedTokens, 'revealName')}
        disabled={disabled}
        label="Toggle selected reveal names"
        tooltip="Reveal name"
        onToggle={(revealName) => setFlag(() => ({ revealName }))}
      >
        <Tag size={14} />
      </TokenFlagToggle>
      <TokenFlagToggle
        on={everyTokenHas(selectedTokens, 'hidden')}
        disabled={disabled}
        label="Toggle selected hidden tokens"
        tooltip="Hide token"
        onToggle={(hidden) => setFlag(() => ({ hidden }))}
      >
        <EyeOff size={14} />
      </TokenFlagToggle>
      <NpcSheetTokenAction selectedTokens={selectedTokens} />
    </div>
  )
}

type SelectedTokenViewDistanceProps = {
  partyTokens: TokenRecord[]
  value: number
  onUpdateTokenViewDistance: SelectedTokenControlsProps['onUpdateTokenViewDistance']
}

function SelectedTokenViewDistance({ partyTokens, value, onUpdateTokenViewDistance }: SelectedTokenViewDistanceProps) {
  if (partyTokens.length === 0) return null
  return (
    <div className="token-view-distance token-group-view-distance" aria-label="Selected token view distance">
      <span className="token-view-distance-icon fast-tooltip" data-tooltip="View Distance" aria-hidden>
        <Binoculars size={14} />
      </span>
      <input
        className="token-view-distance-slider"
        type="range"
        min={8}
        max={600}
        step={2}
        value={value}
        onChange={(event) => {
          const viewDistance = Number(event.target.value)
          updateEach(partyTokens, (token) => onUpdateTokenViewDistance(token.id, viewDistance))
        }}
      />
      <span className="token-view-distance-value">{value}</span>
    </div>
  )
}

// Edits every selected token at once; the controls show the first selected token's values.
export function SelectedTokenControls(props: SelectedTokenControlsProps) {
  const { selectedTokens, onUpdateToken } = props
  const values = bulkTokenValues(selectedTokens, props.tokenColor, props.tokenViewDistanceSliderValue)
  const none = selectedTokens.length === 0
  return (
    <div className="token-global-controls" aria-label="Selected token controls">
      <div className="token-global-controls-header">
        <h5 className="token-global-controls-title">Selected Tokens</h5>
        <span className="token-global-count">{selectedTokens.length}</span>
      </div>
      <SelectedTokenActions {...props} color={values.color} />
      <IconValueSlider
        className="token-row-size-row token-group-size-row"
        icon={<ALargeSmall size={14} />}
        tooltip="Token Size"
        value={values.size}
        min={TOKEN_SIZE_MIN}
        max={TOKEN_SIZE_MAX}
        step={1}
        disabled={none}
        ariaLabel="Selected token size"
        onChange={(nextSize) => updateEach(selectedTokens, (token) => props.onUpdateTokenSize(token.id, nextSize))}
      />
      <IconValueSlider
        className="token-row-size-row token-group-rotation-row"
        icon={<RotateCw size={14} />}
        tooltip="Rotation"
        value={values.rotation}
        min={0}
        max={359}
        step={1}
        disabled={none}
        ariaLabel="Selected token rotation"
        onChange={(rotationDeg) => {
          const nextRotation = normalizeTokenRotation(rotationDeg)
          updateEach(selectedTokens, (token) => onUpdateToken(token.id, { rotationDeg: nextRotation }))
        }}
      />
      <SelectedTokenToggles {...props} />
      <SelectedTokenViewDistance partyTokens={values.partyTokens} value={values.viewDistance} onUpdateTokenViewDistance={props.onUpdateTokenViewDistance} />
    </div>
  )
}
