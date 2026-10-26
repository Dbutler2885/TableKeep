import type { Dispatch, SetStateAction } from 'react'
import type { Role } from '../../../types/app'

type MapSelectionOptions = {
  role: Role | null
  selectedMapId: string
  setSelectedMapId: (mapId: string) => void
  forgetMapSize: () => void
  resetPlayerViewport: () => void
  resetToPreview: () => void
  isMobile: boolean
  setMobileMapView: Dispatch<SetStateAction<'list' | 'detail'>>
  setMobileGmPane: Dispatch<SetStateAction<'map' | 'tokens' | 'characters'>>
  setMobilePlayerPane: Dispatch<SetStateAction<'map' | 'controls' | 'character'>>
  setPlayerEmbeddedPane: Dispatch<SetStateAction<'map' | 'character'>>
}

function showMapPaneOnPhone(options: MapSelectionOptions) {
  options.setMobileMapView('detail')
  if (options.role === 'gm') {
    options.setMobileGmPane('map')
    return
  }
  options.setMobilePlayerPane('map')
  options.setPlayerEmbeddedPane('map')
}

// Selecting a map from the list. A different map starts unmeasured, the view is
// reset, the desktop GM always lands in Map Preview, and a phone opens the map.
export function selectMapFrom(options: MapSelectionOptions, mapId: string) {
  if (mapId !== options.selectedMapId) options.forgetMapSize()
  options.setSelectedMapId(mapId)
  options.resetPlayerViewport()
  options.resetToPreview()
  if (options.isMobile) showMapPaneOnPhone(options)
}
