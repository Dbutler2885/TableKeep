import { useEffect, useState } from 'react'
import { MOBILE_BREAKPOINT } from '../../../constants/layout'

type MobileView = 'list' | 'detail'

const isMobileWidth = () => window.innerWidth <= MOBILE_BREAKPOINT

// Side by side on wide screens; on mobile, the list or the detail at a time.
const paneVisibility = (isMobile: boolean, mobileView: MobileView) => ({
  showListPane: !isMobile || mobileView === 'list',
  showDetailPane: !isMobile || mobileView === 'detail',
})

export function useNpcLayout() {
  const [isMobile, setIsMobile] = useState(isMobileWidth)
  const [mobileView, setMobileView] = useState<MobileView>('list')

  useEffect(() => {
    const updateMobileState = () => {
      const mobile = isMobileWidth()
      setIsMobile(mobile)
      if (!mobile) setMobileView('list')
    }
    window.addEventListener('resize', updateMobileState)
    return () => window.removeEventListener('resize', updateMobileState)
  }, [])

  return {
    isMobile,
    ...paneVisibility(isMobile, mobileView),
    showDetail: () => {
      if (isMobile) setMobileView('detail')
    },
    showList: () => setMobileView('list'),
  }
}
