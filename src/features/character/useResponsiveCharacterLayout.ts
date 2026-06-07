import { useEffect, useState } from 'react'
import {
  CHARACTER_INTERMEDIATE_MAX_WIDTH,
  CHARACTER_MOBILE_INTERMEDIATE_MIN_WIDTH,
  CHARACTER_MOBILE_PORTRAIT_INTERMEDIATE_MIN_WIDTH,
  MOBILE_BREAKPOINT,
} from '../../constants/layout'

export function useResponsiveCharacterLayout() {
  const [viewportWidth, setViewportWidth] = useState<number>(() => window.innerWidth)
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [mobileCharacterView, setMobileCharacterView] = useState<'list' | 'detail'>('list')
  const [activePage, setActivePage] = useState<'core' | 'encumbrance'>('core')

  useEffect(() => {
    const updateMobileState = () => {
      const width = window.innerWidth
      setViewportWidth(width)
      const mobile = width <= MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (!mobile) setMobileCharacterView('list')
    }

    updateMobileState()
    window.addEventListener('resize', updateMobileState)
    return () => window.removeEventListener('resize', updateMobileState)
  }, [])

  const showListPane = !isMobile || mobileCharacterView === 'list'
  const showDetailPane = !isMobile || mobileCharacterView === 'detail'
  const isIntermediateLayout = !isMobile && viewportWidth <= CHARACTER_INTERMEDIATE_MAX_WIDTH
  const isPortraitMobileLayout = isMobile && viewportWidth >= CHARACTER_MOBILE_PORTRAIT_INTERMEDIATE_MIN_WIDTH
  const isIntermediateMobileLayout = isMobile && viewportWidth >= CHARACTER_MOBILE_INTERMEDIATE_MIN_WIDTH
  const useIntermediateLayout = isIntermediateLayout || isPortraitMobileLayout

  return {
    isMobile,
    mobileCharacterView,
    setMobileCharacterView,
    activePage,
    setActivePage,
    showListPane,
    showDetailPane,
    isIntermediateMobileLayout,
    useIntermediateLayout,
  }
}
