import { useEffect, useState } from 'react'
import { MOBILE_BREAKPOINT } from '../../../constants/layout'
import type { Role } from '../../../types/app'

export function useMapPaneVisibility({ role, phase, hasCharacterTab }: {
  role: Role | null
  phase: 'preview' | 'run'
  hasCharacterTab: boolean
}) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [mobileMapView, setMobileMapView] = useState<'list' | 'detail'>('list')
  const [mobileGmPane, setMobileGmPane] = useState<'map' | 'tokens' | 'characters'>('map')
  const [mobilePlayerPane, setMobilePlayerPane] = useState<'map' | 'controls' | 'character'>('map')
  const [playerEmbeddedPane, setPlayerEmbeddedPane] = useState<'map' | 'character'>('map')
  const [desktopGmPane, setDesktopGmPane] = useState<'map' | 'character'>('map')

  useEffect(() => {
    const updateMobileState = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (!mobile) {
        setMobileMapView('list')
        setMobileGmPane('map')
        setMobilePlayerPane('map')
      }
    }
    updateMobileState()
    window.addEventListener('resize', updateMobileState)
    return () => window.removeEventListener('resize', updateMobileState)
  }, [])

  const desktopGm = role === 'gm' && !isMobile
  const desktopGmRun = desktopGm && phase === 'run'
  const previewMode = desktopGm && phase === 'preview'
  const showListPane = isMobile ? mobileMapView === 'list' : !desktopGmRun
  const showMapPane = !isMobile || mobileMapView === 'detail'
  const showEmbeddedCharacter = role !== 'gm' && hasCharacterTab && (isMobile ? mobilePlayerPane === 'character' : playerEmbeddedPane === 'character')
  const showEmbeddedMap = role === 'gm' || !hasCharacterTab || (isMobile ? mobilePlayerPane !== 'character' : playerEmbeddedPane === 'map')

  return { isMobile, mobileMapView, setMobileMapView, mobileGmPane, setMobileGmPane, mobilePlayerPane, setMobilePlayerPane, playerEmbeddedPane, setPlayerEmbeddedPane, desktopGmPane, setDesktopGmPane, desktopGm, desktopGmRun, previewMode, showListPane, showMapPane, showEmbeddedCharacter, showEmbeddedMap }
}
