import type { ComponentProps } from 'react'
import { ChessPawn, ChevronLeft, ChevronRight, Map as MapIcon, ScrollText } from 'lucide-react'
import { CharacterTab } from '../../character/CharacterTab'
import { customTokenIconUrl } from '../lib/placementSourceDisplay'
import type { PartyCharacterTokenPlacementSource } from '../lib/tokenPlacementQueue'
import { MobilePaneNav } from './MobilePaneNav'
import type { MapsTabModel } from './mapsTabModel'

type ModelProps = { model: MapsTabModel }
type GmCharacter = MapsTabModel['characters']['gmWorkspaceCharacters'][number]

function GmMapTab({ active, onSelect }: { active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={active ? 'map-gm-character-tab active' : 'map-gm-character-tab'}
      onClick={onSelect}
      aria-selected={active}
      role="tab"
    >
      <MapIcon size={15} />
      <span>Map</span>
    </button>
  )
}

function characterTabIcon(source: PartyCharacterTokenPlacementSource | undefined) {
  return {
    imageUrl: customTokenIconUrl(source?.tokenIcon),
    color: source?.tokenIcon?.color ?? '#b45309',
  }
}

type GmCharacterTabProps = {
  character: GmCharacter
  source: PartyCharacterTokenPlacementSource | undefined
  active: boolean
  onOpen: () => void
}

function GmCharacterTab({ character, source, active, onOpen }: GmCharacterTabProps) {
  const icon = characterTabIcon(source)
  return (
    <button
      type="button"
      className={active ? 'map-gm-character-tab active' : 'map-gm-character-tab'}
      onClick={onOpen}
      aria-selected={active}
      role="tab"
    >
      <span className="map-gm-character-tab-icon" style={{ color: icon.color }}>
        {icon.imageUrl ? <img src={icon.imageUrl} alt="" /> : <ChessPawn size={14} />}
      </span>
      <span>{character.name || 'Unnamed'}</span>
    </button>
  )
}

// In Map Run, the GM switches between the map and each party character's sheet.
export function GmCharacterTabs({ model }: ModelProps) {
  const { gmWorkspaceCharacters, selectedGmCharacter, openGmCharacterSheet } = model.characters
  const { desktopGmPane, setDesktopGmPane } = model.panes
  if (model.role !== 'gm' || gmWorkspaceCharacters.length === 0) return null
  const activeCharacterId = desktopGmPane === 'character' ? selectedGmCharacter?.id : undefined
  return (
    <div className="map-gm-character-tabs" role="tablist" aria-label="GM map workspace views">
      <GmMapTab active={desktopGmPane === 'map'} onSelect={() => setDesktopGmPane('map')} />
      {gmWorkspaceCharacters.map((character) => (
        <GmCharacterTab
          key={character.id}
          character={character}
          source={model.sources.partyPlacementSources.find((entry) => entry.id === character.id)}
          active={character.id === activeCharacterId}
          onOpen={() => openGmCharacterSheet(character.id)}
        />
      ))}
    </div>
  )
}

// On a phone, the GM pages through the party's sheets one at a time.
export function MobileGmCharacterPane({ model }: ModelProps) {
  const { gmWorkspaceCharacters, selectedGmCharacter, selectedGmCharacterTabProps, pageGmCharacter } = model.characters
  return (
    <div className="map-mobile-character-pane">
      <div className="map-mobile-character-pager">
        <button
          type="button"
          onClick={() => pageGmCharacter(-1)}
          disabled={gmWorkspaceCharacters.length <= 1}
          aria-label="Previous character sheet"
        >
          <ChevronLeft size={16} />
        </button>
        <span>{selectedGmCharacter?.name || 'Character Sheets'}</span>
        <button
          type="button"
          onClick={() => pageGmCharacter(1)}
          disabled={gmWorkspaceCharacters.length <= 1}
          aria-label="Next character sheet"
        >
          <ChevronRight size={16} />
        </button>
      </div>
      {selectedGmCharacterTabProps ? (
        <div className="map-embedded-character">
          <CharacterTab {...selectedGmCharacterTabProps} embeddedMode />
        </div>
      ) : (
        <div className="map-embedded-character map-empty-character-pane">
          <p>No character sheets available.</p>
        </div>
      )}
    </div>
  )
}

// The desktop GM's view of the selected party character's sheet.
export function GmEmbeddedCharacter({ tabProps }: { tabProps: ComponentProps<typeof CharacterTab> | null }) {
  return (
    <div className="map-embedded-character map-gm-embedded-character">
      {tabProps ? <CharacterTab {...tabProps} embeddedMode /> : <p>No character selected.</p>}
    </div>
  )
}

// A player with a character sheet switches between it and the map.
export function PlayerTopNav({ model, isGm }: ModelProps & { isGm: boolean }) {
  const { playerEmbeddedPane, setPlayerEmbeddedPane } = model.panes
  if (isGm || !model.characterTabProps) return null
  return (
    <div className="map-player-top-nav" role="tablist" aria-label="Player map views">
      <button
        type="button"
        className={playerEmbeddedPane === 'map' ? 'active' : ''}
        onClick={() => setPlayerEmbeddedPane('map')}
        aria-label="Show map"
      >
        <MapIcon size={16} />
        <span>Map</span>
      </button>
      <button
        type="button"
        className={playerEmbeddedPane === 'character' ? 'active' : ''}
        onClick={() => setPlayerEmbeddedPane('character')}
        aria-label="Show character sheet"
      >
        <ScrollText size={16} />
        <span>Character</span>
      </button>
    </div>
  )
}

export function PlayerEmbeddedCharacter({ model, isGm }: ModelProps & { isGm: boolean }) {
  const { characterTabProps } = model
  if (isGm || !characterTabProps || !model.panes.showEmbeddedCharacter) return null
  return (
    <div className="map-embedded-character">
      <CharacterTab {...characterTabProps} embeddedMode />
    </div>
  )
}

export function MapsMobileNav({ model, isGm }: ModelProps & { isGm: boolean }) {
  const { panes } = model
  return (
    <MobilePaneNav
      role={isGm ? 'gm' : 'player'}
      playerPane={panes.mobilePlayerPane}
      onPlayerPaneChange={panes.setMobilePlayerPane}
      gmPane={panes.mobileGmPane}
      onGmPaneChange={panes.setMobileGmPane}
      hasCharacters={Boolean(model.characterTabProps)}
      onBackToList={() => panes.setMobileMapView('list')}
      onOpenGmCharacters={model.characters.openGmCharacters}
    />
  )
}
