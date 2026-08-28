import { useEffect, useRef, useState } from 'react'
import {
  CHARACTER_INTERMEDIATE_MAX_WIDTH,
  CHARACTER_MOBILE_INTERMEDIATE_MIN_WIDTH,
  CHARACTER_MOBILE_PORTRAIT_INTERMEDIATE_MIN_WIDTH,
  MOBILE_BREAKPOINT,
} from '../../../constants/layout'
import { isSinglePaneWidth, paneViewAfterResize, type CharacterPaneView } from '../characterPaneLayout'

type ResponsiveCharacterLayoutOptions = {
  /**
   * Whether the detail pane currently has something worth reading (a selected
   * character, grant mode, ...). Decides which pane survives when the layout
   * collapses to one.
   */
  hasOpenDetail?: boolean
}

export function useResponsiveCharacterLayout({ hasOpenDetail = false }: ResponsiveCharacterLayoutOptions = {}) {
  const [viewportWidth, setViewportWidth] = useState<number>(() => window.innerWidth)
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [isSinglePane, setIsSinglePane] = useState<boolean>(() => isSinglePaneWidth(window.innerWidth))
  const [paneView, setPaneView] = useState<CharacterPaneView>('list')
  const [activePage, setActivePage] = useState<'core' | 'encumbrance'>('core')
  const wasSinglePaneRef = useRef(isSinglePane)

  useEffect(() => {
    const updateLayoutState = () => {
      const width = window.innerWidth
      setViewportWidth(width)
      setIsMobile(width <= MOBILE_BREAKPOINT)

      const singlePane = isSinglePaneWidth(width)
      const nextView = paneViewAfterResize({
        wasSinglePane: wasSinglePaneRef.current,
        isSinglePane: singlePane,
        hasOpenDetail,
      })
      if (nextView) setPaneView(nextView)
      wasSinglePaneRef.current = singlePane
      setIsSinglePane(singlePane)
    }

    window.addEventListener('resize', updateLayoutState)
    return () => window.removeEventListener('resize', updateLayoutState)
  }, [hasOpenDetail])

  const showListPane = !isSinglePane || paneView === 'list'
  const showDetailPane = !isSinglePane || paneView === 'detail'
  const isIntermediateLayout = !isMobile && viewportWidth <= CHARACTER_INTERMEDIATE_MAX_WIDTH
  const isPortraitMobileLayout = isMobile && viewportWidth >= CHARACTER_MOBILE_PORTRAIT_INTERMEDIATE_MIN_WIDTH
  const isIntermediateMobileLayout = isMobile && viewportWidth >= CHARACTER_MOBILE_INTERMEDIATE_MIN_WIDTH
  const useIntermediateLayout = isIntermediateLayout || isPortraitMobileLayout

  return {
    isMobile,
    isSinglePane,
    paneView,
    setPaneView,
    activePage,
    setActivePage,
    showListPane,
    showDetailPane,
    isIntermediateMobileLayout,
    useIntermediateLayout,
  }
}
