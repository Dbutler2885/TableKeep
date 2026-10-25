import { Minus, Plus, Trash2 } from 'lucide-react'
import { TokenIconEditor, type TokenIconConfig } from '../../tokens/TokenIconEditor'
import type { NonPartyPlacement } from '../hooks/useNonPartyPlacement'
import { TOKEN_SIZE_MAX, TOKEN_SIZE_MIN } from '../lib/constants'
import { stagedGenericSource } from '../lib/nonPartyPlacement'
import type { GenericTokenPlacementSource, MonsterTokenPlacementSource, TokenPlacementSource } from '../lib/tokenPlacementQueue'
import type { TokenAssetRecord } from '../lib/types'
import { PlacementSourceIcon } from './PlacementSourceIcon'

type SinglePlacementSource = Exclude<TokenPlacementSource, MonsterTokenPlacementSource>

export type NonPartyPlacementStageProps = {
  picker: NonPartyPlacement
  tokenColor: string
  setTokenColor: (value: string) => void
  tokenSize: number
  setTokenSize: (value: number) => void
  tokenAssets: TokenAssetRecord[]
  selectedTokenAssetId: string
  setSelectedTokenAssetId: (value: string) => void
  selectedTokenImageUrl: string
  uploadingTokenImage: boolean
  onUploadTokenImage: (file: File, assetName?: string) => Promise<void>
  onArchiveTokenAsset: (assetId: string, archived: boolean) => Promise<void>
  onRequestDeleteTokenAsset: (assetId: string) => void
  genericPlacementSources: GenericTokenPlacementSource[]
  onStartSinglePlacement: (source: SinglePlacementSource) => void
  onStartMonsterPlacement: (source: MonsterTokenPlacementSource, count: number) => void
}

const STAGED_ROW_CLASS_NAMES: Record<TokenPlacementSource['kind'], string> = {
  monster: 'token-row map-placement-row',
  genericToken: 'token-row map-placement-row map-placement-row-manage',
  npc: 'token-row map-placement-row map-placement-row-simple',
  partyCharacter: 'token-row map-placement-row map-placement-row-simple',
}

type MonsterCountStepperProps = { source: MonsterTokenPlacementSource; picker: NonPartyPlacement }

function MonsterCountStepper({ source, picker }: MonsterCountStepperProps) {
  const count = picker.countFor(source.id)
  return (
    <div className="map-placement-stepper" aria-label={`${source.name} count`}>
      <button
        type="button"
        onClick={() => picker.setCount(source.id, count - 1)}
        aria-label="Decrease count"
      >
        <Minus size={12} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={count}
        onChange={(event) => picker.setCount(source.id, Number.parseInt(event.target.value, 10))}
        aria-label={`${source.name} placement count`}
      />
      <button
        type="button"
        onClick={() => picker.setCount(source.id, count + 1)}
        aria-label="Increase count"
      >
        <Plus size={12} />
      </button>
    </div>
  )
}

function DeleteGenericSourceButton({ source, onDelete }: { source: TokenPlacementSource; onDelete: (assetId: string) => void }) {
  return (
    <button
      type="button"
      className="map-icon-btn map-placement-delete-source-btn fast-tooltip fast-tooltip-left"
      onClick={() => onDelete(source.id)}
      aria-label={`Delete ${source.name}`}
      data-tooltip="Delete generic source"
    >
      <Trash2 size={13} />
    </button>
  )
}

type StagedSourceRowProps = Pick<NonPartyPlacementStageProps, 'picker' | 'tokenColor' | 'onRequestDeleteTokenAsset' | 'onStartSinglePlacement' | 'onStartMonsterPlacement'> & {
  source: TokenPlacementSource
}

function StagedSourceRow({ source, picker, tokenColor, onRequestDeleteTokenAsset, onStartSinglePlacement, onStartMonsterPlacement }: StagedSourceRowProps) {
  const place = () => {
    if (source.kind === 'monster') onStartMonsterPlacement(source, picker.countFor(source.id))
    else onStartSinglePlacement(source)
  }
  return (
    <div className={STAGED_ROW_CLASS_NAMES[source.kind]}>
      <PlacementSourceIcon source={source} fallbackColor={tokenColor} />
      <span className="map-placement-source-name">{source.name}</span>
      {source.kind === 'monster' ? <MonsterCountStepper source={source} picker={picker} /> : null}
      {source.kind === 'genericToken' ? <DeleteGenericSourceButton source={source} onDelete={onRequestDeleteTokenAsset} /> : null}
      <button type="button" className="monster-example-btn" onClick={place}>
        Place
      </button>
    </div>
  )
}

type GenericAssetStageProps = Omit<NonPartyPlacementStageProps, 'onStartMonsterPlacement'>

function GenericAssetStage(props: GenericAssetStageProps) {
  const { picker, tokenColor, tokenSize, selectedTokenAssetId } = props
  const selectedAsset = props.genericPlacementSources.find((source) => source.id === selectedTokenAssetId) ?? null
  const staged = stagedGenericSource(selectedAsset, picker.genericTokenName, tokenColor, tokenSize)
  return (
    <div className="map-generic-asset-stage">
      <TokenIconEditor
        className="map-token-icon-editor"
        minSize={TOKEN_SIZE_MIN}
        maxSize={TOKEN_SIZE_MAX}
        value={{ icon: selectedTokenAssetId ? 'custom' : 'pawn', color: tokenColor, size: tokenSize } satisfies TokenIconConfig}
        onChange={(next) => {
          props.setTokenColor(next.color)
          props.setTokenSize(next.size)
        }}
        tokenAssets={props.tokenAssets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          imageUrl: asset.imageUrl,
          archived: asset.archived,
        }))}
        selectedTokenAssetId={selectedTokenAssetId}
        onSelectedTokenAssetIdChange={props.setSelectedTokenAssetId}
        onArchiveTokenAsset={props.onArchiveTokenAsset}
        onRequestDeleteTokenAsset={props.onRequestDeleteTokenAsset}
        selectedTokenImageUrl={props.selectedTokenImageUrl}
        uploadingTokenImage={props.uploadingTokenImage}
        uploadAssetName={picker.genericTokenName}
        uploadAssetNameLabel="Token name"
        onUploadAssetNameChange={picker.setGenericTokenName}
        onUploadTokenImage={props.onUploadTokenImage}
      />
      <div className="token-row map-placement-row map-placement-row-simple">
        <PlacementSourceIcon source={staged} fallbackColor={tokenColor} />
        <span className="map-placement-source-name">{staged.name}</span>
        <button
          type="button"
          className="monster-example-btn"
          onClick={() => props.onStartSinglePlacement(staged)}
        >
          Place
        </button>
      </div>
    </div>
  )
}

// What the picker would place: the chosen source, the new token creator, or a prompt.
export function NonPartyPlacementStage(props: NonPartyPlacementStageProps) {
  const { picker } = props
  return (
    <div className="map-placement-stage">
      {picker.selectedSource ? (
        <StagedSourceRow source={picker.selectedSource} {...props} />
      ) : picker.creatorSelected ? (
        <GenericAssetStage {...props} />
      ) : (
        <p className="map-npc-scene-empty">Choose a monster, NPC, or generic asset.</p>
      )}
    </div>
  )
}
