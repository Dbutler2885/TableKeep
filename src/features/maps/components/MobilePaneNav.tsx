import { ChessPawn, ChevronLeft, Map as MapIcon, ScrollText, SlidersHorizontal } from 'lucide-react'

export function MobilePaneNav({ role, playerPane, onPlayerPaneChange, gmPane, onGmPaneChange, hasCharacters, onBackToList, onOpenGmCharacters }: {
  role: 'gm' | 'player'
  playerPane: 'map' | 'controls' | 'character'
  onPlayerPaneChange: (pane: 'map' | 'controls' | 'character') => void
  gmPane: 'map' | 'tokens' | 'characters'
  onGmPaneChange: (pane: 'map' | 'tokens' | 'characters') => void
  hasCharacters: boolean
  onBackToList: () => void
  onOpenGmCharacters: () => void
}) {
  return <div className="map-mobile-panel-nav">
    <button type="button" onClick={onBackToList} aria-label="Back to map list"><ChevronLeft size={16} /></button>
    <button type="button" className={(role === 'gm' ? gmPane : playerPane) === 'map' ? 'active' : ''} onClick={() => role === 'gm' ? onGmPaneChange('map') : onPlayerPaneChange('map')} disabled={(role === 'gm' ? gmPane : playerPane) === 'map'} aria-label="Map pane"><MapIcon size={16} /></button>
    {role === 'gm' ? <>
      <button type="button" className={gmPane === 'tokens' ? 'active' : ''} onClick={() => onGmPaneChange('tokens')} disabled={gmPane === 'tokens'} aria-label="Token panel"><ChessPawn size={16} /></button>
      {hasCharacters ? <button type="button" className={gmPane === 'characters' ? 'active' : ''} onClick={onOpenGmCharacters} disabled={gmPane === 'characters'} aria-label="Character sheets"><ScrollText size={16} /></button> : null}
    </> : <>
      <button type="button" className={playerPane === 'controls' ? 'active' : ''} onClick={() => onPlayerPaneChange('controls')} disabled={playerPane === 'controls'} aria-label="Controls pane"><SlidersHorizontal size={16} /></button>
      {hasCharacters ? <button type="button" className={playerPane === 'character' ? 'active' : ''} onClick={() => onPlayerPaneChange('character')} disabled={playerPane === 'character'} aria-label="Character pane"><ScrollText size={16} /></button> : null}
    </>}
  </div>
}
