import { useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { useNonPartyPlacement, type NonPartyPlacement, type NonPartySources } from '../hooks/useNonPartyPlacement'
import { GENERIC_CREATOR_KEY, placementSourceKey } from '../lib/nonPartyPlacement'
import type { TokenPlacementSource } from '../lib/tokenPlacementQueue'
import { NonPartyPlacementStage, type NonPartyPlacementStageProps } from './NonPartyPlacementStage'

export type NonPartyPlacementGroupProps = NonPartySources & Omit<NonPartyPlacementStageProps, 'picker'>

function SourceOptions({ sources }: { sources: TokenPlacementSource[] }) {
  return sources.map((source) => (
    <option key={placementSourceKey(source)} value={placementSourceKey(source)}>{source.name}</option>
  ))
}

function SourceOptionGroup({ label, sources }: { label: string; sources: TokenPlacementSource[] }) {
  if (sources.length === 0) return null
  return (
    <optgroup label={label}>
      <SourceOptions sources={sources} />
    </optgroup>
  )
}

function CreatorOption() {
  return <option value={GENERIC_CREATOR_KEY}>Generic asset...</option>
}

function GenericOptionGroup({ picker }: { picker: NonPartyPlacement }) {
  if (picker.visibleGenerics.length > 0) {
    return (
      <optgroup label="Generic assets">
        {picker.creatorVisible ? <CreatorOption /> : null}
        <SourceOptions sources={picker.visibleGenerics} />
      </optgroup>
    )
  }
  if (!picker.creatorVisible) return null
  return (
    <optgroup label="Generic assets">
      <CreatorOption />
    </optgroup>
  )
}

// A chosen source that the search hides still needs an option, so the picker can show it.
function HiddenChoiceOption({ picker }: { picker: NonPartyPlacement }) {
  if (!picker.selectedSource || picker.selectedKeyVisible) return null
  return <option value={placementSourceKey(picker.selectedSource)}>{picker.selectedSource.name}</option>
}

function pickerValue(picker: NonPartyPlacement) {
  if (picker.creatorSelected) return GENERIC_CREATOR_KEY
  return picker.selectedSource ? placementSourceKey(picker.selectedSource) : ''
}

function NonPartySourcePicker({ picker }: { picker: NonPartyPlacement }) {
  return (
    <div className="map-nonparty-picker">
      <input
        type="search"
        value={picker.search}
        onChange={(event) => picker.setSearch(event.target.value)}
        placeholder="Search monsters, NPCs, assets"
        aria-label="Search non-party token sources"
      />
      <div className="map-nonparty-source-row">
        <select
          value={pickerValue(picker)}
          onChange={(event) => picker.chooseSource(event.target.value)}
          aria-label="Select non-party token source"
        >
          <option value="">Choose a source</option>
          <HiddenChoiceOption picker={picker} />
          <SourceOptionGroup label="Monsters" sources={picker.visibleMonsters} />
          <SourceOptionGroup label="NPCs" sources={picker.visibleNpcs} />
          <GenericOptionGroup picker={picker} />
        </select>
        {picker.selectedSource || picker.creatorSelected ? (
          <button
            type="button"
            className="map-icon-btn map-nonparty-clear-btn fast-tooltip fast-tooltip-left"
            onClick={picker.clearSource}
            aria-label="Clear non-party token source"
            data-tooltip="Clear source"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function NonPartyPlacementBody({ picker, ...stageProps }: NonPartyPlacementGroupProps & { picker: NonPartyPlacement }) {
  return (
    <>
      <NonPartySourcePicker picker={picker} />
      <button
        type="button"
        className={picker.creatorSelected ? 'map-nonparty-upload-btn active' : 'map-nonparty-upload-btn'}
        onClick={() => picker.chooseSource(GENERIC_CREATOR_KEY)}
      >
        <Plus size={14} />
        <span>New token</span>
      </button>
      <NonPartyPlacementStage picker={picker} {...stageProps} />
    </>
  )
}

// Monsters, NPCs and generic assets: search, pick one, and place it.
export function NonPartyPlacementGroup(props: NonPartyPlacementGroupProps) {
  const [collapsed, setCollapsed] = useState(true)
  const picker = useNonPartyPlacement(props, props.setSelectedTokenAssetId)
  return (
    <div className="map-placement-group">
      <div className="map-placement-group-header">
        <span className="map-section-label">Non-party</span>
        <button
          type="button"
          className="map-icon-btn map-placement-collapse-btn fast-tooltip fast-tooltip-left"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? 'Show non-party token sources' : 'Hide non-party token sources'}
          data-tooltip={collapsed ? 'Show non-party' : 'Hide non-party'}
        >
          {collapsed ? <Plus size={13} /> : <Minus size={13} />}
        </button>
      </div>
      {!collapsed ? <NonPartyPlacementBody {...props} picker={picker} /> : null}
    </div>
  )
}
